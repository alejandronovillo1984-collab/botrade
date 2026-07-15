import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { COLLECTIONS, db, auth, SUPERADMIN_EMAIL, DEFAULT_REGION } from '../config';
import { ROLES } from '@botrade/shared';

/**
 * Cuando se crea un usuario en Firestore, asignamos el rol correspondiente.
 * El primer superadmin se define por email hardcodeado.
 */
export const onUserCreated = onDocumentCreated(
  {
    document: `${COLLECTIONS.USERS}/{uid}`,
    region: DEFAULT_REGION,
  },
  async (event) => {
    const uid = event.params.uid;
    const data = event.data?.data();

    if (!data) {
      logger.warn(`No data found for new user ${uid}`);
      return;
    }

    const email = (data.email as string) || '';
    const role = email.toLowerCase() === SUPERADMIN_EMAIL ? ROLES.SUPERADMIN : ROLES.USER;

    try {
      await auth.setCustomUserClaims(uid, { role });
      await event.data?.ref.update({
        role,
        updatedAt: new Date().toISOString(),
      });
      logger.info(`Assigned role ${role} to user ${uid}`);
    } catch (error) {
      logger.error(`Error assigning role to user ${uid}:`, error);
      throw error;
    }
  }
);
