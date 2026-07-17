export type ObserverIndice = 'inbalance' | 'choch' | 'barrido' | 'apertura_mercado';
export type ObserverTemporalidad = '1m' | '15m' | '30m' | '1h';
export type ObserverMercado = 'nasdaq' | 'sp500';
export type MarketOpen = 'sidney' | 'tokio' | 'nueva_york';

export const INDICE_LABELS: Record<ObserverIndice, string> = {
  inbalance: 'Inbalance',
  choch: 'CHoCH',
  barrido: 'Barrido',
  apertura_mercado: 'Apertura de mercado',
};

export const MARKET_OPEN_LABELS: Record<MarketOpen, string> = {
  sidney: 'Sídney',
  tokio: 'Tokio',
  nueva_york: 'Nueva York',
};

export interface Observer {
  id: string;
  indice: ObserverIndice;
  temporalidad: ObserverTemporalidad;
  mercado: ObserverMercado;
  marketOpen: MarketOpen | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ObserverCreateInput {
  indice: ObserverIndice;
  temporalidad: ObserverTemporalidad;
  mercado: ObserverMercado;
  marketOpen?: MarketOpen | null;
  isActive?: boolean;
}

export interface ObserverUpdateInput {
  indice?: ObserverIndice;
  temporalidad?: ObserverTemporalidad;
  mercado?: ObserverMercado;
  marketOpen?: MarketOpen | null;
  isActive?: boolean;
}
