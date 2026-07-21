import { isFirstIntradayCandleOfDay, type Candle, type Observer } from '@botrade/shared';
import type { IndicatorResult } from '../ai/prompts/default';

export function evaluateAperturaMercado(
  candles: Candle[],
  observer: Observer
): IndicatorResult {
  if (candles.length === 0) {
    return {
      matched: false,
      details: { reason: 'sin_velas' },
    };
  }
  if (!observer.marketOpen) {
    return {
      matched: false,
      details: { reason: 'marketOpen_no_seteado' },
    };
  }

  const lastIndex = candles.length - 1;
  const candle = candles[lastIndex];
  const prev = lastIndex > 0 ? candles[lastIndex - 1] : null;
  const matched = isFirstIntradayCandleOfDay(candle, prev);

  return {
    matched,
    details: {
      marketOpen: observer.marketOpen,
      candleTime: new Date(candle.time * 1000).toISOString(),
    },
  };
}
