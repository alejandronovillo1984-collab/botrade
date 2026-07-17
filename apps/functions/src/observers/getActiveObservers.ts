import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import {
  type MarketOpen,
  type ObserverIndice,
  type ObserverMercado,
  type ObserverTemporalidad,
} from '@botrade/shared';
import { COLLECTIONS, DEFAULT_REGION, db } from '../config';

const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  expiresAt: number;
  payload: { observers: PublicObserver[] };
}

const cache: CacheEntry = { expiresAt: 0, payload: { observers: [] } };

export interface PublicObserver {
  id: string;
  indice: ObserverIndice;
  temporalidad: ObserverTemporalidad;
  mercado: ObserverMercado;
  marketOpen: MarketOpen | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function setCorsHeaders(response: { set: (name: string, value: string) => void }): void {
  response.set('Access-Control-Allow-Origin', '*');
  response.set('Access-Control-Allow-Methods', 'GET,OPTIONS');
  response.set('Access-Control-Allow-Headers', 'Content-Type');
}

function toIso(value: unknown): string {
  if (typeof value === 'string') return value;
  if (
    value &&
    typeof (value as { toDate?: () => Date }).toDate === 'function'
  ) {
    return ((value as { toDate: () => Date }).toDate()).toISOString();
  }
  return new Date(0).toISOString();
}

export const getActiveObservers = onRequest(
  { region: DEFAULT_REGION, cors: true },
  async (_request, response) => {
    setCorsHeaders(response);

    if (_request.method === 'OPTIONS') {
      response.status(204).send('');
      return;
    }

    if (cache.expiresAt > Date.now()) {
      response.status(200).json(cache.payload);
      return;
    }

    try {
      const snap = await db
        .collection(COLLECTIONS.OBSERVERS)
        .where('isActive', '==', true)
        .get();

      const observers: PublicObserver[] = snap.docs.map((docSnap) => {
        const data = docSnap.data() as {
          indice: ObserverIndice;
          temporalidad: ObserverTemporalidad;
          mercado: ObserverMercado;
          marketOpen: MarketOpen | null;
          isActive: boolean;
        };
        return {
          id: docSnap.id,
          indice: data.indice,
          temporalidad: data.temporalidad,
          mercado: data.mercado,
          marketOpen: data.marketOpen ?? null,
          isActive: data.isActive,
          createdAt: toIso(docSnap.get('createdAt')),
          updatedAt: toIso(docSnap.get('updatedAt')),
        };
      });

      cache.expiresAt = Date.now() + CACHE_TTL_MS;
      cache.payload = { observers };
      response.status(200).json({ observers });
    } catch (err) {
      logger.error('Error leyendo observers activos:', err);
      response.status(500).json({ error: 'No se pudieron obtener los observadores activos' });
    }
  }
);
