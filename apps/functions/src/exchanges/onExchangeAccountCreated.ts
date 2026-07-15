import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { COLLECTIONS, DEFAULT_REGION } from '../config';

/**
 * Placeholder para futura lógica de exchanges.
 * Ahora solo loguea cuando se crea una cuenta de exchange.
 */
export const onExchangeAccountCreated = onDocumentCreated(
  {
    document: `${COLLECTIONS.EXCHANGE_ACCOUNTS}/{accountId}`,
    region: DEFAULT_REGION,
  },
  async (event) => {
    const data = event.data?.data();
    logger.info(`Exchange account created: ${event.params.accountId}`, {
      userId: data?.userId,
      exchangeId: data?.exchangeId,
    });
  }
);
