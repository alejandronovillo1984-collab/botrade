import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { COLLECTIONS, DEFAULT_REGION, db } from '../config';
import { ensureCandles } from './candleStore';
import { getUniquePairs, type ObserverRef } from './candleSync';
import type {
  ChartTimeframe,
  MarketSymbol,
  ObserverIndice,
  ObserverMercado,
  ObserverTemporalidad,
} from '@botrade/shared';

interface ObserverCandleSyncDoc {
  id: string;
  indice: ObserverIndice;
  temporalidad: ObserverTemporalidad;
  mercado: ObserverMercado;
  isActive: boolean;
  usePrompt?: boolean;
  lookback?: number;
  aiWindow?: number;
}

async function loadActiveObserversForSync(): Promise<ObserverCandleSyncDoc[]> {
  const snap = await db
    .collection(COLLECTIONS.OBSERVERS)
    .where('isActive', '==', true)
    .get();
  return snap.docs.map((docSnap) => {
    const data = docSnap.data() as Omit<ObserverCandleSyncDoc, 'id'>;
    return { ...data, id: docSnap.id };
  });
}

export const syncCandles = onSchedule(
  {
    schedule: 'every 1 minutes',
    region: DEFAULT_REGION,
    timeZone: 'UTC',
  },
  async () => {
    const startedAt = Date.now();
    const observers = await loadActiveObserversForSync();

    if (observers.length === 0) {
      logger.info('[syncCandles] No hay observers activos. Finalizando.');
      return;
    }

    const refs: ObserverRef[] = observers.map((o) => ({
      id: o.id,
      mercado: o.mercado,
      temporalidad: o.temporalidad,
      aiWindow: o.aiWindow,
    }));

    const pairs = getUniquePairs(refs);
    logger.info(
      `[syncCandles] ${observers.length} observers activos. ${pairs.length} pares únicos a sincronizar.`
    );

    let synced = 0;
    let fromCache = 0;
    let fromEodhd = 0;
    let errors = 0;

    for (const pair of pairs) {
      try {
        const result = await ensureCandles({
          market: pair.market as MarketSymbol,
          symbol: pair.symbol,
          timeframe: pair.timeframe as ChartTimeframe,
          aiWindow: pair.aiWindow,
        });
        synced += 1;
        if (result.source === 'cache') fromCache += 1;
        else fromEodhd += 1;
        logger.info(
          `[syncCandles] ${pair.symbol} ${pair.timeframe} (window=${pair.aiWindow}) → ` +
            `source=${result.source} fetched=${result.fetchedFromEodhd} merged=${result.merged}`
        );
      } catch (err) {
        errors += 1;
        const message = err instanceof Error ? err.message : String(err);
        logger.error(
          `[syncCandles] Error al sincronizar ${pair.symbol} ${pair.timeframe}: ${message}`
        );
      }
    }

    const elapsed = Date.now() - startedAt;
    logger.info(
      `[syncCandles] Finalizado en ${elapsed}ms. Pares: ${synced}/${pairs.length}. ` +
        `Cache: ${fromCache}. EODHD: ${fromEodhd}. Errores: ${errors}.`
    );
  }
);
