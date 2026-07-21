import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { z } from 'zod';
import {
  CHART_TIMEFRAMES,
  MARKET_SYMBOLS,
  type ChartTimeframe,
  type MarketSymbol,
} from '@botrade/shared';
import { COLLECTIONS, DEFAULT_REGION, db } from '../config';

const EODHD_BASE_URL = 'https://eodhd.com/api';

const testSchema = z.object({
  market: z
    .enum([MARKET_SYMBOLS.NASDAQ, MARKET_SYMBOLS.SP500])
    .optional(),
  timeframe: z
    .enum([
      CHART_TIMEFRAMES.M1,
      CHART_TIMEFRAMES.M5,
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

interface EodhdTestResult {
  ok: boolean;
  status: number;
  eodhdStatus?: number;
  message: string;
  rawBody?: string;
  url: string;
  sample?: unknown;
}

async function readEodhdKey(): Promise<string | null> {
  const snap = await db.collection(COLLECTIONS.ADMIN_CONFIG).doc('apiKeys').get();
  if (!snap.exists) return null;
  const data = snap.data() as { eodhd?: unknown } | undefined;
  const key = data?.eodhd;
  return typeof key === 'string' && key.length > 0 ? key : null;
}

const SYMBOLS: Record<MarketSymbol, string> = {
  nasdaq: 'NDX.INDX',
  sp500: 'GSPC.INDX',
};

type EodhdKind = 'eod' | 'intraday';

interface PathConfig {
  kind: EodhdKind;
  path: 'eod' | 'intraday';
  interval?: '1m' | '5m' | '1h';
  period?: 'd';
}

const PATH_CONFIG: Record<ChartTimeframe, PathConfig> = {
  '1m': { kind: 'intraday', path: 'intraday', interval: '1m' },
  '5m': { kind: 'intraday', path: 'intraday', interval: '5m' },
  '1h': { kind: 'intraday', path: 'intraday', interval: '1h' },
  '1d': { kind: 'eod', path: 'eod', period: 'd' },
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
): { path: string; from: string; to: string } {
  const symbol = SYMBOLS[market];
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const cfg = PATH_CONFIG[timeframe];
  const fromStr = formatDate(from);
  const toStr = formatDate(to);
  const base = `/${cfg.path}/${encodeURIComponent(symbol)}`;
  if (cfg.kind === 'eod') {
    return {
      path: `${base}?period=${cfg.period ?? 'd'}&fmt=json&from=${fromStr}&to=${toStr}`,
      from: fromStr,
      to: toStr,
    };
  }
  const fromMs = Date.parse(`${fromStr}T00:00:00Z`);
  const toMs = Date.parse(`${toStr}T23:59:59Z`);
  const fromEpoch = Number.isFinite(fromMs) ? Math.floor(fromMs / 1000) : 0;
  const toEpoch = Number.isFinite(toMs) ? Math.floor(toMs / 1000) : Math.floor(Date.now() / 1000);
  return {
    path: `${base}?interval=${cfg.interval}&fmt=json&from=${fromEpoch}&to=${toEpoch}`,
    from: fromStr,
    to: toStr,
  };
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
      apiKey = await readEodhdKey();
    } catch (err) {
      logger.error('Error leyendo la API key de EODHD:', err);
      throw new HttpsError('internal', 'No se pudo leer la API key');
    }

    if (!apiKey) {
      return {
        ok: false,
        status: 503,
        message: 'No hay API key de EODHD configurada en adminConfig/apiKeys.eodhd',
        url: '',
      } satisfies EodhdTestResult;
    }

    const lookbackDays = timeframe === CHART_TIMEFRAMES.M1 ? 5 : 7;
    const { path, from, to } = buildPath(market, timeframe, lookbackDays);
    const url = `${EODHD_BASE_URL}${path}&api_token=${encodeURIComponent(apiKey)}`;
    const displayUrl = url.replace(apiKey, '***');

    logger.info(`[testProvider] → ${displayUrl}`);

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
        url: displayUrl,
      } satisfies EodhdTestResult;
    }

    const body = await response.text().catch(() => '');
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(body);
    } catch {
      parsedBody = null;
    }

    let sample: unknown;
    if (Array.isArray(parsedBody)) {
      sample = (parsedBody as unknown[]).slice(0, 2);
    } else if (parsedBody && typeof parsedBody === 'object') {
      const obj = parsedBody as Record<string, unknown>;
      if (Array.isArray(obj.data)) {
        sample = (obj.data as unknown[]).slice(0, 2);
      } else {
        sample = parsedBody;
      }
    }

    let message: string;
    let candleCount = 0;
    let errorFromProvider: string | null = null;

    if (Array.isArray(parsedBody)) {
      candleCount = parsedBody.length;
    } else if (parsedBody && typeof parsedBody === 'object') {
      const obj = parsedBody as Record<string, unknown>;
      if (Array.isArray(obj.data)) {
        candleCount = (obj.data as unknown[]).length;
        if (!sample) sample = (obj.data as unknown[]).slice(0, 2);
      }
      const errMsg =
        (typeof obj.error === 'string' && (obj.error as string)) ||
        (typeof obj.message === 'string' && (obj.message as string)) ||
        null;
      if (errMsg) errorFromProvider = errMsg;
    }

    if (errorFromProvider) {
      const lower = errorFromProvider.toLowerCase();
      if (
        lower.includes('subscription') ||
        lower.includes('upgrade') ||
        lower.includes('api calls limit') ||
        lower.includes('tier') ||
        lower.includes('exceeded')
      ) {
        message = `Plan de EODHD no cubre este símbolo/timeframe: ${errorFromProvider}`;
      } else {
        message = `EODHD devolvió error: ${errorFromProvider}`;
      }
    } else if (response.ok && candleCount > 0) {
      message = `OK — ${candleCount} velas recibidas (${from} → ${to})`;
    } else if (response.ok) {
      message = 'OK pero sin velas en el rango pedido';
    } else {
      message = `EODHD respondió HTTP ${response.status}`;
    }

    logger.info(
      `[testProvider] ← ${response.status} ${message} body=${body.slice(0, 500)}`
    );

    return {
      ok: response.ok && !errorFromProvider && candleCount > 0,
      status: 200,
      eodhdStatus: response.status,
      message,
      rawBody: body.slice(0, 2000),
      url: displayUrl,
      sample,
    } satisfies EodhdTestResult;
  }
);
