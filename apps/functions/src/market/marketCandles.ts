import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { z } from 'zod';
import {
  CHART_TIMEFRAMES,
  MARKET_SYMBOLS,
  type Candle,
  type ChartTimeframe,
  type MarketSymbol,
} from '@botrade/shared';
import { DEFAULT_REGION } from '../config';
import { EodhdFetchError, fetchCandles } from './eodhdClient';

const querySchema = z.object({
  market: z.enum([
    MARKET_SYMBOLS.NASDAQ,
    MARKET_SYMBOLS.SP500,
  ]),
  timeframe: z.enum([
    CHART_TIMEFRAMES.M1,
    CHART_TIMEFRAMES.M5,
    CHART_TIMEFRAMES.H1,
    CHART_TIMEFRAMES.D1,
  ]),
  limit: z
    .preprocess((v) => (typeof v === 'string' ? Number(v) : v), z.number().int().positive().max(10000))
    .optional(),
});

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

    const { market, timeframe, limit } = parsed.data;

    let result: {
      symbol: string;
      candles: Candle[];
      requestPath: string;
      from: string;
      to: string;
    };
    try {
      const fetched = await fetchCandles({ market, timeframe, limit });
      result = {
        symbol: fetched.symbol,
        candles: fetched.candles,
        requestPath: fetched.requestPath,
        from: fetched.from,
        to: fetched.to,
      };
    } catch (err) {
      if (err instanceof EodhdFetchError) {
        switch (err.code) {
          case 'no_api_key':
            response.status(503).json({ error: err.message });
            return;
          case 'network':
            response.status(502).json({ error: 'No se pudo contactar al proveedor de datos' });
            return;
          case 'empty':
            response.status(404).json({
              error: 'El proveedor no devolvió velas para esta combinación',
              detail: err.message,
              provider: 'eodhd',
              market,
              timeframe,
            });
            return;
          case 'plan_upgrade_required':
            response.status(402).json({
              error: err.message,
              code: 'plan_upgrade_required',
              provider: 'eodhd',
              market,
              timeframe,
            });
            return;
          case 'invalid_response':
            response.status(502).json({ error: err.message });
            return;
          case 'unsupported_timeframe':
            response.status(400).json({ error: err.message });
            return;
          case 'provider_error':
          default:
            response.status(502).json({
              error: `El proveedor de datos respondió con error ${err.status ?? 500}`,
              detail: err.message,
              provider: 'eodhd',
              market,
              timeframe,
            });
            return;
        }
      }
      logger.error(`Error inesperado en marketCandles (${market} ${timeframe}):`, err);
      response.status(500).json({ error: 'Error inesperado' });
      return;
    }

    const payload: {
      market: MarketSymbol;
      timeframe: ChartTimeframe;
      candles: Candle[];
      requestPath: string;
      from: string;
      to: string;
    } = {
      market,
      timeframe,
      candles: result.candles,
      requestPath: result.requestPath,
      from: result.from,
      to: result.to,
    };
    response.status(200).json(payload);
  }
);
