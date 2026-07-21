import { logger } from 'firebase-functions/v2';
import {
  PROVIDER_SYMBOL,
  type ChartTimeframe,
  type MarketSymbol,
  type ObserverTemporalidad,
  type ObserverMercado,
} from '@botrade/shared';
import { ensureCandles, type EnsureCandlesResult, type StoredCandle } from './candleStore';

export const TIMEFRAME_MAP: Record<ObserverTemporalidad, ChartTimeframe> = {
  '1m': '1m',
  '5m': '5m',
  '1h': '1h',
};

export interface ObserverRef {
  id: string;
  mercado: ObserverMercado;
  temporalidad: ObserverTemporalidad;
  aiWindow?: number;
}

export interface PairKey {
  market: MarketSymbol;
  symbol: string;
  timeframe: ChartTimeframe;
  aiWindow: number;
}

export interface PairSyncResult {
  pair: PairKey;
  result: EnsureCandlesResult;
}

function pairKey(p: PairKey): string {
  return `${p.market}::${p.symbol}::${p.timeframe}::${p.aiWindow}`;
}

export function getUniquePairs(observers: ObserverRef[]): PairKey[] {
  const map = new Map<string, PairKey>();
  for (const o of observers) {
    const timeframe = TIMEFRAME_MAP[o.temporalidad];
    if (!timeframe) continue;
    const market: MarketSymbol = o.mercado;
    const symbol = PROVIDER_SYMBOL[market];
    if (!symbol) continue;
    const aiWindow =
      typeof o.aiWindow === 'number' && o.aiWindow > 0
        ? Math.floor(o.aiWindow)
        : 20;
    const pair: PairKey = { market, symbol, timeframe, aiWindow };
    const key = pairKey(pair);
    if (!map.has(key)) {
      map.set(key, pair);
    } else {
      const existing = map.get(key)!;
      if (pair.aiWindow > existing.aiWindow) {
        map.set(key, { ...existing, aiWindow: pair.aiWindow });
      }
    }
  }
  return Array.from(map.values());
}

export async function syncPair(pair: PairKey): Promise<PairSyncResult> {
  const result = await ensureCandles({
    market: pair.market,
    symbol: pair.symbol,
    timeframe: pair.timeframe,
    aiWindow: pair.aiWindow,
  });
  return { pair, result };
}

export interface CandleCache {
  cache: Map<string, StoredCandle[]>;
  syncResults: PairSyncResult[];
}

export async function syncAllPairs(
  pairs: PairKey[]
): Promise<CandleCache> {
  const cache = new Map<string, StoredCandle[]>();
  const syncResults: PairSyncResult[] = [];

  for (const pair of pairs) {
    try {
      const syncResult = await syncPair(pair);
      const key = pairKey(pair);
      cache.set(key, syncResult.result.candles);
      syncResults.push(syncResult);
      logger.info(
        `[candleSync] ${pair.symbol} ${pair.timeframe} (window=${pair.aiWindow}) → ` +
          `source=${syncResult.result.source} fetched=${syncResult.result.fetchedFromEodhd} merged=${syncResult.result.merged}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        `[candleSync] Error al sincronizar ${pair.symbol} ${pair.timeframe}: ${message}`
      );
    }
  }

  return { cache, syncResults };
}

export function getCachedCandles(
  cache: Map<string, StoredCandle[]>,
  pair: PairKey
): StoredCandle[] {
  return cache.get(pairKey(pair)) ?? [];
}
