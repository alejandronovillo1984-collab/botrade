import type { Candle, Observer, ObserverIndice } from '@botrade/shared';
import { evaluateAperturaMercado } from './apertura_mercado';
import type { IndicatorResult } from '../ai/prompts/default';

export type { IndicatorResult };

export interface RunIndicatorInput {
  indice: ObserverIndice;
  candles: Candle[];
  observer: Observer;
}

export const SUPPORTED_INDICES: ObserverIndice[] = ['apertura_mercado', 'ia'];

export function isSupportedIndice(indice: ObserverIndice): boolean {
  return SUPPORTED_INDICES.includes(indice);
}

export function runIndicator({
  indice,
  candles,
  observer,
}: RunIndicatorInput): IndicatorResult {
  switch (indice) {
    case 'apertura_mercado':
      return evaluateAperturaMercado(candles, observer);
    case 'ia':
      return {
        matched: true,
        details: {
          mode: 'ia',
          reason: 'evaluacion_guiada_por_modelo',
          aiWindow:
            typeof observer.aiWindow === 'number' && observer.aiWindow > 0
              ? Math.floor(observer.aiWindow)
              : 20,
        },
      };
    case 'inbalance':
      return {
        matched: false,
        details: { reason: 'not_implemented', indice },
      };
  }
}
