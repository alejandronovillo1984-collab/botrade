import { logger } from 'firebase-functions/v2';
import { TIMEFRAME_SPEC, type Candle, type ChartTimeframe, type MarketSymbol } from '@botrade/shared';
import { COLLECTIONS, db } from '../config';
import { EodhdFetchError, fetchCandles } from './eodhdClient';

export const DEFAULT_DELTA_FETCH = 5;
export const DELTA_OVERLAP = 2;
export const STALE_THRESHOLD_MULTIPLIER = 3;

export interface CandleAnnotations {
  context?: string;
  tags?: string[];
  narrative?: string;
  [key: string]: unknown;
}

export interface StoredCandle extends Candle {
  symbol: string;
  timeframe: ChartTimeframe;
  source: string;
  createdAt: string;
  annotations?: CandleAnnotations;
}

export interface EnsureCandlesParams {
  market: MarketSymbol;
  symbol: string;
  timeframe: ChartTimeframe;
  aiWindow: number;
}

export interface EnsureCandlesResult {
  symbol: string;
  timeframe: ChartTimeframe;
  candles: StoredCandle[];
  fetchedFromEodhd: number;
  merged: number;
  source: 'cache' | 'eodhd' | 'mixed';
}

export interface MergeAnnotationsParams {
  symbol: string;
  timeframe: ChartTimeframe;
  time: number;
  annotations: CandleAnnotations;
}

function pairId(symbol: string, timeframe: ChartTimeframe): string {
  return `${symbol}_${timeframe}`;
}

function candleSubcollection(symbol: string, timeframe: ChartTimeframe) {
  return db
    .collection(COLLECTIONS.CANDLES)
    .doc(pairId(symbol, timeframe))
    .collection('candles');
}

function readCandle(
  data: Record<string, unknown>,
  symbol: string,
  timeframe: ChartTimeframe
): StoredCandle {
  const annotations =
    data.annotations && typeof data.annotations === 'object' && !Array.isArray(data.annotations)
      ? (data.annotations as CandleAnnotations)
      : undefined;
  const base: StoredCandle = {
    time: Number(data.time),
    open: Number(data.open),
    high: Number(data.high),
    low: Number(data.low),
    close: Number(data.close),
    symbol: typeof data.symbol === 'string' ? data.symbol : symbol,
    timeframe:
      typeof data.timeframe === 'string' ? (data.timeframe as ChartTimeframe) : timeframe,
    source: typeof data.source === 'string' ? data.source : 'eodhd',
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date(0).toISOString(),
  };
  if (typeof data.volume === 'number' && Number.isFinite(data.volume)) {
    base.volume = data.volume;
  }
  if (annotations) base.annotations = annotations;
  return base;
}

