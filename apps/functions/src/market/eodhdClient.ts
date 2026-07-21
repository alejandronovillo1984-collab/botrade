import { logger } from 'firebase-functions/v2';
import {
  PROVIDER_SYMBOL,
  TIMEFRAME_SPEC,
  type Candle,
  type ChartTimeframe,
  type MarketSymbol,
} from '@botrade/shared';
import { COLLECTIONS, db } from '../config';

const EODHD_BASE_URL = 'https://eodhd.com/api';
const DEFAULT_CACHE_TTL_SECONDS = 900;

interface CacheEntry {
  expiresAt: number;
  candles: Candle[];
}

const cache = new Map<string, CacheEntry>();

type EodhdKind = 'eod' | 'intraday';

interface IntervalConfig {
  kind: EodhdKind;
  path: 'eod' | 'intraday';
  interval?: '1m' | '5m' | '1h';
  period?: 'd';
}

const TIMEFRAME_INTERVAL: Record<ChartTimeframe, IntervalConfig> = {
  '1m': { kind: 'intraday', path: 'intraday', interval: '1m' },
  '5m': { kind: 'intraday', path: 'intraday', interval: '5m' },
  '1h': { kind: 'intraday', path: 'intraday', interval: '1h' },
  '1d': { kind: 'eod', path: 'eod', period: 'd' },
};

function getCacheKey(
  symbol: string,
  path: string,
  qualifier: string,
  from: string,
  to: string
): string {
  return `${symbol}::${path}::${qualifier}::${from}::${to}`;
}

function formatDate(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function dateRangeFor(timeframe: ChartTimeframe): { from: string; to: string } {
  const { lookbackDays } = TIMEFRAME_SPEC[timeframe];
  const to = new Date();
  const from = new Date(to.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  return { from: formatDate(from), to: formatDate(to) };
}

function dateRangeAsEpoch(timeframe: ChartTimeframe): { from: number; to: number } {
  const { lookbackDays } = TIMEFRAME_SPEC[timeframe];
  const toMs = Date.now();
  const fromMs = toMs - lookbackDays * 24 * 60 * 60 * 1000;
  return { from: Math.floor(fromMs / 1000), to: Math.floor(toMs / 1000) };
}

interface EodhdEodBar {
  date?: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  adjusted_close?: number;
  volume?: number;
}

interface EodhdIntradayBar {
  timestamp?: number;
  datetime?: string;
  gmtoffset?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
}

function parseEodhdEodDateToEpochSeconds(raw: string): number | null {
  if (!raw) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
  if (dateOnly.test(raw)) {
    const ms = Date.parse(`${raw}T00:00:00Z`);
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
  }
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function normalizeBars(raw: unknown, kind: EodhdKind): Candle[] {
  if (!Array.isArray(raw)) return [];

  const candles: Candle[] = [];
  for (const bar of raw) {
    if (!bar || typeof bar !== 'object') continue;
    const open = Number((bar as Record<string, unknown>).open);
    const high = Number((bar as Record<string, unknown>).high);
    const low = Number((bar as Record<string, unknown>).low);
    const close = Number((bar as Record<string, unknown>).close);
    if (![open, high, low, close].every((n) => Number.isFinite(n))) continue;

    let timeSec: number | null = null;
    if (kind === 'eod') {
      const dateStr = (bar as EodhdEodBar).date;
      if (typeof dateStr === 'string') {
        timeSec = parseEodhdEodDateToEpochSeconds(dateStr);
      }
    } else {
      const ts = (bar as EodhdIntradayBar).timestamp;
      if (typeof ts === 'number' && Number.isFinite(ts)) {
        timeSec = Math.floor(ts);
      } else {
        const dt = (bar as EodhdIntradayBar).datetime;
        if (typeof dt === 'string') {
          const normalized = dt.includes('T') ? dt : dt.replace(' ', 'T') + 'Z';
          const ms = Date.parse(normalized);
          if (Number.isFinite(ms)) timeSec = Math.floor(ms / 1000);
        }
      }
    }

    if (timeSec === null) continue;

    const volumeRaw = (bar as Record<string, unknown>).volume;
    const volume =
      typeof volumeRaw === 'number' && Number.isFinite(volumeRaw)
        ? volumeRaw
        : undefined;

    const candle: Candle =
      volume !== undefined
        ? { time: timeSec, open, high, low, close, volume }
        : { time: timeSec, open, high, low, close };

    candles.push(candle);
  }

  candles.sort((a, b) => a.time - b.time);
  return candles;
}

async function getEodhdApiKey(): Promise<string | null> {
  const snap = await db.collection(COLLECTIONS.ADMIN_CONFIG).doc('apiKeys').get();
  if (!snap.exists) return null;
  const data = snap.data() as { eodhd?: unknown } | undefined;
  const key = data?.eodhd;
  return typeof key === 'string' && key.length > 0 ? key : null;
}

async function getCacheTtlMs(): Promise<number> {
  try {
    const snap = await db
      .collection(COLLECTIONS.ADMIN_CONFIG)
      .doc('marketData')
      .get();
    if (!snap.exists) return DEFAULT_CACHE_TTL_SECONDS * 1000;
    const data = snap.data() as { cacheTtlSeconds?: unknown } | undefined;
    const value = Number(data?.cacheTtlSeconds);
    if (!Number.isFinite(value) || value <= 0) {
      return DEFAULT_CACHE_TTL_SECONDS * 1000;
    }
    return value * 1000;
  } catch (err) {
    logger.warn('[eodhdClient] No se pudo leer cacheTtlSeconds, usando default:', err);
    return DEFAULT_CACHE_TTL_SECONDS * 1000;
  }
}

export interface FetchCandlesParams {
  market: MarketSymbol;
  timeframe: ChartTimeframe;
  limit?: number;
}

export interface FetchCandlesResult {
  symbol: string;
  interval: string;
  candles: Candle[];
  requestPath: string;
  from: string;
  to: string;
}

export class EodhdFetchError extends Error {
  constructor(
    public readonly code:
      | 'no_api_key'
      | 'network'
      | 'provider_error'
      | 'plan_upgrade_required'
      | 'invalid_response'
      | 'empty'
      | 'unsupported_timeframe',
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'EodhdFetchError';
  }
}

function isPlanUpgradeError(status: number, body: string): boolean {
  if (status === 401 || status === 402 || status === 403) {
    return /subscription|upgrade|plan|api calls limit|tier|exceeded/i.test(body);
  }
  return /subscription|upgrade your plan|api calls limit|exceeded the allowed/i.test(body);
}

function extractErrorMessage(body: string, parsed: unknown): string {
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.error === 'string') return obj.error;
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.msg === 'string') return obj.msg;
  }
  return body;
}

