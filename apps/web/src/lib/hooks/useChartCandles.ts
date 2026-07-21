'use client';

import { useEffect, useRef, useState } from 'react';
import {
  collection,
  limit as firestoreLimit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  PROVIDER_SYMBOL,
  type Candle,
  type ChartTimeframe,
  type MarketSymbol,
} from '@botrade/shared';

export const DEFAULT_CHART_LIMIT = 100;
export const CHART_LIMIT_OPTIONS = [20, 50, 100, 200, 500, 1000] as const;
export type ChartLimitOption = (typeof CHART_LIMIT_OPTIONS)[number];
const HTTP_BOOTSTRAP_TIMEOUT_MS = 15_000;

export interface UseChartCandlesParams {
  market: MarketSymbol;
  timeframe: ChartTimeframe;
  refreshTick?: number;
  limit?: number;
  /**
   * Si es true, saltea la suscripción a Firestore y siempre consulta
   * el endpoint HTTP `marketCandles` (datos en vivo del proveedor).
   * Útil para debug y para evitar mostrar datos cacheados desactualizados.
   */
  forceHttp?: boolean;
}

export interface UseChartCandlesResult {
  candles: Candle[];
  loading: boolean;
  error: string | null;
  source: 'firestore' | 'http' | null;
  pairId: string;
  requestPath?: string;
  requestFrom?: string;
  requestTo?: string;
}

function getFunctionsBaseUrl(): string {
  const override = process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_URL;
  if (override && override.length > 0) return override.replace(/\/$/, '');

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (projectId) {
    return `https://us-central1-${projectId}.cloudfunctions.net`;
  }
  return '';
}

function pairIdForMarket(market: MarketSymbol, timeframe: ChartTimeframe): string {
  const symbol = PROVIDER_SYMBOL[market];
  return `${symbol}_${timeframe}`;
}

function toCandle(data: Record<string, unknown>): Candle | null {
  const time = Number(data.time);
  const open = Number(data.open);
  const high = Number(data.high);
  const low = Number(data.low);
  const close = Number(data.close);
  if (![time, open, high, low, close].every((n) => Number.isFinite(n))) return null;
  const candle: Candle = { time, open, high, low, close };
  if (typeof data.volume === 'number' && Number.isFinite(data.volume)) {
    candle.volume = data.volume;
  }
  return candle;
}

