import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { z } from 'zod';
import {
  CHART_TIMEFRAMES,
  MARKET_SYMBOLS,
  TIMEFRAME_SPEC,
  type ChartTimeframe,
  type MarketSymbol,
} from '@botrade/shared';
import { COLLECTIONS, DEFAULT_REGION, db } from '../config';

const MASSIVE_BASE_URL = 'https://api.massive.com';

const testSchema = z.object({
  market: z
    .enum([MARKET_SYMBOLS.NASDAQ, MARKET_SYMBOLS.SP500])
    .optional(),
  timeframe: z
    .enum([
      CHART_TIMEFRAMES.M1,
      CHART_TIMEFRAMES.M15,
      CHART_TIMEFRAMES.H1,
      CHART_TIMEFRAMES.D1,
    ])
    .optional(),
});

function requireSuperAdmin(request: CallableRequest<unknown>): void {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  const role = (request.auth.token as { role?: unknown } | undefined)?.role;
  if (!role || role !== 'superadmin') {
    throw new HttpsError('permission-denied', 'Solo los superadmins pueden probar la conexión');
  }
}

interface FmpTestResult {
  ok: boolean;
  status: number;
  fmpStatus?: number;
  message: string;
  rawBody?: string;
  url: string;
  sample?: unknown;
}

async function readMassiveKey(): Promise<string | null> {
  const snap = await db.collection(COLLECTIONS.ADMIN_CONFIG).doc('apiKeys').get();
  if (!snap.exists) return null;
  const data = snap.data() as { massive?: unknown } | undefined;
  const key = data?.massive;
  return typeof key === 'string' && key.length > 0 ? key : null;
}

const SYMBOLS: Record<MarketSymbol, string> = {
  nasdaq: 'I:NDX',
  sp500: 'I:SPX',
};

function formatDate(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function buildPath(
  market: MarketSymbol,
  timeframe: ChartTimeframe,
  days: number
): string {
  const symbol = SYMBOLS[market];
  const spec = TIMEFRAME_SPEC[timeframe];
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return `v2/aggs/ticker/${encodeURIComponent(symbol)}/range/${spec.multiplier}/${
    spec.timespan
  }/${formatDate(from)}/${formatDate(to)}`;
}

export const testProviderConnection = onCall(
  {
    region: DEFAULT_REGION,
    cors: true,
  },
  async (request) => {
    requireSuperAdmin(request);

    const parsed = testSchema.safeParse(request.data ?? {});
    const query = parsed.success ? parsed.data : {};
    const market: MarketSymbol = query.market ?? MARKET_SYMBOLS.NASDAQ;
    const timeframe: ChartTimeframe = query.timeframe ?? CHART_TIMEFRAMES.D1;

    let apiKey: string | null;
    try {
      apiKey = await readMassiveKey();
    } catch (err) {
      logger.error('Error leyendo la API key de Massive:', err);
      throw new HttpsError('internal', 'No se pudo leer la API key');
    }

    if (!apiKey) {
      return {
        ok: false,
        status: 503,
        message: 'No hay API key de Massive configurada en adminConfig/apiKeys.massive',
        url: '',
      } satisfies FmpTestResult;
    }

    const path = buildPath(market, timeframe, 7);
    const url = `${MASSIVE_BASE_URL}/${path}?apiKey=${encodeURIComponent(apiKey)}`;

    logger.info(`[testProvider] → ${url.replace(apiKey, '***')}`);

    let response: Response;
    try {
      response = await fetch(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[testProvider] network error', err);
      return {
        ok: false,
        status: 502,
        message: `Error de red: ${message}`,
        url: url.replace(apiKey, '***'),
      } satisfies FmpTestResult;
    }

    const body = await response.text().catch(() => '');
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(body);
    } catch {
      parsedBody = null;
    }

    let sample: unknown;
    if (parsedBody && typeof parsedBody === 'object' && Array.isArray((parsedBody as { results?: unknown }).results)) {
      sample = ((parsedBody as { results: unknown[] }).results).slice(0, 2);
    } else if (parsedBody && typeof parsedBody === 'object') {
      sample = parsedBody;
    }

    let message: string;
    const obj = parsedBody as {
      status?: string;
      resultsCount?: number;
      queryCount?: number;
      results?: unknown[];
      error?: string;
      message?: string;
    } | null;

    const hasErrorField = !!obj && (typeof obj.error === 'string' || obj.status === 'ERROR');
    const candleCount = Array.isArray(obj?.results) ? obj.results.length : 0;

    if (hasErrorField) {
      const errMsg = obj?.error || obj?.message || obj?.status || 'Error desconocido';
      message = `Massive devolvió error: ${errMsg}`;
    } else if (response.ok && candleCount > 0) {
      message = `OK — ${candleCount} velas recibidas`;
    } else if (response.ok) {
      message = 'OK pero sin velas en el rango pedido';
    } else {
      message = `Massive respondió HTTP ${response.status}`;
    }

    logger.info(
      `[testProvider] ← ${response.status} ${message} body=${body.slice(0, 500)}`
    );

    return {
      ok: response.ok && !hasErrorField && candleCount > 0,
      status: 200,
      fmpStatus: response.status,
      message,
      rawBody: body.slice(0, 2000),
      url: url.replace(apiKey, '***'),
      sample,
    } satisfies FmpTestResult;
  }
);
