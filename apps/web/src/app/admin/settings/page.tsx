'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { Card, Button } from '@/components/ui/Button';
import {
  Key,
  Loader2,
  Trash2,
  Eye,
  EyeOff,
  FlaskConical,
  CheckCircle2,
  XCircle,
  Plus,
  Pencil,
  Sparkles,
  X,
} from 'lucide-react';
import {
  AI_MODEL_CATALOG,
  CHART_TIMEFRAMES,
  MARKET_SYMBOLS,
  PROVIDER_HELP_URL,
  PROVIDER_LABELS,
  defaultLabelFor,
  type AiModelProvider,
  type AiModelPublic,
  type ChartTimeframe,
  type MarketSymbol,
} from '@botrade/shared';

interface ProviderInfo {
  provider: string;
  configured: boolean;
  maskedKey: string | null;
}

interface ProviderTestResult {
  ok: boolean;
  status: number;
  eodhdStatus?: number;
  message: string;
  rawBody?: string;
  url: string;
  sample?: unknown;
}

const PROVIDER_META: Record<string, { name: string; description: string; helpUrl: string }> = {
  eodhd: {
    name: 'EODHD (EOD Historical Data)',
    description: 'Proveedor de velas OHLC (EOD + intraday 1m/5m/1h) para los índices del menú Gráfica.',
    helpUrl: 'https://eodhd.com/financial-apis/',
  },
};

const SYMBOLS: Record<MarketSymbol, string> = {
  nasdaq: 'NDX.INDX',
  sp500: 'GSPC.INDX',
};

const TIMEFRAME_PARAMS: Record<
  ChartTimeframe,
  { multiplier: number; timespan: 'minute' | 'hour' | 'day' }
> = {
  '1m': { multiplier: 1, timespan: 'minute' },
  '5m': { multiplier: 5, timespan: 'minute' },
  '1h': { multiplier: 1, timespan: 'hour' },
  '1d': { multiplier: 1, timespan: 'day' },
};

function formatDate(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

interface TestPreset {
  label: string;
  market: MarketSymbol;
  timeframe: ChartTimeframe;
  lookbackDays: number;
}

const TEST_PRESETS: TestPreset[] = [
  { label: 'NASDAQ 1d', market: MARKET_SYMBOLS.NASDAQ, timeframe: CHART_TIMEFRAMES.D1, lookbackDays: 7 },
  { label: 'NASDAQ 1h', market: MARKET_SYMBOLS.NASDAQ, timeframe: CHART_TIMEFRAMES.H1, lookbackDays: 7 },
  { label: 'NASDAQ 5m', market: MARKET_SYMBOLS.NASDAQ, timeframe: CHART_TIMEFRAMES.M5, lookbackDays: 7 },
  { label: 'NASDAQ 1m', market: MARKET_SYMBOLS.NASDAQ, timeframe: CHART_TIMEFRAMES.M1, lookbackDays: 5 },
  { label: 'S&P 500 1d', market: MARKET_SYMBOLS.SP500, timeframe: CHART_TIMEFRAMES.D1, lookbackDays: 7 },
  { label: 'S&P 500 1h', market: MARKET_SYMBOLS.SP500, timeframe: CHART_TIMEFRAMES.H1, lookbackDays: 7 },
];

function getErrorMessage(err: unknown): string {
  const code = (err as { code?: string }).code;
  const message = (err as { message?: string }).message;
  if (typeof message === 'string' && message.length > 0) return message;
  if (typeof code === 'string') return code;
  return 'Error desconocido';
}

type AiMode =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; model: AiModelPublic };

const PROVIDER_OPTIONS: { value: AiModelProvider; label: string }[] = (
  Object.keys(PROVIDER_LABELS) as AiModelProvider[]
).map((value) => ({ value, label: PROVIDER_LABELS[value] }));

