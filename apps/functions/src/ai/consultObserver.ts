import { logger } from 'firebase-functions/v2';
import type { AiModel } from '@botrade/shared';
import { consultGemini } from './providers/gemini';
import { consultDeepseek } from './providers/deepseek';
import { parseAiResponse, type ParsedAnnotations } from './parseResponse';
import { buildDefaultPrompt, DEFAULT_SYSTEM_PROMPT, type IndicatorResult } from './prompts/default';
import type { Candle, Observer } from '@botrade/shared';

export interface ConsultObserverInput {
  observer: Observer;
  candles: Candle[];
  indicatorResult: IndicatorResult;
  symbol: string;
  aiModel: AiModel;
}

export interface ConsultObserverResult {
  ok: boolean;
  provider: 'gemini' | 'deepseek';
  model: string;
  promptUsed: string;
  rawResponse: string;
  cumplio: boolean;
  fuerza: number;
  razon?: string;
  annotations?: ParsedAnnotations;
  error?: string;
}

async function callProvider(
  aiModel: AiModel,
  system: string,
  user: string
): Promise<{ ok: boolean; text: string; status: number; error?: string }> {
  if (aiModel.provider === 'gemini') {
    return consultGemini({
      apiKey: aiModel.apiKey,
      model: aiModel.model,
      system,
      user,
    });
  }
  return consultDeepseek({
    apiKey: aiModel.apiKey,
    model: aiModel.model,
    system,
    user,
  });
}

export async function consultObserver(
  input: ConsultObserverInput
): Promise<ConsultObserverResult> {
  const { observer, candles, indicatorResult, symbol, aiModel } = input;

  const systemPrompt =
    typeof observer.prompt === 'string' && observer.prompt.trim().length > 0
      ? observer.prompt.trim()
      : DEFAULT_SYSTEM_PROMPT;

  const userPrompt = buildDefaultPrompt({
    observer,
    candles,
    indicatorResult,
    symbol,
  });
  const promptUsed = `${systemPrompt}\n\n${userPrompt}`;

  const first = await callProvider(aiModel, systemPrompt, userPrompt);
  if (!first.ok) {
    logger.warn(
      `[consultObserver] ${aiModel.provider}/${aiModel.model} falló: ${first.error ?? 'unknown'}`
    );
    return {
      ok: false,
      provider: aiModel.provider,
      model: aiModel.model,
      promptUsed,
      rawResponse: first.text,
      cumplio: false,
      fuerza: 0,
      error: first.error ?? `HTTP ${first.status}`,
    };
  }

  const parsed = parseAiResponse(first.text);
  if (parsed) {
    return {
      ok: true,
      provider: aiModel.provider,
      model: aiModel.model,
      promptUsed,
      rawResponse: parsed.raw,
      cumplio: parsed.cumplio,
      fuerza: parsed.fuerza,
      razon: parsed.razon,
      annotations: parsed.annotations,
    };
  }

  const retryUser = `${userPrompt}\n\nIMPORTANTE: tu respuesta anterior no contenía un JSON válido. Respondé únicamente con un objeto JSON válido con las claves "cumplio" (boolean), "fuerza" (número entre 0 y 1), "razon" (string) y, opcionalmente, "annotations" ({context, tags, narrative}). Sin markdown, sin texto fuera del JSON.`;
  const second = await callProvider(aiModel, systemPrompt, retryUser);
  if (!second.ok) {
    return {
      ok: false,
      provider: aiModel.provider,
      model: aiModel.model,
      promptUsed,
      rawResponse: second.text || first.text,
      cumplio: false,
      fuerza: 0,
      error: second.error ?? `HTTP ${second.status}`,
    };
  }

  const parsedRetry = parseAiResponse(second.text);
  if (parsedRetry) {
    return {
      ok: true,
      provider: aiModel.provider,
      model: aiModel.model,
      promptUsed,
      rawResponse: parsedRetry.raw,
      cumplio: parsedRetry.cumplio,
      fuerza: parsedRetry.fuerza,
      razon: parsedRetry.razon,
      annotations: parsedRetry.annotations,
    };
  }

  return {
    ok: false,
    provider: aiModel.provider,
    model: aiModel.model,
    promptUsed,
    rawResponse: second.text,
    cumplio: false,
    fuerza: 0,
    error: 'El modelo no devolvió un JSON parseable',
  };
}