async function fetchFromHttp(
  market: MarketSymbol,
  timeframe: ChartTimeframe,
  limit: number
): Promise<{
  candles: Candle[];
  requestPath?: string;
  from?: string;
  to?: string;
}> {
  const base = getFunctionsBaseUrl();
  if (!base) {
    throw new Error('No se pudo resolver la URL de las funciones de Firebase');
  }
  const params = new URLSearchParams({ market, timeframe, limit: String(limit) });
  const url = `${base}/marketCandles?${params.toString()}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HTTP_BOOTSTRAP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        detail?: string;
      };
      const statusMessage =
        typeof body.error === 'string' ? body.error : `Error ${res.status}`;
      const detail = typeof body.detail === 'string' ? body.detail : null;
      throw new Error(detail ? `${statusMessage} — ${detail}` : statusMessage);
    }
    const data = (await res.json()) as {
      candles?: Candle[];
      requestPath?: string;
      from?: string;
      to?: string;
    };
    return {
      candles: Array.isArray(data.candles) ? data.candles : [],
      requestPath: data.requestPath,
      from: data.from,
      to: data.to,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export function useChartCandles({
  market,
  timeframe,
  refreshTick = 0,
  limit = DEFAULT_CHART_LIMIT,
  forceHttp = false,
}: UseChartCandlesParams): UseChartCandlesResult {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'firestore' | 'http' | null>(null);
  const [requestPath, setRequestPath] = useState<string | undefined>(undefined);
  const [requestFrom, setRequestFrom] = useState<string | undefined>(undefined);
  const [requestTo, setRequestTo] = useState<string | undefined>(undefined);
  const pairId = pairIdForMarket(market, timeframe);
  const bootstrappedRef = useRef(false);
  const fallbackTriedRef = useRef(false);

  useEffect(() => {
    bootstrappedRef.current = false;
    fallbackTriedRef.current = false;
    setCandles([]);
    setError(null);
    setSource(null);
    setRequestPath(undefined);
    setRequestFrom(undefined);
    setRequestTo(undefined);
    setLoading(true);
    if (forceHttp) {
      console.info(
        `[useChartCandles] forceHttp=true: salteando Firestore, llamando HTTP para ${pairId}`
      );
    } else {
      console.info(
        `[useChartCandles] Suscribiendo a Firestore path=candles/${pairId}/candles limit=${limit}`
      );
    }
  }, [pairId, limit, refreshTick, forceHttp]);

  useEffect(() => {
    if (forceHttp) {
      let cancelled = false;
      const run = async () => {
        try {
          const result = await fetchFromHttp(market, timeframe, limit);
          if (cancelled) return;
          const httpCandles = result.candles;
          setRequestPath(result.requestPath);
          setRequestFrom(result.from);
          setRequestTo(result.to);
          if (httpCandles.length > 0) {
            setCandles(httpCandles);
            setSource('http');
            setError(null);
            const firstTime = new Date(httpCandles[0].time * 1000).toISOString();
            const lastTime = new Date(httpCandles[httpCandles.length - 1].time * 1000).toISOString();
            console.info(
              `[useChartCandles] Aplicadas ${httpCandles.length} velas vía HTTP (forzado) para ${pairId} ` +
                `(rango ${firstTime} → ${lastTime})`
            );
          } else {
            setError('El proveedor no devolvió velas para esta combinación');
          }
        } catch (err) {
          if (cancelled) return;
          const message = err instanceof Error ? err.message : String(err);
          setError(message || 'Error al cargar velas');
        } finally {
          if (!cancelled) {
            setLoading(false);
            bootstrappedRef.current = true;
          }
        }
      };
      void run();
      return () => {
        cancelled = true;
      };
    }

    if (!db) {
      setError('Firestore no está disponible');
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'candles', pairId, 'candles'),
      orderBy('time', 'desc'),
      firestoreLimit(limit)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        console.info(
          `[useChartCandles] Snapshot candles/${pairId}/candles → docs=${snapshot.docs.length} empty=${snapshot.empty}`
        );
        if (snapshot.empty) {
          if (!fallbackTriedRef.current && !bootstrappedRef.current) {
            fallbackTriedRef.current = true;
            void runHttpFallback();
          }
          return;
        }
        const data: Candle[] = [];
        for (const docSnap of snapshot.docs) {
          const c = toCandle(docSnap.data());
          if (c) data.push(c);
        }
        if (data.length > 0) {
          data.reverse();
          setCandles(data);
          setSource('firestore');
          setLoading(false);
          setError(null);
          bootstrappedRef.current = true;
          const firstTime = new Date(data[0].time * 1000).toISOString();
          const lastTime = new Date(data[data.length - 1].time * 1000).toISOString();
          console.info(
            `[useChartCandles] Aplicadas ${data.length} velas desde Firestore para ${pairId} ` +
              `(rango ${firstTime} → ${lastTime})`
          );
        }
      },
      (err) => {
        console.error(
          `[useChartCandles] Firestore snapshot error para candles/${pairId}/candles:`,
          err
        );
        if (!fallbackTriedRef.current && !bootstrappedRef.current) {
          fallbackTriedRef.current = true;
          void runHttpFallback();
        } else {
          setError(err.message || 'Error al leer velas de Firestore');
          setLoading(false);
        }
      }
    );

    async function runHttpFallback(): Promise<void> {
      console.info(
        `[useChartCandles] Firestore vacío para ${pairId}, usando fallback HTTP marketCandles (limit=${limit})`
      );
      try {
        const result = await fetchFromHttp(market, timeframe, limit);
        const httpCandles = result.candles;
        setRequestPath(result.requestPath);
        setRequestFrom(result.from);
        setRequestTo(result.to);
        if (httpCandles.length > 0) {
          setCandles(httpCandles);
          setSource('http');
          setError(null);
          const firstTime = new Date(httpCandles[0].time * 1000).toISOString();
          const lastTime = new Date(httpCandles[httpCandles.length - 1].time * 1000).toISOString();
          console.info(
            `[useChartCandles] Aplicadas ${httpCandles.length} velas vía HTTP para ${pairId} ` +
              `(rango ${firstTime} → ${lastTime})`
          );
        } else {
          setError('No hay velas disponibles para este símbolo/temporalidad');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message || 'Error al cargar velas');
      } finally {
        setLoading(false);
        bootstrappedRef.current = true;
      }
    }

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market, timeframe, refreshTick, limit, pairId, forceHttp]);

  return { candles, loading, error, source, pairId, requestPath, requestFrom, requestTo };
}