export default function AdminSettingsPage() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [showValue, setShowValue] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<Record<string, { type: 'ok' | 'err'; text: string } | undefined>>({});

  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, ProviderTestResult | undefined>>({});
  const [testError, setTestError] = useState<string | null>(null);

  const loadKeys = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const getAdminApiKeys = httpsCallable<unknown, { providers: ProviderInfo[] }>(
        functions,
        'getAdminApiKeys'
      );
      const res = await getAdminApiKeys();
      setProviders(res.data.providers);
    } catch (err) {
      setLoadError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadKeys();
  }, []);

  const handleSave = (provider: string) => (event: FormEvent) => {
    event.preventDefault();
    void saveProvider(provider);
  };

  const saveProvider = async (provider: string) => {
    const value = (drafts[provider] ?? '').trim();
    if (!value) {
      setFeedback((prev) => ({
        ...prev,
        [provider]: { type: 'err', text: 'Ingresá una API key' },
      }));
      return;
    }

    setSaving((prev) => ({ ...prev, [provider]: true }));
    setFeedback((prev) => ({ ...prev, [provider]: undefined }));
    try {
      const setAdminApiKey = httpsCallable<
        { provider: string; apiKey: string },
        { success: boolean }
      >(functions, 'setAdminApiKey');
      await setAdminApiKey({ provider, apiKey: value });
      setDrafts((prev) => ({ ...prev, [provider]: '' }));
      setShowValue((prev) => ({ ...prev, [provider]: false }));
      setFeedback((prev) => ({
        ...prev,
        [provider]: { type: 'ok', text: 'API key guardada' },
      }));
      await loadKeys();
    } catch (err) {
      setFeedback((prev) => ({
        ...prev,
        [provider]: { type: 'err', text: getErrorMessage(err) },
      }));
    } finally {
      setSaving((prev) => ({ ...prev, [provider]: false }));
    }
  };

  const handleClear = async (provider: string) => {
    if (!confirm('¿Eliminar la API key guardada?')) return;

    setSaving((prev) => ({ ...prev, [provider]: true }));
    setFeedback((prev) => ({ ...prev, [provider]: undefined }));
    try {
      const setAdminApiKey = httpsCallable<
        { provider: string; clear: true },
        { success: boolean }
      >(functions, 'setAdminApiKey');
      await setAdminApiKey({ provider, clear: true });
      setFeedback((prev) => ({
        ...prev,
        [provider]: { type: 'ok', text: 'API key eliminada' },
      }));
      await loadKeys();
    } catch (err) {
      setFeedback((prev) => ({
        ...prev,
        [provider]: { type: 'err', text: getErrorMessage(err) },
      }));
    } finally {
      setSaving((prev) => ({ ...prev, [provider]: false }));
    }
  };

  const runTest = async (preset: TestPreset) => {
    const key = `${preset.market}-${preset.timeframe}-${preset.lookbackDays}`;
    setTestingKey(key);
    setTestError(null);
    try {
      const testProviderConnection = httpsCallable<
        { market: MarketSymbol; timeframe: ChartTimeframe },
        ProviderTestResult
      >(functions, 'testProviderConnection');
      const res = await testProviderConnection({
        market: preset.market,
        timeframe: preset.timeframe,
      });
      setTestResults((prev) => ({ ...prev, [key]: res.data }));
    } catch (err) {
      setTestError(getErrorMessage(err));
    } finally {
      setTestingKey(null);
    }
  };

  // ----- Modelos de IA -----
  const [aiModels, setAiModels] = useState<AiModelPublic[]>([]);
  const [defaultAiModelId, setDefaultAiModelId] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(true);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiMode, setAiMode] = useState<AiMode>({ kind: 'closed' });
  const [aiSubmitting, setAiSubmitting] = useState(false);
  const [aiFormError, setAiFormError] = useState<string | null>(null);
  const [aiTestById, setAiTestById] = useState<Record<string, AiTestOutcome | undefined>>({});
  const [aiFeedback, setAiFeedback] = useState<Record<string, { type: 'ok' | 'err'; text: string } | undefined>>({});
  const [defaultSaving, setDefaultSaving] = useState(false);

  const loadAi = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const getAiConfig = httpsCallable<unknown, { defaultAiModelId: string | null; models: AiModelPublic[] }>(
        functions,
        'getAiConfig'
      );
      const res = await getAiConfig();
      setAiModels(res.data.models);
      setDefaultAiModelId(res.data.defaultAiModelId);
    } catch (err) {
      setAiError(getErrorMessage(err));
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    void loadAi();
  }, []);

  const openCreateAi = () => {
    setAiMode({ kind: 'create' });
    setAiFormError(null);
  };

  const openEditAi = (model: AiModelPublic) => {
    setAiMode({ kind: 'edit', model });
    setAiFormError(null);
  };

  const closeAiModal = () => {
    if (aiSubmitting) return;
    setAiMode({ kind: 'closed' });
    setAiFormError(null);
  };

  const handleSubmitAi = async (payload: {
    id?: string;
    provider: AiModelProvider;
    model: string;
    apiKey: string;
    label: string;
    isActive: boolean;
  }) => {
    if (aiMode.kind === 'closed') return;
    setAiSubmitting(true);
    setAiFormError(null);
    try {
      const upsertAiModel = httpsCallable<
        {
          id?: string;
          provider: AiModelProvider;
          model: string;
          apiKey: string;
          label?: string;
          isActive?: boolean;
        },
        { success: boolean; model: AiModelPublic }
      >(functions, 'upsertAiModel');
      const res = await upsertAiModel({
        ...(payload.id ? { id: payload.id } : {}),
        provider: payload.provider,
        model: payload.model,
        apiKey: payload.apiKey,
        label: payload.label,
        isActive: payload.isActive,
      });
      setAiFeedback((prev) => ({
        ...prev,
        [res.data.model.id]: {
          type: 'ok',
          text: aiMode.kind === 'edit' ? 'Modelo actualizado' : 'Modelo creado',
        },
      }));
      setAiMode({ kind: 'closed' });
      await loadAi();
    } catch (err) {
      setAiFormError(getErrorMessage(err));
    } finally {
      setAiSubmitting(false);
    }
  };

  const handleDeleteAi = async (model: AiModelPublic) => {
    if (!confirm(`¿Eliminar el modelo "${model.label}"?`)) return;
    try {
      const deleteAiModel = httpsCallable<{ id: string }, { success: boolean }>(
        functions,
        'deleteAiModel'
      );
      await deleteAiModel({ id: model.id });
      setAiFeedback((prev) => ({
        ...prev,
        [model.id]: { type: 'ok', text: 'Modelo eliminado' },
      }));
      await loadAi();
    } catch (err) {
      setAiFeedback((prev) => ({
        ...prev,
        [model.id]: { type: 'err', text: getErrorMessage(err) },
      }));
    }
  };

  const handleTestAi = async (model: AiModelPublic) => {
    setAiTestById((prev) => ({ ...prev, [model.id]: { kind: 'loading' } }));
    try {
      const testAiModel = httpsCallable<{ id: string }, AiTestResult>(
        functions,
        'testAiModel'
      );
      const res = await testAiModel({ id: model.id });
      setAiTestById((prev) => ({ ...prev, [model.id]: { kind: 'done', result: res.data } }));
    } catch (err) {
      setAiTestById((prev) => ({
        ...prev,
        [model.id]: {
          kind: 'done',
          result: { ok: false, status: 500, provider: model.provider, model: model.model, message: getErrorMessage(err) },
        },
      }));
    }
  };

  const handleSetDefault = async (id: string | null) => {
    setDefaultSaving(true);
    try {
      const setDefaultAiModel = httpsCallable<{ id: string | null }, { success: boolean; defaultAiModelId: string | null }>(
        functions,
        'setDefaultAiModel'
      );
      await setDefaultAiModel({ id });
      setDefaultAiModelId(id);
    } catch (err) {
      setAiError(getErrorMessage(err));
    } finally {
      setDefaultSaving(false);
    }
  };

  const activeModels = useMemo(
    () => aiModels.filter((m) => m.isActive),
    [aiModels]
  );

  // ----- Datos de mercado -----
  const [cacheTtl, setCacheTtl] = useState<number>(900);
  const [defaultCacheTtl, setDefaultCacheTtl] = useState<number>(900);
  const [marketDataLoading, setMarketDataLoading] = useState(true);
  const [marketDataError, setMarketDataError] = useState<string | null>(null);
  const [marketDataSaving, setMarketDataSaving] = useState(false);
  const [marketDataFeedback, setMarketDataFeedback] = useState<
    { type: 'ok' | 'err'; text: string } | null
  >(null);

  const loadMarketData = async () => {
    setMarketDataLoading(true);
    setMarketDataError(null);
    try {
      const getMarketDataConfig = httpsCallable<unknown, { cacheTtlSeconds: number; defaultCacheTtlSeconds: number }>(
        functions,
        'getMarketDataConfig'
      );
      const res = await getMarketDataConfig();
      setCacheTtl(res.data.cacheTtlSeconds);
      setDefaultCacheTtl(res.data.defaultCacheTtlSeconds);
    } catch (err) {
      setMarketDataError(getErrorMessage(err));
    } finally {
      setMarketDataLoading(false);
    }
  };

  useEffect(() => {
    void loadMarketData();
  }, []);

  const handleSaveMarketData = async (event: FormEvent) => {
    event.preventDefault();
    setMarketDataSaving(true);
    setMarketDataFeedback(null);
    try {
      const setMarketDataConfig = httpsCallable<
        { cacheTtlSeconds: number },
        { success: boolean; cacheTtlSeconds: number }
      >(functions, 'setMarketDataConfig');
      const res = await setMarketDataConfig({ cacheTtlSeconds: cacheTtl });
      setCacheTtl(res.data.cacheTtlSeconds);
      setMarketDataFeedback({ type: 'ok', text: 'TTL de cache actualizado' });
    } catch (err) {
      setMarketDataFeedback({ type: 'err', text: getErrorMessage(err) });
    } finally {
      setMarketDataSaving(false);
    }
  };

  return (
    <div className="p-8">
      <h2 className="mb-6 text-xl font-bold text-secondary">Configuración global</h2>

      <div className="space-y-6">
        <Card title="Parámetros del sistema">
          <p className="text-sm text-muted-foreground">
            Configuración general del bot y exchanges soportados.
          </p>
        </Card>

        <Card title="API keys de proveedores">
          <p className="mb-4 text-sm text-muted-foreground">
            Cargá las claves de los servicios externos que se consumen desde Firebase
            Functions. Se guardan en <code>adminConfig/apiKeys</code> y nunca quedan
            expuestas al frontend.
          </p>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando configuración...
            </div>
          )}

          {loadError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {loadError}
            </p>
          )}

          {!loading && !loadError && (
            <div className="space-y-4">
              {providers.map((p) => {
                const meta = PROVIDER_META[p.provider] ?? {
                  name: p.provider,
                  description: '',
                  helpUrl: '#',
                };
                const isSaving = !!saving[p.provider];
                const show = !!showValue[p.provider];
                const fb = feedback[p.provider];
                return (
                  <form
                    key={p.provider}
                    onSubmit={handleSave(p.provider)}
                    className="rounded-md border border-border bg-muted/30 p-4"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-semibold text-secondary">
                          <Key className="h-4 w-4" />
                          {meta.name}
                        </div>
                        {meta.description && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {meta.description}
                          </p>
                        )}
                        {p.configured && p.maskedKey && (
                          <p className="mt-1 font-mono text-xs text-secondary">
                            Actual: {p.maskedKey}
                          </p>
                        )}
                        {!p.configured && (
                          <p className="mt-1 text-xs text-amber-600">No configurada</p>
                        )}
                      </div>
                      {meta.helpUrl && (
                        <a
                          href={meta.helpUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary underline"
                        >
                          Obtener API key
                        </a>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <div className="relative flex-1">
                        <input
                          type={show ? 'text' : 'password'}
                          value={drafts[p.provider] ?? ''}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [p.provider]: e.target.value,
                            }))
                          }
                          placeholder={
                            p.configured ? 'Reemplazar API key...' : 'Pegar API key...'
                          }
                          className="w-full rounded-md border border-border bg-white px-3 py-2 pr-10 text-sm text-secondary shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowValue((prev) => ({
                              ...prev,
                              [p.provider]: !prev[p.provider],
                            }))
                          }
                          className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-secondary"
                          aria-label={show ? 'Ocultar valor' : 'Mostrar valor'}
                        >
                          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit" disabled={isSaving}>
                          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
                        </Button>
                        {p.configured && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleClear(p.provider)}
                            disabled={isSaving}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {fb && (
                      <p
                        className={`mt-2 text-xs ${
                          fb.type === 'ok' ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {fb.text}
                      </p>
                    )}
                  </form>
                );
              })}

              <details className="rounded-md border border-border bg-muted/20 p-3 text-sm">
                <summary className="flex cursor-pointer items-center gap-2 text-secondary">
                  <FlaskConical className="h-4 w-4" />
                  Probar conexión a EODHD
                </summary>
                <p className="mt-2 text-xs text-muted-foreground">
                  Ejecuta un request real a EODHD con la API key guardada. Útil para
                  verificar que el plan cubre los índices y los intervalos intraday.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {TEST_PRESETS.map((preset) => {
                    const key = `${preset.market}-${preset.timeframe}-${preset.lookbackDays}`;
                    const isTesting = testingKey === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => runTest(preset)}
                        disabled={testingKey !== null}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-2.5 py-1 text-xs text-secondary shadow-sm hover:bg-muted disabled:opacity-50"
                      >
                        {isTesting ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <FlaskConical className="h-3 w-3" />
                        )}
                        {preset.label}
                      </button>
                    );
                  })}
                </div>

                {testError && (
                  <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                    Error al invocar el test: {testError}
                  </p>
                )}

                <div className="mt-3 space-y-2">
                  {TEST_PRESETS.map((preset) => {
                    const key = `${preset.market}-${preset.timeframe}-${preset.lookbackDays}`;
                    const result = testResults[key];
                    if (!result) return null;
                    return (
                      <div
                        key={key}
                        className={`rounded-md border px-3 py-2 text-xs ${
                          result.ok
                            ? 'border-green-200 bg-green-50 text-green-800'
                            : 'border-red-200 bg-red-50 text-red-800'
                        }`}
                      >
                        <div className="flex items-center gap-2 font-medium">
                          {result.ok ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            <XCircle className="h-4 w-4" />
                          )}
                          {preset.label}
                          {result.eodhdStatus !== undefined && (
                            <span className="ml-auto text-[10px]">
                              HTTP {result.eodhdStatus}
                            </span>
                          )}
                        </div>
                        <p className="mt-1">{result.message}</p>
                        {result.rawBody && (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-[10px] underline">
                              Ver body crudo
                            </summary>
                            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-white/60 p-2 text-[10px] text-secondary">
                              {result.rawBody}
                            </pre>
                          </details>
                        )}
                      </div>
                    );
                  })}
                </div>
              </details>
            </div>
          )}
        </Card>

        <Card title="Datos de mercado">
          <p className="mb-4 text-sm text-muted-foreground">
            Ajustes del proveedor de datos de mercado. El TTL de cache define cuántos
            segundos se reutiliza una respuesta antes de volver a consultar EODHD. Con
            planes que tienen límite de llamadas diarias es recomendable mantenerlo
            alto para no agotar la cuota.
          </p>

          {marketDataLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando configuración...
            </div>
          )}

          {marketDataError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {marketDataError}
            </p>
          )}

          {!marketDataLoading && !marketDataError && (
            <form
              onSubmit={handleSaveMarketData}
              className="rounded-md border border-border bg-muted/30 p-4"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    TTL de cache (segundos)
                  </label>
                  <input
                    type="number"
                    min={60}
                    max={86400}
                    value={cacheTtl}
                    onChange={(e) => setCacheTtl(Number(e.target.value))}
                    className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-secondary shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Default: {defaultCacheTtl}s. Rango permitido: 60 – 86400 (1 día).
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCacheTtl(defaultCacheTtl)}
                    disabled={marketDataSaving}
                  >
                    Restablecer
                  </Button>
                  <Button type="submit" disabled={marketDataSaving}>
                    {marketDataSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Guardar'
                    )}
                  </Button>
                </div>
              </div>

              {marketDataFeedback && (
                <p
                  className={`mt-2 text-xs ${
                    marketDataFeedback.type === 'ok'
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}
                >
                  {marketDataFeedback.text}
                </p>
              )}
            </form>
          )}
        </Card>

        <Card title="Modelos de IA para análisis">
          <p className="mb-4 text-sm text-muted-foreground">
            Cargá los modelos que se usarán para analizar el mercado. Cada modelo
            guarda su propia API key en <code>aiModels/&#123;id&#125;</code>. Después
            elegí cuál será el modelo por defecto desde el selector.
          </p>

          <div className="mb-4 flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-secondary">
              <Sparkles className="h-4 w-4" />
              Modelo por defecto
            </div>
            <div className="flex items-center gap-2">
              <select
                value={defaultAiModelId ?? ''}
                onChange={(e) => void handleSetDefault(e.target.value === '' ? null : e.target.value)}
                disabled={aiLoading || defaultSaving}
                className="w-full min-w-[240px] rounded-md border border-border bg-white px-3 py-2 text-sm text-secondary outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60 sm:w-72"
              >
                <option value="">Sin definir</option>
                {activeModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} ({PROVIDER_LABELS[m.provider]})
                  </option>
                ))}
              </select>
              {defaultSaving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          </div>

          <div className="mb-4 flex justify-end">
            <Button onClick={openCreateAi}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo modelo
            </Button>
          </div>

          {aiLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando modelos...
            </div>
          )}

          {aiError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{aiError}</p>
          )}

          {!aiLoading && !aiError && aiModels.length === 0 && (
            <div className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
              Todavía no hay modelos cargados. Creá uno con el botón de arriba.
            </div>
          )}

          {!aiLoading && !aiError && aiModels.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-3 pr-4 font-medium">Label</th>
                    <th className="py-3 pr-4 font-medium">Provider</th>
                    <th className="py-3 pr-4 font-medium">Modelo</th>
                    <th className="py-3 pr-4 font-medium">API key</th>
                    <th className="py-3 pr-4 font-medium">Estado</th>
                    <th className="py-3 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {aiModels.map((m) => {
                    const fb = aiFeedback[m.id];
                    const test = aiTestById[m.id];
                    return (
                      <tr key={m.id} className="border-b border-border last:border-b-0 align-top">
                        <td className="py-3 pr-4 font-medium text-secondary">
                          <div className="flex items-center gap-2">
                            {m.label}
                            {defaultAiModelId === m.id && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                <Sparkles className="h-3 w-3" />
                                Default
                              </span>
                            )}
                          </div>
                          {fb && (
                            <p
                              className={`mt-1 text-[11px] ${
                                fb.type === 'ok' ? 'text-green-600' : 'text-red-600'
                              }`}
                            >
                              {fb.text}
                            </p>
                          )}
                          {test && test.kind === 'done' && test.result && (
                            <p
                              className={`mt-1 text-[11px] ${
                                test.result.ok ? 'text-green-600' : 'text-red-600'
                              }`}
                            >
                              {test.result.ok ? 'OK' : 'Error'} — {test.result.message}
                              {test.result.status ? ` (HTTP ${test.result.status})` : ''}
                            </p>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {PROVIDER_LABELS[m.provider]}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          <span className="font-mono text-xs">{m.model}</span>
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {m.configured ? (
                            <span className="font-mono text-xs">{m.maskedKey}</span>
                          ) : (
                            <span className="text-xs text-amber-600">No configurada</span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              m.isActive
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {m.isActive ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => void handleTestAi(m)}
                              disabled={test?.kind === 'loading'}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-secondary hover:bg-muted disabled:opacity-50"
                              title="Probar conexión"
                            >
                              {test?.kind === 'loading' ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <FlaskConical className="h-3.5 w-3.5" />
                              )}
                              Probar
                            </button>
                            <button
                              onClick={() => openEditAi(m)}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-secondary hover:bg-muted"
                              title="Editar"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Editar
                            </button>
                            <button
                              onClick={() => void handleDeleteAi(m)}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                              title="Eliminar"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {aiMode.kind !== 'closed' && (
        <AiModelFormModal
          mode={aiMode}
          onClose={closeAiModal}
          onSubmit={handleSubmitAi}
          submitting={aiSubmitting}
          formError={aiFormError}
        />
      )}
    </div>
  );
}

interface AiTestResult {
  ok: boolean;
  status: number;
  provider: AiModelProvider;
  model: string;
  message: string;
}

interface AiTestOutcome {
  kind: 'loading' | 'done';
  result?: AiTestResult;
}

function AiModelFormModal({
  mode,
  onClose,
  onSubmit,
  submitting,
  formError,
}: {
  mode: Exclude<AiMode, { kind: 'closed' }>;
  onClose: () => void;
  onSubmit: (payload: {
    id?: string;
    provider: AiModelProvider;
    model: string;
    apiKey: string;
    label: string;
    isActive: boolean;
  }) => void;
  submitting: boolean;
  formError: string | null;
}) {
  const isEdit = mode.kind === 'edit';
  const initial = isEdit ? mode.model : null;

  const [provider, setProvider] = useState<AiModelProvider>(initial?.provider ?? 'gemini');
  const catalog = AI_MODEL_CATALOG[provider];
  const [modelChoice, setModelChoice] = useState<string>(initial?.model ?? catalog[0]);
  const [customModel, setCustomModel] = useState<string>('');
  const [useCustom, setUseCustom] = useState<boolean>(
    initial ? !catalog.includes(initial.model) : false
  );
  const [label, setLabel] = useState<string>(initial?.label ?? '');
  const [apiKey, setApiKey] = useState<string>('');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [isActive, setIsActive] = useState<boolean>(initial?.isActive ?? true);

  const finalModel = useCustom ? customModel.trim() : modelChoice;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!finalModel) {
      onSubmit({
        ...(initial?.id ? { id: initial.id } : {}),
        provider,
        model: '',
        apiKey,
        label,
        isActive,
      });
      return;
    }
    onSubmit({
      ...(initial?.id ? { id: initial.id } : {}),
      provider,
      model: finalModel,
      apiKey,
      label: label.trim() || defaultLabelFor(provider, finalModel),
      isActive,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-lg font-semibold text-secondary">
            {isEdit ? 'Editar modelo' : 'Nuevo modelo de IA'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-secondary"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          {formError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-secondary">Provider</label>
            <select
              value={provider}
              onChange={(e) => {
                const next = e.target.value as AiModelProvider;
                setProvider(next);
                const nextCatalog = AI_MODEL_CATALOG[next];
                if (!useCustom) {
                  setModelChoice(nextCatalog[0]);
                }
              }}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {PROVIDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <a
              href={PROVIDER_HELP_URL[provider]}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-xs text-primary underline"
            >
              Obtener API key
            </a>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-secondary">Modelo</label>
            {!useCustom ? (
              <div className="flex gap-2">
                <select
                  value={modelChoice}
                  onChange={(e) => setModelChoice(e.target.value)}
                  className="flex-1 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  {catalog.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setUseCustom(true)}
                >
                  Otro...
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  placeholder="nombre-del-modelo"
                  className="flex-1 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setUseCustom(false);
                    setCustomModel('');
                  }}
                >
                  Catálogo
                </Button>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-secondary">
              Label <span className="text-xs text-muted-foreground">(opcional)</span>
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={120}
              placeholder={finalModel ? defaultLabelFor(provider, finalModel) : 'Etiqueta visible'}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-secondary">API key</label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={initial?.configured ? 'Reemplazar API key...' : 'Pegar API key...'}
                autoComplete="off"
                required={!initial}
                className="w-full rounded-md border border-border bg-white px-3 py-2 pr-10 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-secondary"
                aria-label={showKey ? 'Ocultar valor' : 'Mostrar valor'}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {initial?.configured && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Actual: {initial.maskedKey}. Dejá vacío para conservar la actual.
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-secondary">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            Modelo activo
          </label>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting || !finalModel || (!initial && !apiKey)}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? 'Guardar cambios' : 'Crear modelo'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
