import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { z } from 'zod';
import { ROLES, Role, isValidRole } from '@botrade/shared';
import { COLLECTIONS, db, auth, DEFAULT_REGION } from '../config';

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  displayName: z.string().min(1).max(80).optional(),
  role: z.nativeEnum(ROLES).optional(),
});

const updateUserSchema = z.object({
  uid: z.string().min(1),
  displayName: z.string().min(1).max(80).nullable().optional(),
  isActive: z.boolean().optional(),
  role: z.nativeEnum(ROLES).optional(),
});

const deleteUserSchema = z.object({
  uid: z.string().min(1),
});

function requireSuperAdmin(request: { auth?: { token: Record<string, unknown>; uid: string } }): void {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  const role = request.auth.token.role;
  if (!isValidRole(role) || role !== ROLES.SUPERADMIN) {
    throw new HttpsError('permission-denied', 'Solo los superadmins pueden gestionar usuarios');
  }
}

function ensureCanChangeRole(
  currentRole: Role | undefined,
  nextRole: Role,
  uid: string,
  callerUid: string
): void {
  if (uid !== callerUid) return;
  if (currentRole === ROLES.SUPERADMIN && nextRole !== ROLES.SUPERADMIN) {
    throw new HttpsError(
      'failed-precondition',
      'No podés degradar tu propio rol de superadmin'
    );
  }
}

/**
 * Crea un usuario en Firebase Auth y su perfil en Firestore.
 * Solo para superadmins.
 */
export const createUser = onCall(
  {
    region: DEFAULT_REGION,
    cors: true,
  },
  async (request) => {
    requireSuperAdmin(request);

    let input;
    try {
      input = createUserSchema.parse(request.data);
    } catch (error) {
      throw new HttpsError('invalid-argument', 'Datos inválidos', error);
    }

    const { email, password, displayName, role } = input;
    const targetRole: Role = role ?? ROLES.USER;
    const now = new Date().toISOString();

    try {
      const userRecord = await auth.createUser({
        email,
        password,
        displayName: displayName ?? undefined,
      });

      await auth.setCustomUserClaims(userRecord.uid, { role: targetRole });

      await db.collection(COLLECTIONS.USERS).doc(userRecord.uid).set({
        uid: userRecord.uid,
        email,
        displayName: displayName ?? null,
        role: targetRole,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      logger.info(`User created: ${userRecord.uid} (${email}) by ${request.auth!.uid}`);
      return {
        success: true,
        uid: userRecord.uid,
        email,
        role: targetRole,
      };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'auth/email-already-exists') {
        throw new HttpsError('already-exists', 'Ya existe un usuario con ese email');
      }
      logger.error('Error creating user:', error);
      throw new HttpsError('internal', 'Error interno al crear el usuario');
    }
  }
);

/**
 * Actualiza datos de un usuario (displayName, isActive, role).
 * Si se cambia el rol, sincroniza los custom claims.
 */
export const updateUser = onCall(
  {
    region: DEFAULT_REGION,
    cors: true,
  },
  async (request) => {
    requireSuperAdmin(request);

    let input;
    try {
      input = updateUserSchema.parse(request.data);
    } catch (error) {
      throw new HttpsError('invalid-argument', 'Datos inválidos', error);
    }

    const { uid, displayName, isActive, role } = input;
    const callerUid = request.auth!.uid;

    try {
      const userRef = db.collection(COLLECTIONS.USERS).doc(uid);
      const userDoc = await userRef.get();
      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'Usuario no encontrado');
      }

      const currentData = userDoc.data() as { role?: Role };
      const currentRole: Role | undefined = isValidRole(currentData.role)
        ? currentData.role
        : undefined;

      if (role) {
        ensureCanChangeRole(currentRole, role, uid, callerUid);
      }

      const now = new Date().toISOString();
      const updatePayload: Record<string, unknown> = { updatedAt: now };
      if (typeof displayName !== 'undefined') updatePayload.displayName = displayName;
      if (typeof isActive === 'boolean') updatePayload.isActive = isActive;
      if (role) updatePayload.role = role;

      await userRef.update(updatePayload);

      if (role) {
        await auth.setCustomUserClaims(uid, { role });
      }

      if (typeof displayName !== 'undefined') {
        await auth.updateUser(uid, { displayName: displayName ?? undefined });
      }

      logger.info(`User updated: ${uid} by ${callerUid}`);
      return { success: true, uid };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error(`Error updating user ${uid}:`, error);
      throw new HttpsError('internal', 'Error interno al actualizar el usuario');
    }
  }
);

/**
 * Elimina un usuario de Firebase Auth y de Firestore.
 * Impide que un superadmin se elimine a sí mismo.
 */
export const deleteUser = onCall(
  {
    region: DEFAULT_REGION,
    cors: true,
  },
  async (request) => {
    requireSuperAdmin(request);

    let input;
    try {
      input = deleteUserSchema.parse(request.data);
    } catch (error) {
      throw new HttpsError('invalid-argument', 'Datos inválidos', error);
    }

    const { uid } = input;
    const callerUid = request.auth!.uid;

    if (uid === callerUid) {
      throw new HttpsError(
        'failed-precondition',
        'No podés eliminar tu propio usuario'
      );
    }

    try {
      await auth.deleteUser(uid);
      await db.collection(COLLECTIONS.USERS).doc(uid).delete();
      logger.info(`User deleted: ${uid} by ${callerUid}`);
      return { success: true, uid };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'auth/user-not-found') {
        await db.collection(COLLECTIONS.USERS).doc(uid).delete().catch(() => undefined);
        return { success: true, uid };
      }
      logger.error(`Error deleting user ${uid}:`, error);
      throw new HttpsError('internal', 'Error interno al eliminar el usuario');
    }
  }
);
