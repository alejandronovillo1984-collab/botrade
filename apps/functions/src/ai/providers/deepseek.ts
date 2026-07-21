import { logger } from 'firebase-functions/v2';
import type { ProviderConsultInput, ProviderConsultResult } from './gemini';

export async function consultDeepseek({
  apiKey,
  model,
  system,
  user,
  maxOutputTokens = 200,
}: ProviderConsultInput): Promise<ProviderConsultResult> {
  const url = 'https://api.deepseek.com/v1/chat/completions';
  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: maxOutputTokens,
    temperature: 0.2,
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`DeepSeek network error: ${message}`);
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
    logger.error(`DeepSeek error ${response.status}: ${detail}`);
    return { ok: false, text: '', status: response.status, error: detail };
  }

  let parsed: {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  } | null = null;
  try {
    parsed = responseText ? JSON.parse(responseText) : null;
  } catch {
    parsed = null;
  }

  const content = parsed?.choices?.[0]?.message?.content ?? '';

  if (!content) {
    return {
      ok: false,
      text: '',
      status: response.status,
      error: 'DeepSeek devolvió respuesta vacía',
    };
  }

  return { ok: true, text: content.trim(), status: response.status };
}
