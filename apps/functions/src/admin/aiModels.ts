import { randomUUID } from 'node:crypto';
import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { z } from 'zod';
import {
  AI_MODEL_PROVIDERS,
  type AiModel,
  type AiModelProvider,
  type AiModelPublic,
  maskApiKey,
} from '@botrade/shared';
import { COLLECTIONS, DEFAULT_REGION, db } from '../config';
import { isValidRole, ROLES } from '@botrade/shared';
import { consultGemini } from '../ai/providers/gemini';
import { consultDeepseek } from '../ai/providers/deepseek';

function requireSuperAdmin(request: CallableRequest<unknown>): void {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  const role = (request.auth.token as { role?: unknown } | undefined)?.role;
  if (!isValidRole(role) || role !== ROLES.SUPERADMIN) {
    throw new HttpsError('permission-denied', 'Solo los superadmins pueden gestionar modelos de IA');
  }
}

function toPublic(model: AiModel): AiModelPublic {
  const configured = typeof model.apiKey === 'string' && model.apiKey.length > 0;
  return {
    id: model.id,
    provider: model.provider,
    model: model.model,
    label: model.label,
    isActive: model.isActive,
    configured,
    maskedKey: configured ? maskApiKey(model.apiKey) : null,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
  };
}

function readModel(id: string): Promise<AiModel | null> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(db.collection(COLLECTIONS.AI_MODELS).doc(id));
    if (!snap.exists) return null;
    const data = snap.data() as Partial<AiModel> | undefined;
    if (!data) return null;
    return {
      id: snap.id,
      provider: data.provider as AiModelProvider,
      model: String(data.model ?? ''),
      apiKey: String(data.apiKey ?? ''),
      label: String(data.label ?? ''),
      isActive: data.isActive !== false,
      createdAt: String(data.createdAt ?? ''),
      updatedAt: String(data.updatedAt ?? ''),
    };
  });
}

const providerSchema = z.enum(AI_MODEL_PROVIDERS);

const upsertSchema = z.object({
  id: z.string().min(1).max(128).optional(),
  provider: providerSchema,
  model: z.string().min(1).max(128),
  apiKey: z.string().min(1).max(512).optional(),
  label: z.string().max(120).optional(),
  isActive: z.boolean().optional(),
});

const deleteSchema = z.object({ id: z.string().min(1).max(128) });

const setDefaultSchema = z.object({
  id: z.string().min(1).max(128).nullable(),
});

const testSchema = z.object({ id: z.string().min(1).max(128) });

interface AiTestResult {
  ok: boolean;
  status: number;
  provider: AiModelProvider;
  model: string;
  message: string;
}

async function pingModel(model: AiModel): Promise<AiTestResult> {
  if (model.provider === 'gemini') {
    const result = await consultGemini({
      apiKey: model.apiKey,
      model: model.model,
      system: 'Respond only with the word pong.',
      user: 'ping',
      maxOutputTokens: 4,
    });
    return {
      ok: result.ok,
      status: result.status,
      provider: 'gemini',
      model: model.model,
      message: result.ok ? 'OK — respuesta recibida' : `Gemini devolvió error: ${result.error ?? 'desconocido'}`,
    };
  }
  const result = await consultDeepseek({
    apiKey: model.apiKey,
    model: model.model,
    system: 'Respond only with the word pong.',
    user: 'ping',
    maxOutputTokens: 4,
  });
  return {
    ok: result.ok,
    status: result.status,
    provider: 'deepseek',
    model: model.model,
    message: result.ok ? 'OK — respuesta recibida' : `DeepSeek devolvió error: ${result.error ?? 'desconocido'}`,
  };
}

export const listAiModels = onCall(
  { region: DEFAULT_REGION, cors: true },
  async (request) => {
    requireSuperAdmin(request);
    try {
      const snap = await db.collection(COLLECTIONS.AI_MODELS).get();
      const models = snap.docs
        .map((d) => {
          const data = d.data() as Partial<AiModel> | undefined;
          if (!data) return null;
          const parsed: AiModel = {
            id: d.id,
            provider: data.provider as AiModelProvider,
            model: String(data.model ?? ''),
            apiKey: String(data.apiKey ?? ''),
            label: String(data.label ?? ''),
            isActive: data.isActive !== false,
            createdAt: String(data.createdAt ?? ''),
            updatedAt: String(data.updatedAt ?? ''),
          };
          return parsed;
        })
        .filter((m): m is AiModel => m !== null)
        .sort((a, b) => a.label.localeCompare(b.label));
      return { models: models.map(toPublic) };
    } catch (error) {
      logger.error('Error al listar modelos de IA:', error);
      throw new HttpsError('internal', 'No se pudieron listar los modelos de IA');
    }
  }
);

