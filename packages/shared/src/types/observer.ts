export type ObserverIndice = 'inbalance' | 'apertura_mercado' | 'ia';
export type ObserverTemporalidad = '1m' | '5m' | '1h';
export type ObserverMercado = 'nasdaq' | 'sp500';
export type MarketOpen = 'sidney' | 'tokio' | 'nueva_york';

export const INDICE_LABELS: Record<ObserverIndice, string> = {
  inbalance: 'Inbalance',
  apertura_mercado: 'Apertura de mercado',
  ia: 'IA',
};

export const MARKET_OPEN_LABELS: Record<MarketOpen, string> = {
  sidney: 'Sídney',
  tokio: 'Tokio',
  nueva_york: 'Nueva York',
};

export interface Observer {
  id: string;
  name?: string | null;
  indice: ObserverIndice;
  temporalidad: ObserverTemporalidad;
  mercado: ObserverMercado;
  marketOpen: MarketOpen | null;
  isActive: boolean;
  lookback?: number;
  prompt?: string | null;
  aiWindow?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ObserverCreateInput {
  name?: string | null;
  indice: ObserverIndice;
  temporalidad: ObserverTemporalidad;
  mercado: ObserverMercado;
  marketOpen?: MarketOpen | null;
  isActive?: boolean;
  lookback?: number;
  prompt?: string | null;
  aiWindow?: number | null;
}

export interface ObserverUpdateInput {
  name?: string | null;
  indice?: ObserverIndice;
  temporalidad?: ObserverTemporalidad;
  mercado?: ObserverMercado;
  marketOpen?: MarketOpen | null;
  isActive?: boolean;
  lookback?: number;
  prompt?: string | null;
  aiWindow?: number | null;
}
