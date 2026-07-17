import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { z } from 'zod';
import {
  CHART_TIMEFRAMES,
  PROVIDER_SYMBOL,
  MARKET_SYMBOLS,
  TIMEFRAME_SPEC,
  type Candle,
  type ChartTimeframe,
  type MarketSymbol,
} from '@botrade/shared';
import { COLLECTIONS, DEFAULT_REGION, db } from '../config';

const querySchema = z.object({
  market: z.enum([
    MARKET_SYMBOLS.NASDAQ,
    MARKET_SYMBOLS.SP500,
  ]),
  timeframe: z.enum([
    CHART_TIMEFRAMES.M1,
    CHART_TIMEFRAMES.M15,
    CHART_TIMEFRAMES.H1,
    CHART_TIMEFRAMES.D1,
  ]),
});

const MASSIVE_BASE_URL = 'https://api.massive.com';
const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  expiresAt: number;
  payload: { market: MarketSymbol; timeframe: ChartTimeframe; candles: Candle[] };
}

const cache = new Map<string, CacheEntry>();

function getCacheKey(market: MarketSymbol, timeframe: ChartTimeframe): string {
  return `${market}::${timeframe}`;
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

interface MassiveBar {
  o: number;
  h: number;
  l: number;
  c: number;
  t: number;
  v?: number;
}

interface MassiveResponse {
  ticker?: string;
  status?: string;
  resultsCount?: number;
  results?: MassiveBar[];
  error?: string;
  message?: string;
}

function normalizeBars(raw: MassiveResponse | null | undefined): Candle[] {
  if (!raw || !Array.isArray(raw.results)) return [];

  const candles: Candle[] = [];
  for (const bar of raw.results) {
    const open = Number(bar.o);
    const high = Number(bar.h);
    const low = Number(bar.l);
    const close = Number(bar.c);
    const timeMs = Number(bar.t);
    if (![open, high, low, close, timeMs].every((n) => Number.isFinite(n))) continue;

    const timeSec = Math.floor(timeMs / 1000);
    const volume =
      typeof bar.v === 'number' && Number.isFinite(bar.v) ? bar.v : undefined;

    const candle: Candle = volume !== undefined
      ? { time: timeSec, open, high, low, close, volume }
      : { time: timeSec, open, high, low, close };

    candles.push(candle);
  }

  candles.sort((a, b) => a.time - b.time);
  return candles;
}

async function getMassiveApiKey(): Promise<string | null> {
  const snap = await db.collection(COLLECTIONS.ADMIN_CONFIG).doc('apiKeys').get();
  if (!snap.exists) return null;
  const data = snap.data() as { massive?: unknown } | undefined;
  const key = data?.massive;
  return typeof key === 'string' && key.length > 0 ? key : null;
}

function setCorsHeaders(response: { set: (name: string, value: string) => void }): void {
  response.set('Access-Control-Allow-Origin', '*');
  response.set('Access-Control-Allow-Methods', 'GET,OPTIONS');
  response.set('Access-Control-Allow-Headers', 'Content-Type');
}

export const marketCandles = onRequest(
  {
    region: DEFAULT_REGION,
    cors: true,
  },
  async (request, response) => {
    setCorsHeaders(response);

    if (request.method === 'OPTIONS') {
      response.status(204).send('');
      return;
    }

    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({
        error: 'Parámetros inválidos',
        details: parsed.error.flatten(),
      });
      return;
    }

    const { market, timeframe } = parsed.data;
    const cacheKey = getCacheKey(market, timeframe);
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      response.status(200).json(cached.payload);
      return;
    }

    let apiKey: string | null;
    try {
      apiKey = await getMassiveApiKey();
    } catch (err) {
      logger.error('Error leyendo la API key de Massive desde adminConfig:', err);
      response.status(500).json({
        error: 'No se pudo leer la configuración del proveedor de datos',
      });
      return;
    }

    if (!apiKey) {
      response.status(503).json({
        error:
          'Falta configurar la API key de Massive. Cargala en /admin/settings como superadmin.',
      });
      return;
    }

    const symbol = PROVIDER_SYMBOL[market];
    const spec = TIMEFRAME_SPEC[timeframe];
    const { from, to } = dateRangeFor(timeframe);

    const url =
      `${MASSIVE_BASE_URL}/v2/aggs/ticker/${encodeURIComponent(symbol)}` +
      `/range/${spec.multiplier}/${spec.timespan}/${from}/${to}` +
      `?apiKey=${encodeURIComponent(apiKey)}`;

    logger.info(
      `Massive request: ${market} ${timeframe} → ${url.replace(apiKey, '***')}`
    );

    let massiveResponse: Response;
    try {
      massiveResponse = await fetch(url);
    } catch (err) {
      logger.error(`Error de red al consultar Massive (${market} ${timeframe}):`, err);
      response.status(502).json({ error: 'No se pudo contactar al proveedor de datos' });
      return;
    }

    const responseBody = await massiveResponse.text().catch(() => '');

    if (!massiveResponse.ok) {
      logger.error(
        `Massive status ${massiveResponse.status} para ${market} ${timeframe}: ${responseBody.slice(0, 1000)}`
      );
      let detail = responseBody;
      try {
        const parsedBody = JSON.parse(responseBody) as { error?: string; message?: string };
        if (parsedBody && typeof parsedBody.message === 'string') {
          detail = parsedBody.message;
        } else if (parsedBody && typeof parsedBody.error === 'string') {
          detail = parsedBody.error;
        }
      } catch {
        // body no era JSON
      }
      response.status(502).json({
        error: `El proveedor de datos respondió con error ${massiveResponse.status}`,
        detail: detail.slice(0, 500),
        provider: 'massive',
        market,
        timeframe,
      });
      return;
    }

    let parsedBody: MassiveResponse | null = null;
    try {
      parsedBody = JSON.parse(responseBody) as MassiveResponse;
    } catch (err) {
      logger.error(
        `Respuesta inválida de Massive (${market} ${timeframe}): ${responseBody.slice(0, 500)}`
      );
      response.status(502).json({ error: 'Respuesta inválida del proveedor de datos' });
      return;
    }

    if (parsedBody && typeof parsedBody === 'object' && 'error' in parsedBody) {
      const message = parsedBody.error || parsedBody.message || 'Error desconocido del proveedor';
      logger.error(`Massive devolvió error para ${market} ${timeframe}: ${message}`);
      response.status(502).json({
        error: 'El proveedor de datos rechazó la consulta',
        detail: message,
        provider: 'massive',
      });
      return;
    }

    if (parsedBody?.status === 'ERROR') {
      const message = parsedBody.message ?? parsedBody.status ?? 'ERROR';
      logger.error(`Massive status ERROR para ${market} ${timeframe}: ${message}`);
      response.status(502).json({
        error: 'El proveedor devolvió estado ERROR',
        detail: typeof message === 'string' ? message : JSON.stringify(message),
        provider: 'massive',
      });
      return;
    }

    const candles = normalizeBars(parsedBody);

    if (candles.length === 0) {
      const count = parsedBody?.results?.length ?? 0;
      logger.warn(
        `Massive no devolvió velas para ${market} ${timeframe} (results=${count})`
      );
      response.status(404).json({
        error: 'El proveedor no devolvió velas para esta combinación',
        detail: `${count} resultados. ¿Tu plan cubre ${symbol} en ${spec.timespan}?`,
        provider: 'massive',
        market,
        timeframe,
      });
      return;
    }

    const payload = { market, timeframe, candles };
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
    response.status(200).json(payload);
  }
);
