import { onRequest } from 'firebase-functions/v2/https';
import { DEFAULT_REGION } from '../config';

export const health = onRequest(
  {
    region: DEFAULT_REGION,
    cors: true,
  },
  (request, response) => {
    response.json({
      status: 'ok',
      service: 'botrade-functions',
      timestamp: new Date().toISOString(),
    });
  }
);
