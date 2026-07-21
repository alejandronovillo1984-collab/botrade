import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { z } from 'zod';
import { COLLECTIONS, DEFAULT_REGION, db } from '../config';
import {
  API_KEY_PROVIDERS,
  ROLES,
  isValidRole,
  type ApiKeyProvider,
} from '@botrade/shared';

const LEGACY_FIELDS_TO_CLEAN = ['fmp', 'massive'];

const setSchema = z.object({
  provider: z.enum(API_KEY_PROVIDERS),
  apiKey: z.string().min(1).max(512),
});

const clearSchema = z.object({
  provider: z.enum(API_KEY_PROVIDERS),
  clear: z.literal(true),
});

function requireSuperAdmin(request: CallableRequest<unknown>): void {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  const role = (request.auth.token as { role?: unknown } | undefined)?.role;
  if (!isValidRole(role) || role !== ROLES.SUPERADMIN) {
    throw new HttpsError('permission-denied', 'Solo los superadmins pueden modificar API keys');
  }
}

export const setAdminApiKey = onCall(
  {
    region: DEFAULT_REGION,
    cors: true,
  },
  async (request) => {
    requireSuperAdmin(request);

    const cleared = clearSchema.safeParse(request.data);
    if (cleared.success) {
      try {
        await db
          .collection(COLLECTIONS.ADMIN_CONFIG)
          .doc('apiKeys')
          .set(
            { [cleared.data.provider]: null, updatedAt: new Date().toISOString() },
            { merge: true }
          );
        logger.info(`API key ${cleared.data.provider} eliminada por ${request.auth!.uid}`);
        return { success: true, provider: cleared.data.provider, cleared: true };
      } catch (error) {
        logger.error(`Error al limpiar la API key ${cleared.data.provider}:`, error);
        throw new HttpsError('internal', 'No se pudo limpiar la API key');
      }
    }

    const parsed = setSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'Datos inválidos', parsed.error.flatten());
    }

    const { provider, apiKey } = parsed.data;
    try {
      const ref = db.collection(COLLECTIONS.ADMIN_CONFIG).doc('apiKeys');
      await ref.set(
        { [provider]: apiKey, updatedAt: new Date().toISOString() },
        { merge: true }
      );

      const previous = await ref.get();
      const cleanup: Record<string, unknown> = {};
      for (const field of LEGACY_FIELDS_TO_CLEAN) {
        if (field !== provider && previous.get(field)) {
          cleanup[field] = null;
        }
      }
      if (Object.keys(cleanup).length > 0) {
        await ref.set(cleanup, { merge: true });
        logger.info(`Limpiados campos legacy: ${Object.keys(cleanup).join(', ')}`);
      }

      logger.info(`API key ${provider} actualizada por ${request.auth!.uid}`);
      return { success: true, provider, cleared: false };
    } catch (error) {
      logger.error(`Error al guardar la API key ${provider}:`, error);
      throw new HttpsError('internal', 'No se pudo guardar la API key');
    }
  }
);

export const getAdminApiKeys = onCall(
  {
    region: DEFAULT_REGION,
    cors: true,
  },
  async (request) => {
    requireSuperAdmin(request);

    try {
      const snap = await db.collection(COLLECTIONS.ADMIN_CONFIG).doc('apiKeys').get();
      if (!snap.exists) {
        return {
          providers: API_KEY_PROVIDERS.map((p) => ({
            provider: p,
            configured: false,
            maskedKey: null,
          })),
        };
      }
      const data = snap.data() ?? {};
      return {
        providers: API_KEY_PROVIDERS.map((p) => {
          const value = data[p as ApiKeyProvider];
          if (typeof value !== 'string' || value.length === 0) {
            return { provider: p, configured: false, maskedKey: null };
          }
          const last4 = value.slice(-4);
          return {
            provider: p,
            configured: true,
            maskedKey: `••••••••${last4}`,
          };
        }),
      };
    } catch (error) {
      logger.error('Error al obtener las API keys:', error);
      throw new HttpsError('internal', 'No se pudieron obtener las API keys');
    }
  }
);
