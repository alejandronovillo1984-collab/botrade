export const MARKET_SYMBOLS = {
  NASDAQ: 'nasdaq',
  SP500: 'sp500',
} as const;

export type MarketSymbol = (typeof MARKET_SYMBOLS)[keyof typeof MARKET_SYMBOLS];

export const CHART_TIMEFRAMES = {
  M1: '1m',
  M5: '5m',
  H1: '1h',
  D1: '1d',
} as const;

export type ChartTimeframe = (typeof CHART_TIMEFRAMES)[keyof typeof CHART_TIMEFRAMES];

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface CandlesResponse {
  market: MarketSymbol;
  timeframe: ChartTimeframe;
  candles: Candle[];
  requestPath?: string;
  from?: string;
  to?: string;
}

export const PROVIDER_SYMBOL: Record<MarketSymbol, string> = {
  nasdaq: 'NDX.INDX',
  sp500: 'GSPC.INDX',
};

export const MARKET_LABELS: Record<MarketSymbol, string> = {
  nasdaq: 'NASDAQ 100',
  sp500: 'S&P 500',
};

export const TIMEFRAME_LABELS: Record<ChartTimeframe, string> = {
  '1m': '1 min',
  '5m': '5 min',
  '1h': '1 hora',
  '1d': '1 día',
};

export interface TimeframeSpec {
  multiplier: number;
  timespan: 'minute' | 'hour' | 'day';
  lookbackDays: number;
  chartWindow: number;
}

export const TIMEFRAME_SPEC: Record<ChartTimeframe, TimeframeSpec> = {
  '1m': { multiplier: 1, timespan: 'minute', lookbackDays: 120, chartWindow: 2000 },
  '5m': { multiplier: 5, timespan: 'minute', lookbackDays: 600, chartWindow: 1500 },
  '1h': { multiplier: 1, timespan: 'hour', lookbackDays: 730, chartWindow: 500 },
  '1d': { multiplier: 1, timespan: 'day', lookbackDays: 365, chartWindow: 500 },
};

export const API_KEY_PROVIDERS = ['eodhd'] as const;
export type ApiKeyProvider = (typeof API_KEY_PROVIDERS)[number];
