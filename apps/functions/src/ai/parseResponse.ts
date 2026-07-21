export interface ParsedAnnotations {
  context?: string;
  tags?: string[];
  narrative?: string;
  [key: string]: unknown;
}

export interface ParsedAiResponse {
  cumplio: boolean;
  fuerza: number;
  razon?: string;
  annotations?: ParsedAnnotations;
  raw: string;
}

const JSON_BLOCK_RE = /```(?:json)?\s*([\s\S]*?)```/i;

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractCandidateJson(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';

  const fenced = trimmed.match(JSON_BLOCK_RE);
  if (fenced && fenced[1]) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return '';
}

function coerceBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === 'si' || v === 'sí' || v === 'yes' || v === '1') return true;
    if (v === 'false' || v === 'no' || v === '0') return false;
  }
  if (typeof value === 'number') return value !== 0;
  return false;
}

function coerceFuerza(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 0) return 0;
    if (value > 1) {
      if (value <= 100) return Math.min(1, value / 100);
      return 1;
    }
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.'));
    if (Number.isFinite(parsed)) {
      if (parsed < 0) return 0;
      if (parsed > 1) {
        if (parsed <= 100) return Math.min(1, parsed / 100);
        return 1;
      }
      return parsed;
    }
  }
  return 0;
}

function coerceRazon(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return undefined;
}

function coerceAnnotations(value: unknown): ParsedAnnotations | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const obj = value as Record<string, unknown>;
  const result: ParsedAnnotations = {};

  if (typeof obj.context === 'string' && obj.context.trim().length > 0) {
    result.context = obj.context.trim();
  } else if (typeof obj.contexto === 'string' && obj.contexto.trim().length > 0) {
    result.context = obj.contexto.trim();
  }

  if (typeof obj.narrative === 'string' && obj.narrative.trim().length > 0) {
    result.narrative = obj.narrative.trim();
  } else if (typeof obj.narrativa === 'string' && obj.narrativa.trim().length > 0) {
    result.narrative = obj.narrativa.trim();
  }

  const tagsField = obj.tags ?? obj.etiquetas;
  if (Array.isArray(tagsField)) {
    const tags = tagsField
      .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      .map((t) => t.trim());
    if (tags.length > 0) result.tags = tags;
  }

  for (const [key, val] of Object.entries(obj)) {
    if (key === 'context' || key === 'contexto' || key === 'narrative' || key === 'narrativa' || key === 'tags' || key === 'etiquetas') continue;
    if (val === undefined) continue;
    result[key] = val;
  }

  if (Object.keys(result).length === 0) return undefined;
  return result;
}

function buildFromObject(obj: Record<string, unknown>): ParsedAiResponse | null {
  if (typeof obj.cumplio === 'undefined' && typeof obj.fuerza === 'undefined') {
    return null;
  }
  const razonField =
    (typeof obj.razon === 'string' && obj.razon) ||
    (typeof obj.reason === 'string' && obj.reason) ||
    (typeof obj.explicacion === 'string' && obj.explicacion) ||
    (typeof obj.explicación === 'string' && obj.explicación);
  const annotations = coerceAnnotations(obj.annotations ?? obj.anotaciones);
  const result: ParsedAiResponse = {
    cumplio: coerceBool(obj.cumplio ?? obj.match ?? obj.cumple),
    fuerza: coerceFuerza(obj.fuerza ?? obj.strength ?? obj.confianza ?? 0),
    razon: coerceRazon(razonField),
    raw: '',
  };
  if (annotations) result.annotations = annotations;
  return result;
}

export function parseAiResponse(raw: string): ParsedAiResponse | null {
  const candidate = extractCandidateJson(raw);
  if (!candidate) return null;

  const parsed = tryParseJson(candidate);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const result = buildFromObject(parsed as Record<string, unknown>);
    if (result) return { ...result, raw };
  }
  return null;
}
