import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { COLLECTIONS, db, auth, SUPERADMIN_EMAIL, DEFAULT_REGION } from '../config';
import { ROLES } from '@botrade/shared';

/**
 * Sincroniza el rol del usuario autenticado según su email.
 * Útil para corregir casos donde el rol no quedó asignado correctamente
 * (por ejemplo, usuarios creados antes de los triggers o con claims desfasados).
 */
export const syncRole = onCall(
  {
    region: DEFAULT_REGION,
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      logger.warn('syncRole called without authentication');
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const uid = request.auth.uid;
    logger.info(`syncRole invoked for uid ${uid}`);

    try {
      let email: string | undefined;
      let displayName: string | null = null;

      try {
        const userRecord = await auth.getUser(uid);
        email = userRecord.email?.toLowerCase();
        displayName = userRecord.displayName || null;
        logger.info(`Fetched user record for ${uid}, email: ${email || 'N/A'}`);
      } catch (authError) {
        logger.warn(`auth.getUser failed for ${uid}, falling back to token claims`, authError);
        const tokenEmail = (request.auth.token.email as string | undefined)?.toLowerCase();
        const tokenName = (request.auth.token.name as string | undefined) || null;
        email = tokenEmail;
        displayName = tokenName;
      }

      if (!email) {
        logger.error(`Could not determine email for user ${uid}`);
        throw new HttpsError('failed-precondition', 'No se pudo determinar el email del usuario');
      }

      const role = email === SUPERADMIN_EMAIL ? ROLES.SUPERADMIN : ROLES.USER;
      logger.info(`Resolved role ${role} for user ${uid}`);

      await auth.setCustomUserClaims(uid, { role });

      const userRef = db.collection(COLLECTIONS.USERS).doc(uid);
      const userDoc = await userRef.get();
      const now = new Date().toISOString();

      if (userDoc.exists) {
        await userRef.update({
          role,
          updatedAt: now,
        });
      } else {
        await userRef.set({
          uid,
          email,
          displayName,
          role,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
      }

      logger.info(`Synced role ${role} for user ${uid}`);
      return { success: true, uid, role };
    } catch (error) {
      logger.error(`Error syncing role for user ${uid}:`, error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'Error interno al sincronizar el rol');
    }
  }
);
