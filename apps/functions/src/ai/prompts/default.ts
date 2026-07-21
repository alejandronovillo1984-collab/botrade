import {
  INDICE_LABELS,
  MARKET_OPEN_LABELS,
  type Candle,
  type Observer,
} from '@botrade/shared';

export interface IndicatorResult {
  matched: boolean;
  details: Record<string, unknown>;
}

export interface PromptContext {
  observer: Observer;
  candles: Candle[];
  indicatorResult: IndicatorResult;
  symbol: string;
}

function indicatorDescriptor(observer: Observer): string {
  switch (observer.indice) {
    case 'ia': {
      const window =
        typeof observer.aiWindow === 'number' && observer.aiWindow > 0
          ? observer.aiWindow
          : 20;
      return `Observador guiado por IA. No hay indicador técnico previo: la decisión la toma el modelo sobre las últimas ${window} velas según el prompt del observador.`;
    }
    case 'apertura_mercado': {
      const label = observer.marketOpen
        ? MARKET_OPEN_LABELS[observer.marketOpen]
        : 'la apertura configurada';
      return `Apertura de mercado (${label}). Matchea en la primera vela intradía del día según el huso horario NYSE.`;
    }
    case 'inbalance':
      return 'Inbalance / Fair Value Gap entre tres velas consecutivas.';
  }
}

function indicatorOutcome(indicator: IndicatorResult): string {
  if (indicator.matched) {
    return 'El indicador TUVO match en la última vela.';
  }
  return 'El indicador NO tuvo match en la última vela.';
}

export const DEFAULT_SYSTEM_PROMPT =
  'Sos un analista técnico cuantitativo. Recibirás una serie de velas OHLC ordenadas de la más antigua a la más reciente, y el resultado de un indicador técnico calculado sobre la última vela. Tu única tarea es evaluar si el patrón descrito se cumplió o no, y con qué fuerza. Respondé EXCLUSIVAMENTE con un objeto JSON válido (sin markdown, sin texto adicional, sin bloques de código) con la forma: {"cumplio": boolean, "fuerza": number entre 0 y 1, "razon": string breve, "annotations": {"context": string opcional, "tags": array de strings opcional, "narrative": string opcional}}. El campo "annotations" es opcional: usalo para guardar contexto adicional sobre la última vela evaluada (por ejemplo: condiciones de mercado, eventos relevantes, gaps, rupturas). Si no querés agregar contexto, omitilo. No inventes datos que no estén en las velas. Si no podés decidir, devolvé fuerza baja.';

export function buildDefaultPrompt(ctx: PromptContext): string {
  const { observer, candles, indicatorResult, symbol } = ctx;

  const candleLines = candles.map((c, i) => {
    const ts = new Date(c.time * 1000).toISOString();
    const vol = typeof c.volume === 'number' ? ` vol=${c.volume}` : '';
    return `${String(i).padStart(3, '0')} | t=${ts} | o=${c.open} h=${c.high} l=${c.low} c=${c.close}${vol}`;
  });

  const indiceLabel = INDICE_LABELS[observer.indice];
  const timeframe = observer.temporalidad;
  const market = observer.mercado.toUpperCase();

  return [
    `Símbolo: ${symbol} (${market})`,
    `Indicador: ${indiceLabel} sobre temporalidad ${timeframe}.`,
    `Descripción del indicador: ${indicatorDescriptor(observer)}`,
    `Resultado del indicador sobre la última vela: ${indicatorOutcome(indicatorResult)}.`,
    `Detalle del indicador: ${JSON.stringify(indicatorResult.details)}`,
    '',
    `Últimas ${candles.length} velas OHLC (de la más antigua a la más reciente, la última es la evaluada):`,
    candleLines.join('\n'),
    '',
    'Respondé únicamente con el JSON pedido por el system prompt.',
  ].join('\n');
}
