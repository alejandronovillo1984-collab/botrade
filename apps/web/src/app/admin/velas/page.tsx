'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Database,
  CloudDownload,
  Info,
} from 'lucide-react';
import {
  CHART_LIMIT_OPTIONS,
  DEFAULT_CHART_LIMIT,
  useChartCandles,
} from '@/lib/hooks/useChartCandles';
import {
  CHART_TIMEFRAMES,
  MARKET_LABELS,
  MARKET_SYMBOLS,
  TIMEFRAME_LABELS,
  type Candle,
  type ChartTimeframe,
  type MarketSymbol,
} from '@botrade/shared';
import { useAuthRole } from '@/lib/hooks/useAuthRole';
import { Card } from '@/components/ui/Button';

const MARKET_OPTIONS: MarketSymbol[] = [MARKET_SYMBOLS.NASDAQ, MARKET_SYMBOLS.SP500];
const TIMEFRAME_OPTIONS: ChartTimeframe[] = [
  CHART_TIMEFRAMES.M1,
  CHART_TIMEFRAMES.M5,
  CHART_TIMEFRAMES.H1,
  CHART_TIMEFRAMES.D1,
];

const PAGE_SIZE = 50;

function formatNumber(n: number, digits = 2): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatVolume(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return '—';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toLocaleString('en-US');
}

