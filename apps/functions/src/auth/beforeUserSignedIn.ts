import { beforeUserSignedIn as beforeAuthUserSignedIn } from 'firebase-functions/v2/identity';
import { BlockingFunction } from 'firebase-functions/v1';
import { logger } from 'firebase-functions/v2';
import { COLLECTIONS, db, SUPERADMIN_EMAIL, DEFAULT_REGION } from '../config';
import { ROLES, Role, isValidRole } from '@botrade/shared';

/**
 * Antes de cada sign-in, re-evaluamos el rol del usuario según su email y
 * actualizamos tanto el custom claim como el documento en Firestore.
 * Esto corrige claims desfasados o usuarios creados antes de los triggers.
 */
export const beforeUserSignedIn: BlockingFunction = beforeAuthUserSignedIn(
  {
    region: DEFAULT_REGION,
  },
  async (event) => {
    const user = event.data;
    if (!user) {
      logger.warn('beforeUserSignedIn invoked without user data');
      return;
    }

    const uid = user.uid;
    const email = user.email || '';
    const isSuperAdminEmail = email.toLowerCase() === SUPERADMIN_EMAIL;
    let role: Role = ROLES.USER;

    try {
      const userRef = db.collection(COLLECTIONS.USERS).doc(uid);
      const userDoc = await userRef.get();
      const now = new Date().toISOString();

      if (userDoc.exists) {
        const existingRole = userDoc.get('role');
        if (isSuperAdminEmail) {
          role = ROLES.SUPERADMIN;
        } else if (isValidRole(existingRole)) {
          role = existingRole;
        } else {
          role = ROLES.USER;
        }
        await userRef.update({
          role,
          updatedAt: now,
        });
      } else {
        role = isSuperAdminEmail ? ROLES.SUPERADMIN : ROLES.USER;
        await userRef.set({
          uid,
          email: user.email || null,
          displayName: user.displayName || null,
          role,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
      }

      logger.info(`Synced role '${role}' for user ${uid} on sign-in`);
    } catch (error) {
      logger.error(`Error syncing user document ${uid} on sign-in:`, error);
      throw error;
    }

    return {
      customClaims: {
        ...(user.customClaims || {}),
        role,
      },
    };
  }
);
