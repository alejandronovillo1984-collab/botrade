import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import {
  PROVIDER_SYMBOL,
  type AiModel,
  type AiModelProvider,
  type Candle,
  type ChartTimeframe,
  type MarketSymbol,
  type Observer,
  type ObserverIndice,
  type ObserverMercado,
  type ObserverTemporalidad,
} from '@botrade/shared';
import { COLLECTIONS, DEFAULT_REGION, db } from '../config';
import { runIndicator, isSupportedIndice } from '../indicators';
import { consultObserver } from '../ai/consultObserver';
import { ensureCandles, mergeAnnotations, type StoredCandle } from '../market/candleStore';
import {
  getCachedCandles,
  TIMEFRAME_MAP,
  type CandleCache,
  type PairKey,
  type ObserverRef,
} from '../market/candleSync';
import { syncAllPairs, getUniquePairs } from '../market/candleSync';
import type { SkippedReason } from '@botrade/shared';

const DEFAULT_AI_WINDOW = 20;
const OBSERVER_GAP_MS = 250;
const SAFETY_NET_CACHE_TTL_MS = 60_000;

interface AiConfigDoc {
  defaultAiModelId?: string | null;
}

export interface ObserverDoc extends ObserverRef {
  id: string;
  indice: ObserverIndice;
  marketOpen?: Observer['marketOpen'];
  isActive: boolean;
  lookback?: number;
  usePrompt?: boolean;
  prompt?: string | null;
  aiWindow?: number;
}

