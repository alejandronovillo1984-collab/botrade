'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type CandlestickData,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { RefreshCw, Moon, Sun } from 'lucide-react';
import {
  CHART_TIMEFRAMES,
  MARKET_LABELS,
  MARKET_SYMBOLS,
  TIMEFRAME_LABELS,
  type Candle,
  type ChartTimeframe,
  type MarketSymbol,
  type Observer,
} from '@botrade/shared';
import { buildObserverMarkers } from '@/lib/chart/markers';
import {
  CHART_LIMIT_OPTIONS,
  DEFAULT_CHART_LIMIT,
  useChartCandles,
} from '@/lib/hooks/useChartCandles';

const TIMEFRAME_OPTIONS: ChartTimeframe[] = [
  CHART_TIMEFRAMES.D1,
  CHART_TIMEFRAMES.H1,
  CHART_TIMEFRAMES.M5,
  CHART_TIMEFRAMES.M1,
];

const MARKET_OPTIONS: MarketSymbol[] = [MARKET_SYMBOLS.NASDAQ, MARKET_SYMBOLS.SP500];

const STORAGE_KEYS = {
  market: 'botrade:chart:market',
  timeframe: 'botrade:chart:timeframe',
  background: 'botrade:chart:background',
  limit: 'botrade:chart:limit',
} as const;

type ChartBackground = 'light' | 'dark';

const BG_THEMES: Record<
  ChartBackground,
  {
    bg: string;
    text: string;
    grid: string;
    border: string;
    containerBorder: string;
    containerBg: string;
    toolbarText: string;
  }
> = {
  light: {
    bg: '#ffffff',
    text: '#0f172a',
    grid: '#f1f5f9',
    border: '#e2e8f0',
    containerBorder: '#e2e8f0',
    containerBg: '#ffffff',
    toolbarText: '#64748b',
  },
  dark: {
    bg: '#0f172a',
    text: '#e2e8f0',
    grid: '#1e293b',
    border: '#334155',
    containerBorder: '#334155',
    containerBg: '#0f172a',
    toolbarText: '#94a3b8',
  },
};

function useLocalStorageState<T extends string>(
  key: string,
  fallback: T,
  validate?: (raw: string) => raw is T,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(fallback);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null && (validate ? validate(raw) : true)) {
        setValue(raw as T);
      }
    } catch {
      // ignore (SSR or storage blocked)
    } finally {
      setHydrated(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  }, [key, value, hydrated]);

  return [value, setValue];
}

function useLocalStorageNumberState(
  key: string,
  fallback: number,
  allowed: readonly number[]
): [number, (next: number) => void] {
  const [value, setValue] = useState<number>(fallback);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        const parsed = Number(raw);
        if (Number.isFinite(parsed) && allowed.includes(parsed)) {
          setValue(parsed);
        }
      }
    } catch {
      // ignore
    } finally {
      setHydrated(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(key, String(value));
    } catch {
      // ignore
    }
  }, [key, value, hydrated]);

  return [value, setValue];
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

const isMarketSymbol = (v: string): v is MarketSymbol =>
  v === MARKET_SYMBOLS.NASDAQ || v === MARKET_SYMBOLS.SP500;

const isChartTimeframe = (v: string): v is ChartTimeframe =>
  v === CHART_TIMEFRAMES.M1 ||
  v === CHART_TIMEFRAMES.M5 ||
  v === CHART_TIMEFRAMES.H1 ||
  v === CHART_TIMEFRAMES.D1;

const isChartBackground = (v: string): v is ChartBackground =>
  v === 'light' || v === 'dark';

const STALE_DATA_THRESHOLD_SEC = 60 * 60;

function formatAge(seconds: number): string {
  if (seconds < 60) return `hace ${seconds}s`;
  if (seconds < 3600) return `hace ${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `hace ${Math.floor(seconds / 3600)}h`;
  return `hace ${Math.floor(seconds / 86400)}d`;
}

function formatTimeShort(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`;
}

interface ActiveObserversResponse {
  observers: Observer[];
}