function formatCandleTime(time: number): string {
  const d = new Date(time * 1000);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`;
}

const NYSE_TZ = 'America/New_York';

interface NyTime {
  hour: number;
  minute: number;
  weekday: number;
}

function getNyTime(timeSec: number): NyTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NYSE_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(new Date(timeSec * 1000));
  const lookup = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  const weekdayRaw = lookup('weekday');
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    hour: parseInt(lookup('hour'), 10) % 24,
    minute: parseInt(lookup('minute'), 10),
    weekday: weekdayMap[weekdayRaw] ?? 0,
  };
}

function isMarketHours(timeSec: number): boolean {
  const t = getNyTime(timeSec);
  if (t.weekday === 0 || t.weekday === 6) return false;
  const minutes = t.hour * 60 + t.minute;
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

function isFlatCandle(c: Candle): boolean {
  return c.open === c.high && c.high === c.low && c.low === c.close;
}

type DataSource = 'auto' | 'live';

export default function AdminCandlesPage() {
  const { isSuperAdmin } = useAuthRole();
  const [market, setMarket] = useState<MarketSymbol>(MARKET_SYMBOLS.NASDAQ);
  const [timeframe, setTimeframe] = useState<ChartTimeframe>(CHART_TIMEFRAMES.D1);
  const [limit, setLimit] = useState<number>(DEFAULT_CHART_LIMIT);
  const [sourceMode, setSourceMode] = useState<DataSource>('live');
  const [marketHoursOnly, setMarketHoursOnly] = useState<boolean>(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [page, setPage] = useState(1);

  const { candles, loading, error, source, pairId, requestPath, requestFrom, requestTo } =
    useChartCandles({
      market,
      timeframe,
      refreshTick,
      limit,
      forceHttp: sourceMode === 'live',
    });

  useEffect(() => {
    setPage(1);
  }, [market, timeframe, limit, refreshTick, sourceMode, marketHoursOnly]);

  const filteredCandles = useMemo(
    () => (marketHoursOnly ? candles.filter((c) => isMarketHours(c.time)) : candles),
    [candles, marketHoursOnly]
  );

  const flatCount = useMemo(
    () => filteredCandles.filter(isFlatCandle).length,
    [filteredCandles]
  );

  const totalPages = Math.max(1, Math.ceil(filteredCandles.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const visible = useMemo(
    () => filteredCandles.slice(start, start + PAGE_SIZE),
    [filteredCandles, start]
  );

  if (!isSuperAdmin) {
    return (
      <div className="p-8">
        <Card title="Acceso denegado">
          <p className="text-sm text-muted-foreground">
            Necesitás ser superadmin para ver las velas.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-secondary">Velas</h2>
          <p className="text-sm text-muted-foreground">
            Inspección detallada de velas OHLC por mercado y temporalidad.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <div className="inline-flex rounded-md border border-border bg-white p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => setSourceMode('auto')}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
                sourceMode === 'auto'
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:text-secondary'
              }`}
              title="Lee desde Firestore (candles/{pairId}/candles) y hace fallback a HTTP si está vacío"
            >
              <Database className="h-3.5 w-3.5" />
              Cache (Firestore)
            </button>
            <button
              type="button"
              onClick={() => setSourceMode('live')}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
                sourceMode === 'live'
                  ? 'bg-amber-500 text-white'
                  : 'text-muted-foreground hover:text-secondary'
              }`}
              title="Saltea Firestore y consulta en vivo el endpoint HTTP marketCandles (datos más recientes del proveedor)"
            >
              <CloudDownload className="h-3.5 w-3.5" />
              En vivo (HTTP)
            </button>
          </div>
          <button
            type="button"
            onClick={() => setRefreshTick((n) => n + 1)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm text-secondary shadow-sm hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refrescar
          </button>
        </div>
      </div>

      <Card className="mb-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Mercado
            </label>
            <select
              value={market}
              onChange={(e) => setMarket(e.target.value as MarketSymbol)}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-secondary outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {MARKET_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {MARKET_LABELS[m]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Temporalidad
            </label>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as ChartTimeframe)}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-secondary outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {TIMEFRAME_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {TIMEFRAME_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Cantidad
            </label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-secondary outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {CHART_LIMIT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} velas
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-secondary">
          <input
            type="checkbox"
            checked={marketHoursOnly}
            onChange={(e) => setMarketHoursOnly(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          Solo horario de mercado NYSE (09:30–16:00 ET, lun–vie)
          {marketHoursOnly && flatCount > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              {flatCount} vela(s) plana(s) ocultas
            </span>
          )}
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${
              source === 'firestore'
                ? 'bg-green-100 text-green-700'
                : source === 'http'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-muted text-secondary'
            }`}
          >
            {source === 'firestore' ? (
              <Database className="h-3.5 w-3.5" />
            ) : source === 'http' ? (
              <CloudDownload className="h-3.5 w-3.5" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
            )}
            {source === 'firestore'
              ? `Firestore · ${filteredCandles.length}${marketHoursOnly ? ` / ${candles.length}` : ''}`
              : source === 'http'
              ? `HTTP EODHD · ${filteredCandles.length}${marketHoursOnly ? ` / ${candles.length}` : ''}`
              : loading
              ? 'Cargando...'
              : '—'}
          </span>
          <span className="font-mono">path: candles/{pairId}/candles</span>
        </div>

        {source === 'http' && requestPath && (
          <div className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <p className="mb-1 font-medium text-secondary">Request a EODHD:</p>
            <code className="block break-all font-mono text-[11px]">
              GET https://eodhd.com/api{requestPath}
            </code>
            {requestFrom && requestTo && (
              <p className="mt-1">
                Rango: <span className="font-mono">{requestFrom}</span> →{' '}
                <span className="font-mono">{requestTo}</span> (lookback del timeframe)
              </p>
            )}
          </div>
        )}

        {source === 'http' && sourceMode === 'auto' && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              Firestore no tiene velas para <span className="font-mono">{pairId}</span>.
              Los datos se cargaron en vivo desde el endpoint HTTP
              <span className="font-mono"> marketCandles</span> y <strong>no</strong> se
              persisten. Si querés que queden cacheados en Firestore, ejecutá la
              sincronización correspondiente para este par.
            </p>
          </div>
        )}

        {sourceMode === 'live' && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <CloudDownload className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              Modo <strong>En vivo (HTTP)</strong> activo. Se está consultando
              directamente el endpoint <span className="font-mono">marketCandles</span>{' '}
              de EODHD y se saltea la cache de Firestore. El endpoint tiene su propio
              cache configurable desde <code>/admin/settings</code>, así que esperá un
              poco entre refrescos para ver velas nuevas.
            </p>
          </div>
        )}
      </Card>

      {error && !loading && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Card className="p-0">
        {loading && filteredCandles.length === 0 && candles.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Cargando velas...
          </div>
        ) : filteredCandles.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {candles.length === 0
              ? 'No hay velas disponibles para esta combinación de mercado y temporalidad.'
              : `Ninguna vela en horario de mercado. Hay ${candles.length} vela(s) en total, pero todas caen fuera de 09:30–16:00 ET (lun–vie). Desmarcá "Solo horario de mercado" para verlas.`}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-3 px-4 font-medium">#</th>
                    <th className="py-3 px-4 font-medium">Fecha (UTC)</th>
                    <th className="py-3 px-4 text-right font-medium">Apertura</th>
                    <th className="py-3 px-4 text-right font-medium">Máximo</th>
                    <th className="py-3 px-4 text-right font-medium">Mínimo</th>
                    <th className="py-3 px-4 text-right font-medium">Cierre</th>
                    <th className="py-3 px-4 text-right font-medium">Rango</th>
                    <th className="py-3 px-4 text-right font-medium">Variación</th>
                    <th className="py-3 px-4 text-right font-medium">Volumen</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((c, idx) => {
                    const change = c.close - c.open;
                    const changePct = c.open !== 0 ? (change / c.open) * 100 : 0;
                    const range = c.high - c.low;
                    const isUp = change >= 0;
                    const flat = isFlatCandle(c);
                    return (
                      <tr
                        key={`${c.time}-${idx}`}
                        className={`border-b border-border last:border-b-0 hover:bg-muted/30 ${
                          flat ? 'bg-amber-50/40' : ''
                        }`}
                        title={
                          flat
                            ? 'Vela plana (OHLC idénticos): probable snapshot fuera de horario o vela sintética de EODHD'
                            : undefined
                        }
                      >
                        <td className="py-2.5 px-4 text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            {start + idx + 1}
                            {flat && (
                              <span className="inline-flex rounded-full bg-amber-200 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800">
                                FLAT
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-xs text-secondary">
                          {formatCandleTime(c.time)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-xs text-secondary">
                          {formatNumber(c.open)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-xs text-green-700">
                          {formatNumber(c.high)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-xs text-red-700">
                          {formatNumber(c.low)}
                        </td>
                        <td
                          className={`py-2.5 px-4 text-right font-mono text-xs ${
                            isUp ? 'text-green-700' : 'text-red-700'
                          }`}
                        >
                          {formatNumber(c.close)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-xs text-muted-foreground">
                          {formatNumber(range)}
                        </td>
                        <td
                          className={`py-2.5 px-4 text-right font-mono text-xs ${
                            isUp ? 'text-green-700' : 'text-red-700'
                          }`}
                        >
                          {isUp ? '+' : ''}
                          {formatNumber(change)} ({isUp ? '+' : ''}
                          {formatNumber(changePct)}%)
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-xs text-muted-foreground">
                          {formatVolume(c.volume)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
              <span>
                Mostrando {start + 1}–{Math.min(start + PAGE_SIZE, filteredCandles.length)} de{' '}
                {filteredCandles.length}
                {marketHoursOnly && filteredCandles.length !== candles.length && (
                  <span className="ml-1">(filtrado de {candles.length})</span>
                )}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1 text-secondary hover:bg-muted disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Anterior
                </button>
                <span className="px-2 font-medium text-secondary">
                  Página {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1 text-secondary hover:bg-muted disabled:opacity-40"
                >
                  Siguiente
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