interface AiModelDoc {
  id: string;
  provider: AiModelProvider;
  model: string;
  apiKey: string;
  label: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function toAiModel(id: string, data: Partial<AiModelDoc>): AiModel {
  return {
    id,
    provider: (data.provider as AiModelProvider) ?? 'gemini',
    model: String(data.model ?? ''),
    apiKey: String(data.apiKey ?? ''),
    label: String(data.label ?? ''),
    isActive: data.isActive !== false,
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? ''),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function loadActiveObservers(): Promise<ObserverDoc[]> {
  const snap = await db
    .collection(COLLECTIONS.OBSERVERS)
    .where('isActive', '==', true)
    .get();
  return snap.docs.map((docSnap) => {
    const data = docSnap.data() as Omit<ObserverDoc, 'id'>;
    return { ...data, id: docSnap.id };
  });
}

async function loadDefaultAiModel(): Promise<AiModel | null> {
  const configSnap = await db
    .collection(COLLECTIONS.ADMIN_CONFIG)
    .doc('aiConfig')
    .get();
  if (!configSnap.exists) {
    logger.warn('[runAiObservers] adminConfig/aiConfig no existe');
    return null;
  }
  const data = configSnap.data() as AiConfigDoc | undefined;
  const id = data?.defaultAiModelId;
  if (!id) {
    logger.warn('[runAiObservers] No hay defaultAiModelId configurado');
    return null;
  }
  const modelSnap = await db.collection(COLLECTIONS.AI_MODELS).doc(id).get();
  if (!modelSnap.exists) {
    logger.warn(`[runAiObservers] Modelo default ${id} no existe`);
    return null;
  }
  const raw = modelSnap.data() as Partial<AiModelDoc> | undefined;
  if (!raw) {
    return null;
  }
  const model = toAiModel(modelSnap.id, raw);
  if (!model.isActive) {
    logger.warn(`[runAiObservers] Modelo default ${model.id} está inactivo`);
    return null;
  }
  if (!model.apiKey) {
    logger.warn(`[runAiObservers] Modelo default ${model.id} sin API key`);
    return null;
  }
  return model;
}

function buildResultId(observerId: string, candleTimestamp: number): string {
  return `${observerId}_${candleTimestamp}`;
}

function getPairForObserver(observer: ObserverDoc): PairKey | null {
  const timeframe: ChartTimeframe | undefined = TIMEFRAME_MAP[observer.temporalidad];
  if (!timeframe) return null;
  const market: MarketSymbol = observer.mercado;
  const symbol = PROVIDER_SYMBOL[market];
  if (!symbol) return null;
  const aiWindow =
    typeof observer.aiWindow === 'number' && observer.aiWindow > 0
      ? Math.floor(observer.aiWindow)
      : DEFAULT_AI_WINDOW;
  return { market, symbol, timeframe, aiWindow };
}

async function persistResult(
  payload: Record<string, unknown>,
  id: string
): Promise<void> {
  await db
    .collection(COLLECTIONS.AI_OBSERVER_RESULTS)
    .doc(id)
    .set(payload, { merge: true });
}

async function writeErrorLog(payload: Record<string, unknown>): Promise<void> {
  try {
    await db.collection(COLLECTIONS.LOGS).add({
      ...payload,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('[runAiObservers] No se pudo escribir log de error:', err);
  }
}

function candleToObserverCandles(candles: Candle[]): Candle[] {
  return candles.map((c) => ({
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    ...(typeof c.volume === 'number' ? { volume: c.volume } : {}),
  }));
}

interface ProcessResult {
  status: 'processed' | 'skipped' | 'error';
  mode: 'full' | 'stub';
  skippedReason?: SkippedReason;
}

function toPlainCandles(stored: StoredCandle[]): Candle[] {
  return stored.map((c) => ({
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    ...(typeof c.volume === 'number' ? { volume: c.volume } : {}),
  }));
}

async function safetyNetFetch(
  observer: ObserverDoc,
  pair: PairKey
): Promise<Candle[]> {
  try {
    const result = await ensureCandles({
      market: pair.market,
      symbol: pair.symbol,
      timeframe: pair.timeframe,
      aiWindow: pair.aiWindow,
    });
    if (result.candles.length > 0) {
      logger.info(
        `[runAiObservers] Safety net: sincronizadas ${result.candles.length} velas para ${pair.symbol} ${pair.timeframe} (observer ${observer.id})`
      );
    }
    return toPlainCandles(result.candles);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      `[runAiObservers] Safety net falló para ${pair.symbol} ${pair.timeframe}:`,
      message
    );
    return [];
  }
}

function resolveSkippedReason(observer: ObserverDoc): SkippedReason {
  if (!observer.usePrompt) return 'no_usePrompt';
  const indice: string = observer.indice;
  if (indice === 'choch' || indice === 'inbalance') {
    return 'not_implemented';
  }
  if (!isSupportedIndice(observer.indice)) return 'unsupported_indice';
  return null;
}

async function processObserver(
  observer: ObserverDoc,
  aiModel: AiModel | null,
  cache: Map<string, StoredCandle[]>
): Promise<ProcessResult> {
  const pair = getPairForObserver(observer);
  if (!pair) {
    logger.warn(
      `[runAiObservers] Observer ${observer.id}: temporalidad ${observer.temporalidad} no soportada`
    );
    await writeErrorLog({
      level: 'warn',
      source: 'runAiObservers',
      observerId: observer.id,
      stage: 'resolve_pair',
      message: `temporalidad ${observer.temporalidad} no soportada`,
    });
    return { status: 'skipped', mode: 'stub', skippedReason: 'unsupported_indice' };
  }

  let candles = toPlainCandles(getCachedCandles(cache, pair));

  if (candles.length === 0) {
    candles = await safetyNetFetch(observer, pair);
  }

  if (candles.length === 0) {
    logger.warn(
      `[runAiObservers] Observer ${observer.id}: sin velas para ${pair.symbol} ${pair.timeframe}`
    );
    return { status: 'error', mode: 'stub' };
  }

  const indicatorResult = runIndicator({
    indice: observer.indice,
    candles,
    observer: observer as unknown as Observer,
  });

  const lastCandle = candles[candles.length - 1];
  const resultId = buildResultId(observer.id, lastCandle.time);
  const createdAt = new Date().toISOString();

  const shouldRunIa = !!observer.usePrompt && isSupportedIndice(observer.indice);

  if (!shouldRunIa) {
    const skippedReason = resolveSkippedReason(observer);

    const stubDoc: Record<string, unknown> = {
      id: resultId,
      observerId: observer.id,
      observerIndice: observer.indice,
      observerTemporalidad: observer.temporalidad,
      observerMercado: observer.mercado,
      symbol: pair.symbol,
      candleTimestamp: lastCandle.time * 1000,
      provider: null,
      model: null,
      promptUsed: null,
      indicatorMatched: indicatorResult.matched,
      indicatorDetails: indicatorResult.details,
      cumplio: null,
      fuerza: null,
      razon: null,
      rawResponse: null,
      error: null,
      annotationsMerged: false,
      skippedReason,
      createdAt,
    };

    try {
      await persistResult(stubDoc, resultId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        `[runAiObservers] Error al persistir stub aiObserverResults/${resultId}:`,
        message
      );
      await writeErrorLog({
        level: 'error',
        source: 'runAiObservers',
        observerId: observer.id,
        stage: 'persist_stub',
        message,
      });
      return { status: 'error', mode: 'stub' };
    }

    logger.info(
      `[runAiObservers] Observer ${observer.id} (${observer.indice} ${observer.temporalidad} ${observer.mercado}) ` +
        `→ STUB indicator.matched=${indicatorResult.matched} skipped=${skippedReason}`
    );
    return { status: 'processed', mode: 'stub', skippedReason };
  }

  if (!aiModel) {
    logger.warn(
      `[runAiObservers] Observer ${observer.id}: usePrompt=true pero no hay AI model default activo`
    );
    const skippedStub: Record<string, unknown> = {
      id: resultId,
      observerId: observer.id,
      observerIndice: observer.indice,
      observerTemporalidad: observer.temporalidad,
      observerMercado: observer.mercado,
      symbol: pair.symbol,
      candleTimestamp: lastCandle.time * 1000,
      provider: null,
      model: null,
      promptUsed: null,
      indicatorMatched: indicatorResult.matched,
      indicatorDetails: indicatorResult.details,
      cumplio: null,
      fuerza: null,
      razon: null,
      rawResponse: null,
      error: 'no_default_ai_model',
      annotationsMerged: false,
      skippedReason: 'no_usePrompt',
      createdAt,
    };
    try {
      await persistResult(skippedStub, resultId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[runAiObservers] Error persistiendo skipped stub: ${message}`);
    }
    return { status: 'processed', mode: 'stub', skippedReason: 'no_usePrompt' };
  }

  let aiResult: Awaited<ReturnType<typeof consultObserver>>;
  try {
    aiResult = await consultObserver({
      observer: observer as unknown as Observer,
      candles,
      indicatorResult,
      symbol: pair.symbol,
      aiModel,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[runAiObservers] Error inesperado consultando IA: ${message}`);
    await writeErrorLog({
      level: 'error',
      source: 'runAiObservers',
      observerId: observer.id,
      stage: 'consult_observer',
      message,
    });
    return { status: 'error', mode: 'full' };
  }

  let annotationsMerged = false;
  if (aiResult.annotations && Object.keys(aiResult.annotations).length > 0) {
    try {
      await mergeAnnotations({
        symbol: pair.symbol,
        timeframe: pair.timeframe,
        time: lastCandle.time,
        annotations: aiResult.annotations,
      });
      annotationsMerged = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        `[runAiObservers] Error al mergear annotations en ${pair.symbol} ${pair.timeframe}/${lastCandle.time}:`,
        message
      );
    }
  }

  const resultDoc: Record<string, unknown> = {
    id: resultId,
    observerId: observer.id,
    observerIndice: observer.indice,
    observerTemporalidad: observer.temporalidad,
    observerMercado: observer.mercado,
    symbol: pair.symbol,
    candleTimestamp: lastCandle.time * 1000,
    provider: aiResult.provider,
    model: aiResult.model,
    promptUsed: aiResult.promptUsed,
    indicatorMatched: indicatorResult.matched,
    indicatorDetails: indicatorResult.details,
    cumplio: aiResult.cumplio,
    fuerza: aiResult.fuerza,
    razon: aiResult.razon ?? null,
    rawResponse: aiResult.rawResponse,
    error: aiResult.error ?? null,
    annotationsMerged,
    skippedReason: null,
    createdAt,
  };

  try {
    await persistResult(resultDoc, resultId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      `[runAiObservers] Error al persistir aiObserverResults/${resultId}:`,
      message
    );
    await writeErrorLog({
      level: 'error',
      source: 'runAiObservers',
      observerId: observer.id,
      stage: 'persist_result',
      message,
    });
    return { status: 'error', mode: 'full' };
  }

  logger.info(
    `[runAiObservers] Observer ${observer.id} (${observer.indice} ${observer.temporalidad} ${observer.mercado}) ` +
      `→ FULL indicator.matched=${indicatorResult.matched} ai.cumplio=${aiResult.cumplio} ai.fuerza=${aiResult.fuerza.toFixed(2)} ` +
      `annotations=${annotationsMerged ? 'yes' : 'no'}`
  );
  return { status: 'processed', mode: 'full', skippedReason: null };
}

export const runAiObservers = onSchedule(
  {
    schedule: 'every 1 minutes',
    region: DEFAULT_REGION,
    timeZone: 'UTC',
  },
  async () => {
    const startedAt = Date.now();
    logger.info('[runAiObservers] Iniciando corrida');

    const observers = await loadActiveObservers();
    if (observers.length === 0) {
      logger.info('[runAiObservers] No hay observers activos. Finalizando.');
      return;
    }

    const aiModel = await loadDefaultAiModel();

    const pairs = getUniquePairs(observers);
    logger.info(
      `[runAiObservers] ${observers.length} observers activos. Pares únicos: ${pairs.length}. ` +
        `Modelo: ${aiModel ? `${aiModel.provider}/${aiModel.model}` : 'ninguno'}`
    );

    if (pairs.length === 0) {
      return;
    }

    const syncResult = await syncAllPairs(pairs);
    const candlesMap = syncResult.cache;

    let processed = 0;
    let fulls = 0;
    let stubs = 0;
    let errors = 0;

    for (const observer of observers) {
      try {
        const result = await processObserver(observer, aiModel, candlesMap);
        if (result.status === 'processed') {
          processed += 1;
          if (result.mode === 'full') fulls += 1;
          else stubs += 1;
        } else {
          errors += 1;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(
          `[runAiObservers] Error procesando observer ${observer.id}:`,
          message
        );
        await writeErrorLog({
          level: 'error',
          source: 'runAiObservers',
          observerId: observer.id,
          stage: 'process_observer',
          message,
        });
        errors += 1;
      }
      if (processed + errors < observers.length) {
        await sleep(OBSERVER_GAP_MS);
      }
    }

    const elapsed = Date.now() - startedAt;
    logger.info(
      `[runAiObservers] Corrida finalizada en ${elapsed}ms. ` +
        `Observers: ${processed} procesados (${fulls} full, ${stubs} stub), ${errors} errores.`
    );
  }
);