export function MarketChart() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const candlesRef = useRef<Candle[]>([]);

  const [market, setMarket] = useLocalStorageState<MarketSymbol>(
    STORAGE_KEYS.market,
    MARKET_SYMBOLS.NASDAQ,
    isMarketSymbol
  );
  const [timeframe, setTimeframe] = useLocalStorageState<ChartTimeframe>(
    STORAGE_KEYS.timeframe,
    CHART_TIMEFRAMES.D1,
    isChartTimeframe
  );
  const [background, setBackground] = useLocalStorageState<ChartBackground>(
    STORAGE_KEYS.background,
    'light',
    isChartBackground
  );
  const [limit, setLimit] = useLocalStorageNumberState(
    STORAGE_KEYS.limit,
    DEFAULT_CHART_LIMIT,
    CHART_LIMIT_OPTIONS
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [dataRange, setDataRange] = useState<{ first: number; last: number } | null>(null);

  const [refreshTick, setRefreshTick] = useState(0);
  const [observers, setObservers] = useState<Observer[]>([]);

  const {
    candles: chartCandles,
    loading: chartLoading,
    error: chartError,
    source: chartSource,
    pairId: chartPairId,
  } = useChartCandles({
    market,
    timeframe,
    refreshTick,
    limit,
  });

  const theme = BG_THEMES[background];

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: theme.bg },
        textColor: theme.text,
      },
      grid: {
        vertLines: { color: theme.grid },
        horzLines: { color: theme.grid },
      },
      timeScale: {
        borderColor: theme.border,
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: theme.border,
      },
      crosshair: {
        mode: 1,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#16a34a',
      downColor: '#dc2626',
      borderUpColor: '#16a34a',
      borderDownColor: '#dc2626',
      wickUpColor: '#16a34a',
      wickDownColor: '#dc2626',
    });

    const markers = createSeriesMarkers(series, []);

    chartRef.current = chart;
    seriesRef.current = series;
    markersRef.current = markers;

    if (containerRef.current) {
      const observer = new ResizeObserver(() => {
        chart.applyOptions({});
      });
      observer.observe(containerRef.current);
      resizeObserverRef.current = observer;
    }

    return () => {
      resizeObserverRef.current?.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      markersRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    const base = getFunctionsBaseUrl();
    const url = `${base}/getActiveObservers`;
    setObservers([]);

    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const message = typeof body?.error === 'string' ? body.error : `Error ${res.status}`;
          throw new Error(message);
        }
        return (await res.json()) as ActiveObserversResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setObservers(Array.isArray(data?.observers) ? data.observers : []);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        console.error('[MarketChart] getActiveObservers failed', err);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  useEffect(() => {
    const markers = markersRef.current;
    if (!markers) return;
    const built = buildObserverMarkers(candlesRef.current, observers, market, timeframe);
    markers.setMarkers(built);
  }, [observers, market, timeframe]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({
      layout: {
        background: { color: theme.bg },
        textColor: theme.text,
      },
      grid: {
        vertLines: { color: theme.grid },
        horzLines: { color: theme.grid },
      },
      timeScale: { borderColor: theme.border },
      rightPriceScale: { borderColor: theme.border },
    });
  }, [theme.bg, theme.text, theme.grid, theme.border]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    if (chartLoading) {
      setLoading(true);
    } else {
      setLoading(false);
    }
    setError(chartError);
    setErrorDetail(chartError ?? null);
    setErrorStatus(null);
    setShowDetail(false);

    if (chartCandles.length === 0) {
      series.setData([]);
      candlesRef.current = [];
      markersRef.current?.setMarkers([]);
      setDataRange(null);
      if (!chartLoading) {
        chartRef.current?.timeScale().fitContent();
      }
      return;
    }

    const chartData: CandlestickData[] = chartCandles.map((c) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    series.setData(chartData);
    candlesRef.current = chartCandles;
    setDataRange({
      first: chartCandles[0].time,
      last: chartCandles[chartCandles.length - 1].time,
    });
    const built = buildObserverMarkers(chartCandles, observers, market, timeframe);
    markersRef.current?.setMarkers(built);
    chartRef.current?.timeScale().fitContent();
  }, [chartCandles, chartLoading, chartError, observers, market, timeframe, refreshTick]);

  const handleRefresh = useCallback(() => {
    setRefreshTick((n) => n + 1);
  }, []);

  const toggleBackground = useCallback(() => {
    setBackground(background === 'light' ? 'dark' : 'light');
  }, [background, setBackground]);

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <div
        className="flex items-center justify-end gap-2"
        style={{ color: theme.toolbarText }}
      >
        <select
          value={market}
          onChange={(e) => setMarket(e.target.value as MarketSymbol)}
          className="rounded border border-transparent bg-transparent px-2 py-1 text-xs hover:border-border hover:bg-white hover:text-secondary focus:border-primary focus:bg-white focus:text-secondary focus:outline-none"
          style={{ color: theme.toolbarText }}
        >
          {MARKET_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {MARKET_LABELS[m]}
            </option>
          ))}
        </select>
        <span className="opacity-50">·</span>
        <select
          value={timeframe}
          onChange={(e) => setTimeframe(e.target.value as ChartTimeframe)}
          className="rounded border border-transparent bg-transparent px-2 py-1 text-xs hover:border-border hover:bg-white hover:text-secondary focus:border-primary focus:bg-white focus:text-secondary focus:outline-none"
          style={{ color: theme.toolbarText }}
        >
          {TIMEFRAME_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {TIMEFRAME_LABELS[t]}
            </option>
          ))}
        </select>
        <span className="opacity-50">·</span>
        <label
          className="flex items-center gap-1 text-[10px] uppercase tracking-wide"
          style={{ color: theme.toolbarText }}
          title="Cantidad de velas a mostrar"
        >
          <span className="opacity-70">Velas</span>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="rounded border border-transparent bg-transparent px-2 py-1 text-xs hover:border-border hover:bg-white hover:text-secondary focus:border-primary focus:bg-white focus:text-secondary focus:outline-none"
            style={{ color: theme.toolbarText }}
          >
            {CHART_LIMIT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <span
          title={`candles/${chartPairId}/candles`}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
            chartSource === 'firestore'
              ? 'bg-green-100 text-green-700'
              : chartSource === 'http'
              ? 'bg-amber-100 text-amber-700'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              chartSource === 'firestore'
                ? 'bg-green-500'
                : chartSource === 'http'
                ? 'bg-amber-500'
                : 'bg-muted-foreground/40'
            }`}
          />
          {chartSource === 'firestore'
            ? `Firestore · ${chartCandles.length}`
            : chartSource === 'http'
            ? `HTTP · ${chartCandles.length}`
            : chartLoading
            ? 'Cargando...'
            : '—'}
        </span>
        {dataRange && (
          <span
            title={`Última vela: ${formatTimeShort(dataRange.last)}`}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              Math.floor(Date.now() / 1000) - dataRange.last > STALE_DATA_THRESHOLD_SEC
                ? 'bg-red-100 text-red-700'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {formatAge(Math.floor(Date.now() / 1000) - dataRange.last)}
          </span>
        )}
        <button
          type="button"
          onClick={toggleBackground}
          aria-label={background === 'light' ? 'Cambiar a fondo oscuro' : 'Cambiar a fondo claro'}
          title={background === 'light' ? 'Fondo oscuro' : 'Fondo claro'}
          className="ml-1 inline-flex items-center justify-center rounded border border-transparent bg-transparent p-1 hover:border-border hover:bg-white hover:text-secondary"
          style={{ color: theme.toolbarText }}
        >
          {background === 'light' ? (
            <Moon className="h-3.5 w-3.5" />
          ) : (
            <Sun className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading}
          aria-label="Refrescar"
          title="Refrescar datos"
          className="inline-flex items-center justify-center rounded border border-transparent bg-transparent p-1 hover:border-border hover:bg-white hover:text-secondary disabled:opacity-50"
          style={{ color: theme.toolbarText }}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div
        className="relative flex-1 overflow-hidden rounded-md border"
        style={{ borderColor: theme.containerBorder, backgroundColor: theme.containerBg }}
      >
        <div ref={containerRef} className="absolute inset-0" />
        {loading && (
          <div
            className="absolute inset-0 flex items-center justify-center text-xs"
            style={{ backgroundColor: `${theme.containerBg}cc`, color: theme.toolbarText }}
          >
            Cargando...
          </div>
        )}
        {error && !loading && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center"
            style={{ backgroundColor: `${theme.containerBg}e6` }}
          >
            <p className="text-sm font-medium text-red-600">No se pudo cargar la gráfica</p>
            <p
              className="max-w-md text-xs"
              style={{ color: theme.toolbarText }}
            >
              {error}
            </p>
            {errorStatus !== null && (
              <p className="text-[10px]" style={{ color: theme.toolbarText }}>
                HTTP {errorStatus}
              </p>
            )}
            <button
              type="button"
              onClick={() => setShowDetail((s) => !s)}
              className="mt-1 text-xs text-primary underline"
            >
              {showDetail ? 'Ocultar detalles' : 'Ver detalles'}
            </button>
            {showDetail && errorDetail && (
              <pre
                className="mt-2 max-h-40 max-w-md overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-left text-[10px]"
                style={{ color: theme.toolbarText }}
              >
                {errorDetail}
              </pre>
            )}
          </div>
        )}
      </div>

      <p
        className="text-right text-[10px]"
        style={{ color: theme.toolbarText }}
      >
        Gráficos provistos por{' '}
        <a
          href="https://www.tradingview.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-secondary"
        >
          TradingView
        </a>
      </p>
    </div>
  );
}
