export const AI_MODEL_PROVIDERS = ['gemini', 'deepseek'] as const;
export type AiModelProvider = (typeof AI_MODEL_PROVIDERS)[number];

export const AI_MODEL_CATALOG: Record<AiModelProvider, readonly string[]> = {
  gemini: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
};

export const PROVIDER_LABELS: Record<AiModelProvider, string> = {
  gemini: 'Google Gemini',
  deepseek: 'DeepSeek',
};

export const PROVIDER_HELP_URL: Record<AiModelProvider, string> = {
  gemini: 'https://aistudio.google.com/apikey',
  deepseek: 'https://platform.deepseek.com/api_keys',
};

export interface AiModel {
  id: string;
  provider: AiModelProvider;
  model: string;
  apiKey: string;
  label: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AiModelPublic {
  id: string;
  provider: AiModelProvider;
  model: string;
  label: string;
  isActive: boolean;
  configured: boolean;
  maskedKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiModelUpsertInput {
  id?: string;
  provider: AiModelProvider;
  model: string;
  apiKey: string;
  label?: string;
  isActive?: boolean;
}

export interface AiConfig {
  defaultAiModelId: string | null;
}

export function isValidAiModelProvider(value: unknown): value is AiModelProvider {
  return typeof value === 'string' && (AI_MODEL_PROVIDERS as readonly string[]).includes(value);
}

export function isKnownAiModel(provider: AiModelProvider, model: string): boolean {
  return AI_MODEL_CATALOG[provider].includes(model);
}

export function maskApiKey(value: string): string {
  if (value.length <= 4) return '••••';
  return `••••••••${value.slice(-4)}`;
}

export function defaultLabelFor(provider: AiModelProvider, model: string): string {
  return `${PROVIDER_LABELS[provider]} · ${model}`;
}
