import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { z } from 'zod';
import { COLLECTIONS, DEFAULT_REGION, db } from '../config';
import { isValidRole, ROLES } from '@botrade/shared';

const DEFAULT_CACHE_TTL_SECONDS = 900;
const MIN_CACHE_TTL_SECONDS = 60;
const MAX_CACHE_TTL_SECONDS = 86400;

function requireSuperAdmin(request: CallableRequest<unknown>): void {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  const role = (request.auth.token as { role?: unknown } | undefined)?.role;
  if (!isValidRole(role) || role !== ROLES.SUPERADMIN) {
    throw new HttpsError('permission-denied', 'Solo los superadmins pueden modificar la configuración de mercado');
  }
}

const setSchema = z.object({
  cacheTtlSeconds: z
    .number()
    .int()
    .min(MIN_CACHE_TTL_SECONDS)
    .max(MAX_CACHE_TTL_SECONDS),
});

async function readMarketDataConfig(): Promise<{ cacheTtlSeconds: number; updatedAt: string | null }> {
  const snap = await db.collection(COLLECTIONS.ADMIN_CONFIG).doc('marketData').get();
  if (!snap.exists) {
    return { cacheTtlSeconds: DEFAULT_CACHE_TTL_SECONDS, updatedAt: null };
  }
  const data = snap.data() as { cacheTtlSeconds?: unknown; updatedAt?: unknown } | undefined;
  const raw = Number(data?.cacheTtlSeconds);
  const cacheTtlSeconds =
    Number.isFinite(raw) && raw >= MIN_CACHE_TTL_SECONDS && raw <= MAX_CACHE_TTL_SECONDS
      ? raw
      : DEFAULT_CACHE_TTL_SECONDS;
  const updatedAt = typeof data?.updatedAt === 'string' ? data.updatedAt : null;
  return { cacheTtlSeconds, updatedAt };
}

export const getMarketDataConfig = onCall(
  {
    region: DEFAULT_REGION,
    cors: true,
  },
  async (request) => {
    requireSuperAdmin(request);
    try {
      const config = await readMarketDataConfig();
      return { ...config, defaultCacheTtlSeconds: DEFAULT_CACHE_TTL_SECONDS };
    } catch (err) {
      logger.error('Error al leer la configuración de mercado:', err);
      throw new HttpsError('internal', 'No se pudo leer la configuración de mercado');
    }
  }
);

export const setMarketDataConfig = onCall(
  {
    region: DEFAULT_REGION,
    cors: true,
  },
  async (request) => {
    requireSuperAdmin(request);

    const parsed = setSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError(
        'invalid-argument',
        `cacheTtlSeconds debe estar entre ${MIN_CACHE_TTL_SECONDS} y ${MAX_CACHE_TTL_SECONDS}`,
        parsed.error.flatten()
      );
    }

    const { cacheTtlSeconds } = parsed.data;
    const updatedAt = new Date().toISOString();
    try {
      await db
        .collection(COLLECTIONS.ADMIN_CONFIG)
        .doc('marketData')
        .set({ cacheTtlSeconds, updatedAt }, { merge: true });
      logger.info(`marketData config actualizada por ${request.auth!.uid}: cacheTtlSeconds=${cacheTtlSeconds}`);
      return { success: true, cacheTtlSeconds, updatedAt };
    } catch (err) {
      logger.error('Error al guardar la configuración de mercado:', err);
      throw new HttpsError('internal', 'No se pudo guardar la configuración de mercado');
    }
  }
);