function buildRequestPath(
  symbol: string,
  config: IntervalConfig,
  dateRange: { from: string; to: string }
): string {
  const base = `/${config.path}/${encodeURIComponent(symbol)}`;
  if (config.kind === 'eod') {
    return `${base}?period=${config.period ?? 'd'}&fmt=json&from=${dateRange.from}&to=${dateRange.to}`;
  }
  const epoch = dateRangeAsEpochFromDateRange(dateRange);
  return `${base}?interval=${config.interval}&fmt=json&from=${epoch.from}&to=${epoch.to}`;
}

function dateRangeAsEpochFromDateRange(dateRange: { from: string; to: string }): { from: number; to: number } {
  const fromMs = Date.parse(`${dateRange.from}T00:00:00Z`);
  const toMs = Date.parse(`${dateRange.to}T23:59:59Z`);
  return {
    from: Number.isFinite(fromMs) ? Math.floor(fromMs / 1000) : 0,
    to: Number.isFinite(toMs) ? Math.floor(toMs / 1000) : Math.floor(Date.now() / 1000),
  };
}

function buildFetchUrl(
  symbol: string,
  config: IntervalConfig,
  dateRange: { from: string; to: string },
  apiKey: string
): string {
  const base = `${EODHD_BASE_URL}/${config.path}/${encodeURIComponent(symbol)}`;
  const params = [`api_token=${encodeURIComponent(apiKey)}`, 'fmt=json'];
  if (config.kind === 'eod') {
    params.push(`period=${config.period ?? 'd'}`);
    params.push(`from=${dateRange.from}`);
    params.push(`to=${dateRange.to}`);
  } else {
    const epoch = dateRangeAsEpochFromDateRange(dateRange);
    params.push(`interval=${config.interval}`);
    params.push(`from=${epoch.from}`);
    params.push(`to=${epoch.to}`);
  }
  return `${base}?${params.join('&')}`;
}

