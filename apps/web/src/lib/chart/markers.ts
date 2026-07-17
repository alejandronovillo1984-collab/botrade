import type { SeriesMarker, UTCTimestamp } from 'lightweight-charts';
import {
  CHART_TIMEFRAMES,
  INDICE_LABELS,
  MARKET_OPEN_LABELS,
  type Candle,
  type ChartTimeframe,
  type Observer,
} from '@botrade/shared';
import { isFirstIntradayCandleOfDay } from '@botrade/shared';

const INTRADAY_TIMEFRAMES: ChartTimeframe[] = [
  CHART_TIMEFRAMES.M1,
  CHART_TIMEFRAMES.M15,
  CHART_TIMEFRAMES.H1,
];

function isIntraday(timeframe: ChartTimeframe): boolean {
  return INTRADAY_TIMEFRAMES.includes(timeframe);
}

function markerLabel(observer: Observer): string {
  if (observer.indice === 'apertura_mercado' && observer.marketOpen) {
    return MARKET_OPEN_LABELS[observer.marketOpen];
  }
  return INDICE_LABELS[observer.indice];
}

export function buildOpeningMarkers(
  candles: Candle[],
  observers: Observer[],
  chartMarket: Observer['mercado'],
  timeframe: ChartTimeframe
): SeriesMarker<UTCTimestamp>[] {
  if (!isIntraday(timeframe)) return [];

  const relevant = observers.filter(
    (o) =>
      o.isActive &&
      o.indice === 'apertura_mercado' &&
      o.mercado === chartMarket &&
      o.marketOpen !== null
  );

  if (relevant.length === 0) return [];

  const markers: SeriesMarker<UTCTimestamp>[] = [];

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const prev = i > 0 ? candles[i - 1] : null;
    if (!isFirstIntradayCandleOfDay(candle, prev)) continue;
    for (const observer of relevant) {
      markers.push({
        time: candle.time as UTCTimestamp,
        position: 'aboveBar',
        color: '#64748b',
        shape: 'circle',
        size: 0.7,
        text: markerLabel(observer),
      });
    }
  }

  return markers;
}