export const upsertAiModel = onCall(
  { region: DEFAULT_REGION, cors: true },
  async (request) => {
    requireSuperAdmin(request);
    const parsed = upsertSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'Datos inválidos', parsed.error.flatten());
    }
    const { id, provider, model, apiKey, label, isActive } = parsed.data;
    const now = new Date().toISOString();

    try {
      const col = db.collection(COLLECTIONS.AI_MODELS);
      if (id) {
        const ref = col.doc(id);
        const existing = await ref.get();
        if (!existing.exists) {
          throw new HttpsError('not-found', `Modelo ${id} no existe`);
        }
        const previous = existing.data() as Partial<AiModel> | undefined;
        const createdAt = String(previous?.createdAt ?? now);
        const finalLabel =
          label && label.trim().length > 0
            ? label.trim()
            : String(previous?.label ?? `${provider} · ${model}`);
        const finalApiKey =
          apiKey && apiKey.length > 0 ? apiKey : String(previous?.apiKey ?? '');
        const data: AiModel = {
          id,
          provider,
          model,
          apiKey: finalApiKey,
          label: finalLabel,
          isActive: isActive ?? previous?.isActive ?? true,
          createdAt,
          updatedAt: now,
        };
        await ref.set(data, { merge: false });
        logger.info(`Modelo IA ${id} actualizado por ${request.auth!.uid}`);
        return { success: true, model: toPublic(data) };
      }

      if (!apiKey || apiKey.length === 0) {
        throw new HttpsError('invalid-argument', 'La API key es obligatoria al crear un modelo');
      }
      const newId = randomUUID();
      const finalLabel = label && label.trim().length > 0 ? label.trim() : `${provider} · ${model}`;
      const data: AiModel = {
        id: newId,
        provider,
        model,
        apiKey,
        label: finalLabel,
        isActive: isActive ?? true,
        createdAt: now,
        updatedAt: now,
      };
      await col.doc(newId).set(data);
      logger.info(`Modelo IA ${newId} creado por ${request.auth!.uid}`);
      return { success: true, model: toPublic(data) };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error('Error al guardar el modelo de IA:', error);
      throw new HttpsError('internal', 'No se pudo guardar el modelo de IA');
    }
  }
);

export const deleteAiModel = onCall(
  { region: DEFAULT_REGION, cors: true },
  async (request) => {
    requireSuperAdmin(request);
    const parsed = deleteSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'Datos inválidos', parsed.error.flatten());
    }
    const { id } = parsed.data;
    try {
      await db.runTransaction(async (tx) => {
        const ref = db.collection(COLLECTIONS.AI_MODELS).doc(id);
        tx.delete(ref);
        const configRef = db.collection(COLLECTIONS.ADMIN_CONFIG).doc('aiConfig');
        const configSnap = await tx.get(configRef);
        if (configSnap.exists) {
          const data = configSnap.data() as { defaultAiModelId?: string } | undefined;
          if (data?.defaultAiModelId === id) {
            tx.set(configRef, { defaultAiModelId: null, updatedAt: new Date().toISOString() }, { merge: true });
          }
        }
      });
      logger.info(`Modelo IA ${id} eliminado por ${request.auth!.uid}`);
      return { success: true };
    } catch (error) {
      logger.error(`Error al eliminar el modelo de IA ${id}:`, error);
      throw new HttpsError('internal', 'No se pudo eliminar el modelo de IA');
    }
  }
);

export const setDefaultAiModel = onCall(
  { region: DEFAULT_REGION, cors: true },
  async (request) => {
    requireSuperAdmin(request);
    const parsed = setDefaultSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'Datos inválidos', parsed.error.flatten());
    }
    const { id } = parsed.data;
    try {
      if (id !== null) {
        const model = await readModel(id);
        if (!model) {
          throw new HttpsError('not-found', `Modelo ${id} no existe`);
        }
      }
      await db
        .collection(COLLECTIONS.ADMIN_CONFIG)
        .doc('aiConfig')
        .set({ defaultAiModelId: id, updatedAt: new Date().toISOString() }, { merge: true });
      logger.info(`Default IA actualizado a ${id ?? 'null'} por ${request.auth!.uid}`);
      return { success: true, defaultAiModelId: id };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error('Error al setear default de IA:', error);
      throw new HttpsError('internal', 'No se pudo setear el modelo por defecto');
    }
  }
);

export const getAiConfig = onCall(
  { region: DEFAULT_REGION, cors: true },
  async (request) => {
    requireSuperAdmin(request);
    try {
      const configSnap = await db
        .collection(COLLECTIONS.ADMIN_CONFIG)
        .doc('aiConfig')
        .get();
      const defaultAiModelId =
        configSnap.exists && typeof configSnap.get('defaultAiModelId') === 'string'
          ? (configSnap.get('defaultAiModelId') as string)
          : null;

      const snap = await db.collection(COLLECTIONS.AI_MODELS).get();
      const models = snap.docs
        .map((d) => {
          const data = d.data() as Partial<AiModel> | undefined;
          if (!data) return null;
          return {
            id: d.id,
            provider: data.provider as AiModelProvider,
            model: String(data.model ?? ''),
            apiKey: String(data.apiKey ?? ''),
            label: String(data.label ?? ''),
            isActive: data.isActive !== false,
            createdAt: String(data.createdAt ?? ''),
            updatedAt: String(data.updatedAt ?? ''),
          } satisfies AiModel;
        })
        .filter((m): m is AiModel => m !== null)
        .sort((a, b) => a.label.localeCompare(b.label));

      return {
        defaultAiModelId,
        models: models.map(toPublic),
      };
    } catch (error) {
      logger.error('Error al obtener configuración de IA:', error);
      throw new HttpsError('internal', 'No se pudo obtener la configuración de IA');
    }
  }
);

export const testAiModel = onCall(
  { region: DEFAULT_REGION, cors: true },
  async (request) => {
    requireSuperAdmin(request);
    const parsed = testSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'Datos inválidos', parsed.error.flatten());
    }
    const { id } = parsed.data;
    const model = await readModel(id);
    if (!model) {
      throw new HttpsError('not-found', `Modelo ${id} no existe`);
    }
    if (!model.isActive) {
      return {
        ok: false,
        status: 400,
        provider: model.provider,
        model: model.model,
        message: 'El modelo está inactivo. Activalo antes de probarlo.',
      } satisfies AiTestResult;
    }
    if (!model.apiKey) {
      return {
        ok: false,
        status: 400,
        provider: model.provider,
        model: model.model,
        message: 'El modelo no tiene API key configurada',
      } satisfies AiTestResult;
    }
    const result = await pingModel(model);
    logger.info(`[testAiModel] ${model.provider}/${model.model} → ${result.status} ${result.message}`);
    return result;
  }
);
