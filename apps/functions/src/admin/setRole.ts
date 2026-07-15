import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { COLLECTIONS, db, auth, DEFAULT_REGION } from '../config';
import { ROLES, Role, isValidRole } from '@botrade/shared';
import { z } from 'zod';

const setRoleSchema = z.object({
  uid: z.string().min(1),
  role: z.nativeEnum(ROLES),
});

/**
 * Solo un superadmin puede cambiar el rol de otro usuario.
 */
export const setRole = onCall(
  {
    region: DEFAULT_REGION,
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const callerRole = request.auth.token.role;
    if (!isValidRole(callerRole) || callerRole !== ROLES.SUPERADMIN) {
      throw new HttpsError('permission-denied', 'Solo los superadmins pueden cambiar roles');
    }

    let input;
    try {
      input = setRoleSchema.parse(request.data);
    } catch (error) {
      throw new HttpsError('invalid-argument', 'Datos inválidos', error);
    }

    const { uid, role } = input;

    try {
      await auth.setCustomUserClaims(uid, { role });
      await db.collection(COLLECTIONS.USERS).doc(uid).update({
        role,
        updatedAt: new Date().toISOString(),
      });
      logger.info(`Role changed to ${role} for user ${uid} by ${request.auth.uid}`);
      return { success: true, uid, role };
    } catch (error) {
      logger.error(`Error setting role for user ${uid}:`, error);
      throw new HttpsError('internal', 'Error interno al cambiar el rol');
    }
  }
);

/**
 * Obtiene el perfil de un usuario (solo superadmin o el propio usuario).
 */
export const getUserProfile = onCall(
  {
    region: DEFAULT_REGION,
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const { uid } = request.data;
    if (typeof uid !== 'string' || !uid) {
      throw new HttpsError('invalid-argument', 'UID inválido');
    }

    const callerRole = request.auth.token.role;
    const isOwnProfile = request.auth.uid === uid;

    if ((!isValidRole(callerRole) || callerRole !== ROLES.SUPERADMIN) && !isOwnProfile) {
      throw new HttpsError('permission-denied', 'No tenés permiso para ver este perfil');
    }

    try {
      const userDoc = await db.collection(COLLECTIONS.USERS).doc(uid).get();
      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'Usuario no encontrado');
      }
      return { uid, ...userDoc.data() };
    } catch (error) {
      logger.error(`Error fetching user profile ${uid}:`, error);
      throw new HttpsError('internal', 'Error interno al obtener el perfil');
    }
  }
);