export async function fetchCandles({
  market,
  timeframe,
  limit,
}: FetchCandlesParams): Promise<FetchCandlesResult> {
  const spec = TIMEFRAME_SPEC[timeframe];
  if (!spec) {
    throw new EodhdFetchError(
      'unsupported_timeframe',
      `Timeframe no soportado: ${timeframe}`
    );
  }

  const symbol = PROVIDER_SYMBOL[market];
  const config = TIMEFRAME_INTERVAL[timeframe];
  const dateRange = dateRangeFor(timeframe);

  const qualifier = config.kind === 'eod' ? `period=${config.period ?? 'd'}` : `interval=${config.interval}`;
  const cacheKey = getCacheKey(symbol, config.path, qualifier, dateRange.from, dateRange.to);
  const cached = cache.get(cacheKey);
  const cacheTtlMs = await getCacheTtlMs();

  if (cached && cached.expiresAt > Date.now()) {
    const sliced =
      typeof limit === 'number' ? cached.candles.slice(-limit) : cached.candles;
    return {
      symbol,
      interval: qualifier,
      candles: sliced,
      requestPath: buildRequestPath(symbol, config, dateRange),
      from: dateRange.from,
      to: dateRange.to,
    };
  }

  let apiKey: string | null;
  try {
    apiKey = await getEodhdApiKey();
  } catch (err) {
    logger.error('Error leyendo la API key de EODHD desde adminConfig:', err);
    throw new EodhdFetchError(
      'no_api_key',
      'No se pudo leer la configuración del proveedor de datos'
    );
  }

  if (!apiKey) {
    throw new EodhdFetchError(
      'no_api_key',
      'Falta configurar la API key de EODHD. Cargala en /admin/settings como superadmin.'
    );
  }

  const url = buildFetchUrl(symbol, config, dateRange, apiKey);

  logger.info(
    `EODHD request: ${market} ${timeframe} → ${url.replace(apiKey, '***')}`
  );

  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Error de red al consultar EODHD (${market} ${timeframe}):`, err);
    throw new EodhdFetchError(
      'network',
      `No se pudo contactar al proveedor de datos: ${message}`
    );
  }

  const responseBody = await response.text().catch(() => '');

  if (!response.ok) {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(responseBody);
    } catch {
      parsed = null;
    }
    const detail = extractErrorMessage(responseBody, parsed);
    logger.error(
      `EODHD status ${response.status} para ${market} ${timeframe}: ${responseBody.slice(0, 1000)}`
    );
    if (isPlanUpgradeError(response.status, responseBody)) {
      throw new EodhdFetchError(
        'plan_upgrade_required',
        `Tu plan de EODHD no incluye ${symbol} en ${timeframe}: ${detail}. Revisá tu suscripción en https://eodhd.com/pricing.`,
        response.status
      );
    }
    throw new EodhdFetchError(
      'provider_error',
      `El proveedor de datos respondió con error ${response.status}: ${detail.slice(0, 500)}`,
      response.status
    );
  }

  let parsedBody: unknown = null;
  try {
    parsedBody = JSON.parse(responseBody);
  } catch (err) {
    logger.error(
      `Respuesta inválida de EODHD (${market} ${timeframe}): ${responseBody.slice(0, 500)}`
    );
    throw new EodhdFetchError(
      'invalid_response',
      'Respuesta inválida del proveedor de datos'
    );
  }

  let bars: unknown = parsedBody;
  if (parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody)) {
    const obj = parsedBody as Record<string, unknown>;
    if (Array.isArray(obj.data)) {
      bars = obj.data;
    } else if (typeof obj.error === 'string' || typeof obj.message === 'string') {
      const message = (obj.error as string) ?? (obj.message as string);
      logger.error(`EODHD devolvió error para ${market} ${timeframe}: ${message}`);
      if (isPlanUpgradeError(response.status, message)) {
        throw new EodhdFetchError(
          'plan_upgrade_required',
          `Tu plan de EODHD no incluye ${symbol} en ${timeframe}: ${message}. Revisá tu suscripción en https://eodhd.com/pricing.`,
          response.status
        );
      }
      throw new EodhdFetchError(
        'provider_error',
        `El proveedor de datos rechazó la consulta: ${message}`
      );
    }
  }

  const candles = normalizeBars(bars, config.kind);

  if (candles.length === 0) {
    const count = Array.isArray(bars) ? bars.length : 0;
    logger.warn(
      `EODHD no devolvió velas para ${market} ${timeframe} (${count} resultados)`
    );
    throw new EodhdFetchError(
      'empty',
      `El proveedor no devolvió velas para esta combinación (${count} resultados). ¿Tu plan de EODHD cubre ${symbol} en ${timeframe}?`
    );
  }

  cache.set(cacheKey, {
    expiresAt: Date.now() + cacheTtlMs,
    candles,
  });

  const sliced =
    typeof limit === 'number' ? candles.slice(-limit) : candles;

  return {
    symbol,
    interval: qualifier,
    candles: sliced,
    requestPath: buildRequestPath(symbol, config, dateRange),
    from: dateRange.from,
    to: dateRange.to,
  };
}
