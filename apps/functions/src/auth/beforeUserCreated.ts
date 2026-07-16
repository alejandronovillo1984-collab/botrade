import { beforeUserCreated as beforeAuthUserCreated } from 'firebase-functions/v2/identity';
import { BlockingFunction } from 'firebase-functions/v1';
import { logger } from 'firebase-functions/v2';
import { COLLECTIONS, db, SUPERADMIN_EMAIL, DEFAULT_REGION } from '../config';
import { ROLES } from '@botrade/shared';

/**
 * Antes de que Firebase Auth confirme la creación del usuario, asignamos el
 * custom claim del rol y creamos el documento en Firestore.
 * Esto garantiza que el token del primer login ya contenga el rol correcto
 * (superadmin o user) sin necesidad de refrescar.
 */
export const beforeUserCreated: BlockingFunction = beforeAuthUserCreated(
  {
    region: DEFAULT_REGION,
  },
  async (event) => {
    const user = event.data;
    if (!user) {
      logger.warn('beforeUserCreated invoked without user data');
      return;
    }

    const uid = user.uid;
    const email = user.email || '';
    const role = email.toLowerCase() === SUPERADMIN_EMAIL ? ROLES.SUPERADMIN : ROLES.USER;

    try {
      const now = new Date().toISOString();
      await db
        .collection(COLLECTIONS.USERS)
        .doc(uid)
        .set({
          uid,
          email: user.email || null,
          displayName: user.displayName || null,
          role,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });

      logger.info(`Created user ${uid} with role '${role}' via blocking trigger`);
    } catch (error) {
      logger.error(`Error creating user document ${uid}:`, error);
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
