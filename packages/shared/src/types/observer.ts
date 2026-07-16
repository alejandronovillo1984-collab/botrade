export type ObserverIndice = 'inbalance' | 'choch' | 'barrido';
export type ObserverTemporalidad = '1m' | '15m' | '30m' | '1h';
export type ObserverMercado = 'nasdaq' | 'sp500';
export type MarketOpen = 'sidney' | 'tokio' | 'nueva_york';

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
