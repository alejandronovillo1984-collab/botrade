import type { SeriesMarker, UTCTimestamp } from 'lightweight-charts';
import {
  CHART_TIMEFRAMES,
  INDICE_LABELS,
  MARKET_OPEN_LABELS,
  type Candle,
  type ChartTimeframe,
  type Observer,
} from '@botrade/shared';
import { isOpeningCandle } from '@botrade/shared';

const INTRADAY_TIMEFRAMES: ChartTimeframe[] = [
  CHART_TIMEFRAMES.M1,
  CHART_TIMEFRAMES.M15,
  CHART_TIMEFRAMES.H1,
];

function isIntraday(timeframe: ChartTimeframe): boolean {
  return INTRADAY_TIMEFRAMES.includes(timeframe);
}

function markerLabel(observer: Observer): string {
  const indiceLabel = INDICE_LABELS[observer.indice];
  if (observer.indice === 'apertura_mercado' && observer.marketOpen) {
    return `${indiceLabel} ${MARKET_OPEN_LABELS[observer.marketOpen]}`;
  }
  return indiceLabel;
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

  for (const observer of relevant) {
    const text = markerLabel(observer);
    for (const candle of candles) {
      if (isOpeningCandle(candle, observer.marketOpen!)) {
        markers.push({
          time: candle.time as UTCTimestamp,
          position: 'aboveBar',
          color: '#2563eb',
          shape: 'circle',
          text,
        });
      }
    }
  }

  return markers;
}