export async function getStoredCandles(
  symbol: string,
  timeframe: ChartTimeframe,
  limit: number
): Promise<StoredCandle[]> {
  const snap = await candleSubcollection(symbol, timeframe)
    .orderBy('time', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map((d) => readCandle(d.data(), symbol, timeframe));
}

export async function getLastCandleTimestamp(
  symbol: string,
  timeframe: ChartTimeframe
): Promise<number | null> {
  const snap = await candleSubcollection(symbol, timeframe)
    .orderBy('time', 'desc')
    .limit(1)
    .get();
  if (snap.empty) return null;
  const data = snap.docs[0].data();
  const t = Number(data.time);
  return Number.isFinite(t) ? t : null;
}

function timeframeSeconds(timeframe: ChartTimeframe): number {
  switch (timeframe) {
    case '1m':
      return 60;
    case '5m':
      return 5 * 60;
    case '1h':
      return 60 * 60;
    case '1d':
      return 24 * 60 * 60;
  }
}

function isStale(lastTimestampSec: number, timeframe: ChartTimeframe): boolean {
  const nowSec = Math.floor(Date.now() / 1000);
  const threshold = timeframeSeconds(timeframe) * STALE_THRESHOLD_MULTIPLIER;
  return nowSec - lastTimestampSec > threshold;
}

function dedupAndSort(existing: StoredCandle[], incoming: Candle[]): StoredCandle[] {
  const map = new Map<number, StoredCandle>();
  for (const c of existing) map.set(c.time, c);
  for (const c of incoming) {
    const existingCandle = map.get(c.time);
    if (existingCandle) {
      map.set(c.time, { ...existingCandle, ...c });
    } else {
      map.set(c.time, {
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        ...(typeof c.volume === 'number' ? { volume: c.volume } : {}),
        symbol: '',
        timeframe: '1m',
        source: 'eodhd',
        createdAt: new Date().toISOString(),
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

async function persistCandles(
  symbol: string,
  timeframe: ChartTimeframe,
  candles: Candle[]
): Promise<void> {
  if (candles.length === 0) return;
  const createdAt = new Date().toISOString();
  const subCol = candleSubcollection(symbol, timeframe);
  const batch = db.batch();
  for (const c of candles) {
    const ref = subCol.doc(String(c.time));
    const payload: Record<string, unknown> = {
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      symbol,
      timeframe,
      source: 'eodhd',
      createdAt,
    };
    if (typeof c.volume === 'number') payload.volume = c.volume;
    batch.set(ref, payload, { merge: true });
  }
  await batch.commit();
}

function trimToWindow(
  candles: StoredCandle[],
  aiWindow: number
): StoredCandle[] {
  if (candles.length <= aiWindow) return candles;
  return candles.slice(-aiWindow);
}

export async function ensureCandles({
  market,
  symbol,
  timeframe,
  aiWindow,
}: EnsureCandlesParams): Promise<EnsureCandlesResult> {
  const lastTs = await getLastCandleTimestamp(symbol, timeframe);
  const stored = await getStoredCandles(symbol, timeframe, aiWindow);
  const chartWindow = TIMEFRAME_SPEC[timeframe]?.chartWindow ?? aiWindow;

  let fetchCount: number;
  if (lastTs === null) {
    fetchCount = chartWindow;
  } else if (isStale(lastTs, timeframe)) {
    fetchCount = chartWindow;
  } else {
    fetchCount = DEFAULT_DELTA_FETCH + DELTA_OVERLAP;
  }

  let eodhdCandles: Candle[] = [];
  let source: EnsureCandlesResult['source'] = 'cache';
  let fetchedFromEodhd = 0;
  let merged = 0;

  try {
    const fetched = await fetchCandles({
      market,
      timeframe,
      limit: fetchCount,
    });
    eodhdCandles = fetched.candles;
    fetchedFromEodhd = eodhdCandles.length;
    if (eodhdCandles.length > 0) {
      source = stored.length > 0 ? 'mixed' : 'eodhd';
      await persistCandles(symbol, timeframe, eodhdCandles);
    }
  } catch (err) {
    const message =
      err instanceof EodhdFetchError
        ? `${err.code}: ${err.message}`
        : err instanceof Error
        ? err.message
        : String(err);
    logger.warn(
      `[candleStore] EODHD fetch falló para ${symbol} ${timeframe}: ${message}. Usando velas cacheadas.`
    );
  }

  const finalCandles = trimToWindow(
    dedupAndSort(stored, eodhdCandles),
    aiWindow
  );
  merged = finalCandles.length;

  const finalSource: EnsureCandlesResult['source'] =
    eodhdCandles.length === 0
      ? 'cache'
      : stored.length === 0
      ? 'eodhd'
      : 'mixed';

  return {
    symbol,
    timeframe,
    candles: finalCandles,
    fetchedFromEodhd: fetchedFromEodhd,
    merged,
    source: finalSource,
  };
}

export async function mergeAnnotations({
  symbol,
  timeframe,
  time,
  annotations,
}: MergeAnnotationsParams): Promise<void> {
  const ref = candleSubcollection(symbol, timeframe).doc(String(time));
  await ref.set({ annotations, annotationsUpdatedAt: new Date().toISOString() }, { merge: true });
}

export async function getCandle(
  symbol: string,
  timeframe: ChartTimeframe,
  time: number
): Promise<StoredCandle | null> {
  const snap = await candleSubcollection(symbol, timeframe).doc(String(time)).get();
  if (!snap.exists) return null;
  return readCandle(snap.data() ?? {}, symbol, timeframe);
}
