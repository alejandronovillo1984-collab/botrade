'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import {
  AiObserverResult,
  INDICE_LABELS,
  MARKET_OPEN_LABELS,
  Observer,
  PROVIDER_LABELS,
} from '@botrade/shared';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';

interface AiExecutionsDrawerProps {
  observer: Observer;
  onClose: () => void;
}

function toIso(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return ((value as { toDate: () => Date }).toDate()).toISOString();
  }
  return new Date().toISOString();
}

function getErrorMessage(err: unknown): string {
  const code = (err as { code?: string }).code;
  const message = (err as { message?: string }).message;
  if (typeof message === 'string' && message.length > 0) return message;
  if (typeof code === 'string') return code;
  return 'Error desconocido';
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-AR', {
      dateStyle: 'short',
      timeStyle: 'medium',
    });
  } catch {
    return iso;
  }
}

function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(digits);
}

export function AiExecutionsDrawer({ observer, onClose }: AiExecutionsDrawerProps) {
  const [results, setResults] = useState<AiObserverResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!db) {
      setError('Firestore no está disponible.');
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, 'aiObserverResults'),
      where('observerId', '==', observer.id),
      orderBy('createdAt', 'desc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map(
          (docSnap) =>
            ({
              id: docSnap.id,
              ...(docSnap.data() as Omit<AiObserverResult, 'id' | 'createdAt'>),
              createdAt: toIso(docSnap.get('createdAt')),
            }) as AiObserverResult
        );
        setResults(data);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error('Error listening to aiObserverResults:', err);
        setError(getErrorMessage(err));
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [observer.id]);

  const summary = useMemo(() => {
    if (results.length === 0) {
      return {
        total: 0,
        cumplioCount: 0,
        cumplioPct: 0,
        avgFuerza: 0,
        stubCount: 0,
        fullCount: 0,
      };
    }
    const fullResults = results.filter((r) => !r.skippedReason);
    const stubResults = results.filter((r) => !!r.skippedReason);
    const cumplioCount = fullResults.filter((r) => r.cumplio === true).length;
    const avgFuerza =
      fullResults.length > 0
        ? fullResults.reduce(
            (acc, r) => acc + (Number.isFinite(r.fuerza) ? (r.fuerza as number) : 0),
            0
          ) / fullResults.length
        : 0;
    return {
      total: results.length,
      cumplioCount,
      cumplioPct:
        fullResults.length > 0
          ? Math.round((cumplioCount / fullResults.length) * 100)
          : 0,
      avgFuerza,
      stubCount: stubResults.length,
      fullCount: fullResults.length,
    };
  }, [results]);

  const indiceLabel = INDICE_LABELS[observer.indice] ?? observer.indice;
  const marketOpenLabel = observer.marketOpen
    ? MARKET_OPEN_LABELS[observer.marketOpen] ?? observer.marketOpen
    : null;
  const subtitleParts = [indiceLabel, observer.temporalidad, observer.mercado.toUpperCase()];
  if (marketOpenLabel) subtitleParts.push(marketOpenLabel);

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label="Ejecuciones IA del observador"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="flex-1 cursor-default bg-black/40"
      />

      <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-600" />
              <h3 className="truncate text-lg font-semibold text-secondary">
                Ejecuciones IA
              </h3>
            </div>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {subtitleParts.join(' · ')}
            </p>
            <p
              className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground"
              title={observer.id}
            >
              ID: {observer.id}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-secondary"
            aria-label="Cerrar drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-5 py-3 text-xs">
          <span className="inline-flex items-center rounded-full border border-border bg-white px-2.5 py-1 font-medium text-secondary">
            Total: {summary.total}
          </span>
          <span className="inline-flex items-center rounded-full border border-border bg-white px-2.5 py-1 font-medium text-secondary">
            Full: {summary.fullCount}
          </span>
          <span className="inline-flex items-center rounded-full border border-border bg-white px-2.5 py-1 font-medium text-secondary">
            Stub: {summary.stubCount}
          </span>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 font-medium ${
              summary.cumplioCount > 0
                ? 'bg-green-100 text-green-700'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            Cumplieron: {summary.cumplioCount} ({summary.cumplioPct}%)
          </span>
          <span className="inline-flex items-center rounded-full border border-border bg-white px-2.5 py-1 font-medium text-secondary">
            Fuerza prom.: {formatNumber(summary.avgFuerza)}
          </span>
        </div>

        {error && (
          <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Cargando ejecuciones...
            </div>
          ) : results.length === 0 ? (
            <div className="m-5 rounded-md border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground">
              <p className="font-medium text-secondary">Sin ejecuciones todavía</p>
              <p className="mt-1 text-xs">
                Este observador todavía no tiene ejecuciones de IA registradas. El cron job
                guarda resultados cada 1 minuto en la colección <code>aiObserverResults</code>.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {results.map((r) => {
                const isOpen = expandedId === r.id;
                return (
                  <li key={r.id} className="bg-white">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isOpen ? null : r.id)}
                      className="flex w-full items-center gap-2 px-5 py-3 text-left text-sm hover:bg-muted/30"
                    >
                      <span className="text-muted-foreground">
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </span>
                      <span className="w-28 shrink-0 text-xs text-muted-foreground">
                        {formatDateTime(r.createdAt)}
                      </span>
                      <span className="w-24 shrink-0 text-xs text-muted-foreground">
                        {r.candleTimestamp
                          ? new Date(r.candleTimestamp).toLocaleString('es-AR', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })
                          : '-'}
                      </span>
                      <span className="w-10 text-center">
                        <BoolBadge value={r.indicatorMatched} />
                      </span>
                      <span className="flex min-w-0 flex-1 items-center gap-1.5">
                        {r.skippedReason ? (
                          <span
                            className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                            title={`Sin IA — ${r.skippedReason}`}
                          >
                            sin IA
                          </span>
                        ) : (
                          <>
                            <BoolBadge value={r.cumplio} />
                            <span className="font-mono text-xs text-muted-foreground">
                              {formatNumber(r.fuerza ?? 0)}
                            </span>
                          </>
                        )}
                      </span>
                      <span
                        className="hidden truncate text-xs text-muted-foreground sm:block sm:max-w-[140px]"
                        title={
                          r.provider && r.model
                            ? `${PROVIDER_LABELS[r.provider] ?? r.provider} · ${r.model}`
                            : 'Sin modelo (stub)'
                        }
                      >
                        {r.model ?? <span className="opacity-50">—</span>}
                      </span>
                      <span className="w-12 text-right">
                        {r.error ? (
                          <span title={r.error} className="inline-flex">
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">OK</span>
                        )}
                      </span>
                    </button>

                    {isOpen && (
                      <div className="space-y-3 border-t border-border bg-muted/20 px-5 py-4 text-xs">
                        {r.skippedReason && (
                          <Block label="Skipped" tone="warn">
                            <p className="text-secondary">
                              Este resultado es un stub (sin consulta IA). Razón:{' '}
                              <span className="font-mono">{r.skippedReason}</span>
                            </p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              Posibles valores: <code>no_usePrompt</code> (observer sin IA),{' '}
                              <code>unsupported_indice</code>, <code>not_implemented</code>.
                            </p>
                          </Block>
                        )}
                        {r.error && (
                          <Block label="Error" tone="error">
                            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-red-700">
                              {r.error}
                            </pre>
                          </Block>
                        )}
                        <Block label="Razon (IA)">
                          <p className="whitespace-pre-wrap text-secondary">
                            {r.razon ?? <span className="text-muted-foreground">—</span>}
                          </p>
                        </Block>
                        <Block label="Indicador">
                          <div className="space-y-1">
                            <p className="text-secondary">
                              matched: <BoolBadge value={r.indicatorMatched} inline />
                            </p>
                            {r.indicatorDetails && Object.keys(r.indicatorDetails).length > 0 && (
                              <pre className="max-h-40 overflow-auto rounded bg-white p-2 font-mono text-[11px] text-secondary">
                                {JSON.stringify(r.indicatorDetails, null, 2)}
                              </pre>
                            )}
                          </div>
                        </Block>
                        {!r.skippedReason && (
                          <>
                            <Block label="Prompt enviado">
                              <pre className="max-h-48 overflow-auto rounded bg-white p-2 font-mono text-[11px] text-secondary">
                                {r.promptUsed ?? '—'}
                              </pre>
                            </Block>
                            <Block label="Respuesta cruda del LLM">
                              <pre className="max-h-48 overflow-auto rounded bg-white p-2 font-mono text-[11px] text-secondary">
                                {r.rawResponse ?? '—'}
                              </pre>
                            </Block>
                          </>
                        )}
                        <Block label="Metadata">
                          <p className="text-secondary">
                            provider:{' '}
                            {r.provider ? PROVIDER_LABELS[r.provider] ?? r.provider : '—'} ·
                            model: <span className="font-mono">{r.model ?? '—'}</span> ·
                            symbol: <span className="font-mono">{r.symbol}</span>
                          </p>
                        </Block>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function BoolBadge({
  value,
  inline = false,
}: {
  value: boolean | null;
  inline?: boolean;
}) {
  if (value === null) {
    const cls = 'bg-muted text-muted-foreground';
    return (
      <span
        className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}
        title="Sin valor (stub)"
      >
        —
      </span>
    );
  }
  const cls = value
    ? 'bg-green-100 text-green-700'
    : 'bg-red-100 text-red-700';
  const symbol = value ? '✓' : '✗';
  if (inline) {
    return (
      <span
        className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}
      >
        {symbol} {value ? 'true' : 'false'}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex h-5 w-5 items-center justify-center rounded text-xs font-medium ${cls}`}
    >
      {symbol}
    </span>
  );
}

function Block({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: 'error' | 'warn';
  children: React.ReactNode;
}) {
  const toneClass =
    tone === 'error'
      ? 'border-red-200 bg-red-50'
      : tone === 'warn'
      ? 'border-amber-200 bg-amber-50'
      : 'border-border bg-white';
  return (
    <div className={`rounded-md border p-3 ${toneClass}`}>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}
