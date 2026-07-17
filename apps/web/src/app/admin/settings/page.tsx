'use client';

import { FormEvent, useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { Card, Button } from '@/components/ui/Button';
import { Key, Loader2, Trash2, Eye, EyeOff, FlaskConical, CheckCircle2, XCircle } from 'lucide-react';
import {
  CHART_TIMEFRAMES,
  MARKET_SYMBOLS,
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
  fmpStatus?: number;
  message: string;
  rawBody?: string;
  url: string;
  sample?: unknown;
}

const PROVIDER_LABELS: Record<string, { name: string; description: string; helpUrl: string }> = {
  massive: {
    name: 'Massive (Polygon.io)',
    description: 'Proveedor de velas OHLC para los índices del menú Gráfica.',
    helpUrl: 'https://massive.com/docs',
  },
};

const SYMBOLS: Record<MarketSymbol, string> = {
  nasdaq: 'I:NDX',
  sp500: 'I:SPX',
};

const TIMEFRAME_PARAMS: Record<
  ChartTimeframe,
  { multiplier: number; timespan: 'minute' | 'hour' | 'day' }
> = {
  '1m': { multiplier: 1, timespan: 'minute' },
  '15m': { multiplier: 15, timespan: 'minute' },
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
  { label: 'NASDAQ 15m', market: MARKET_SYMBOLS.NASDAQ, timeframe: CHART_TIMEFRAMES.M15, lookbackDays: 7 },
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
                const meta = PROVIDER_LABELS[p.provider] ?? {
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
                  Probar conexión a Massive
                </summary>
                <p className="mt-2 text-xs text-muted-foreground">
                  Ejecuta un request real a Massive con la API key guardada. Útil para
                  ver si el plan cubre intraday de índices.
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
                          {result.fmpStatus !== undefined && (
                            <span className="ml-auto text-[10px]">
                              HTTP {result.fmpStatus}
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
      </div>
    </div>
  );
}
