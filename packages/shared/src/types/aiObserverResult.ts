import type { AiModelProvider } from './aiModel';
import type { ObserverIndice, ObserverTemporalidad, ObserverMercado } from './observer';

export type SkippedReason =
  | 'no_usePrompt'
  | 'unsupported_indice'
  | 'not_implemented'
  | null;

export interface AiObserverResult {
  id: string;
  observerId: string;
  observerIndice: ObserverIndice;
  observerTemporalidad: ObserverTemporalidad;
  observerMercado: ObserverMercado;
  symbol: string;
  candleTimestamp: number;
  provider: AiModelProvider | null;
  model: string | null;
  promptUsed: string | null;
  indicatorMatched: boolean;
  indicatorDetails?: Record<string, unknown>;
  cumplio: boolean | null;
  fuerza: number | null;
  razon?: string | null;
  rawResponse: string | null;
  error?: string | null;
  annotationsMerged: boolean;
  skippedReason: SkippedReason;
  createdAt: string;
}
