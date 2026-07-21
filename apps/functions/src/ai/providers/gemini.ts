import { logger } from 'firebase-functions/v2';

export interface ProviderConsultInput {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxOutputTokens?: number;
}

export interface ProviderConsultResult {
  ok: boolean;
  text: string;
  status: number;
  error?: string;
}

export async function consultGemini({
  apiKey,
  model,
  system,
  user,
  maxOutputTokens = 200,
}: ProviderConsultInput): Promise<ProviderConsultResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [{ parts: [{ text: user }] }],
    systemInstruction: { parts: [{ text: system }] },
    generationConfig: {
      maxOutputTokens,
      temperature: 0.2,
    },
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Gemini network error: ${message}`);
    return {
      ok: false,
      text: '',
      status: 502,
      error: `Error de red: ${message}`,
    };
  }

  const responseText = await response.text().catch(() => '');

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(responseText) as { error?: { message?: string } };
      if (parsed?.error?.message) detail = parsed.error.message;
    } catch {
      // no era JSON
    }
    logger.error(`Gemini error ${response.status}: ${detail}`);
    return { ok: false, text: '', status: response.status, error: detail };
  }

  let parsed: {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
  } | null = null;
  try {
    parsed = responseText ? JSON.parse(responseText) : null;
  } catch {
    parsed = null;
  }

  const parts = parsed?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts.map((p) => p?.text ?? '').join('').trim()
    : '';

  if (!text) {
    return {
      ok: false,
      text: '',
      status: response.status,
      error: 'Gemini devolvió respuesta vacía',
    };
  }

  return { ok: true, text, status: response.status };
}
