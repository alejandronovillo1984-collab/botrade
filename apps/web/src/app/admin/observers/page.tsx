'use client';

export const dynamic = 'force-dynamic';

import { FormEvent, useEffect, useState } from 'react';

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthRole } from '@/lib/hooks/useAuthRole';
import { Card, Button } from '@/components/ui/Button';
import { Plus, Pencil, Trash2, X, Loader2, Sparkles, Settings2, History } from 'lucide-react';
import {
  INDICE_LABELS,
  MARKET_OPEN_LABELS,
  MarketOpen,
  Observer,
  ObserverIndice,
  ObserverMercado,
  ObserverTemporalidad,
} from '@botrade/shared';
import { AiExecutionsDrawer } from './AiExecutionsDrawer';

type Mode = { kind: 'closed' } | { kind: 'create' } | { kind: 'edit'; observer: Observer };
type FormTab = 'general' | 'ia';

const INDICE_OPTIONS: { value: ObserverIndice; label: string }[] = (
  Object.entries(INDICE_LABELS) as [ObserverIndice, string][]
).map(([value, label]) => ({ value, label }));

const TEMPORALIDAD_OPTIONS: { value: ObserverTemporalidad; label: string }[] = [
  { value: '1m', label: '1 minuto' },
  { value: '5m', label: '5 minutos' },
  { value: '1h', label: '1 hora' },
];

const MERCADO_OPTIONS: { value: ObserverMercado; label: string }[] = [
  { value: 'nasdaq', label: 'NASDAQ' },
  { value: 'sp500', label: 'S&P 500' },
];

const MARKET_OPEN_OPTIONS: { value: MarketOpen; label: string }[] = (
  Object.entries(MARKET_OPEN_LABELS) as [MarketOpen, string][]
).map(([value, label]) => ({ value, label }));

const DEFAULT_AI_WINDOW = 20;

function getErrorMessage(err: unknown): string {
  const code = (err as { code?: string }).code;
  const message = (err as { message?: string }).message;
  if (typeof message === 'string' && message.length > 0) return message;
  if (typeof code === 'string') return code;
  return 'Error desconocido';
}

function toIso(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return ((value as { toDate: () => Date }).toDate()).toISOString();
  }
  return new Date().toISOString();
}

export default function AdminObserversPage() {
  const { isSuperAdmin } = useAuthRole();
  const [observers, setObservers] = useState<Observer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: 'closed' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [aiDrawerObserver, setAiDrawerObserver] = useState<Observer | null>(null);

  useEffect(() => {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(collection(db, 'observers'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map(
          (docSnap) =>
            ({
              id: docSnap.id,
              ...(docSnap.data() as Omit<Observer, 'id'>),
              createdAt: toIso(docSnap.get('createdAt')),
              updatedAt: toIso(docSnap.get('updatedAt')),
            }) as Observer
        );
        setObservers(data);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error('Error listening to observers:', err);
        setError(getErrorMessage(err));
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isSuperAdmin]);

  const openCreate = () => {
    setMode({ kind: 'create' });
    setFormError(null);
  };

  const openEdit = (observer: Observer) => {
    setMode({ kind: 'edit', observer });
    setFormError(null);
  };

  const closeModal = () => {
    if (submitting) return;
    setMode({ kind: 'closed' });
    setFormError(null);
  };

  const handleSubmit = async (payload: {
    name: string | null;
    indice: ObserverIndice;
    temporalidad: ObserverTemporalidad;
    mercado: ObserverMercado;
    marketOpen: MarketOpen | null;
    isActive: boolean;
    lookback: number | null;
    prompt: string | null;
    aiWindow: number | null;
  }) => {
    if (mode.kind === 'closed') return;
    setSubmitting(true);
    setFormError(null);
    try {
      const {
        name,
        indice,
        temporalidad,
        mercado,
        marketOpen,
        isActive,
        lookback,
        prompt,
        aiWindow,
      } = payload;

      if (!indice || !temporalidad || !mercado) {
        setFormError('Indicador, temporalidad y mercado son obligatorios');
        return;
      }
      if (indice === 'apertura_mercado' && !marketOpen) {
        setFormError('Elegí qué apertura de mercado querés observar');
        return;
      }
      if (indice === 'ia' && (!prompt || !prompt.trim())) {
        setFormError('El prompt es obligatorio para el indicador IA');
        return;
      }
      if (indice === 'ia' && aiWindow !== null && aiWindow < 2) {
        setFormError('La ventana de IA debe ser al menos 2 velas');
        return;
      }

      const promptPayload = indice === 'ia' ? prompt?.trim() ?? null : null;
      const aiWindowPayload = indice === 'ia' ? aiWindow : null;
      const namePayload = indice === 'ia' && name && name.trim().length > 0
        ? name.trim()
        : null;

      if (mode.kind === 'create') {
        const now = serverTimestamp();
        await addDoc(collection(db, 'observers'), {
          name: namePayload,
          indice,
          temporalidad,
          mercado,
          marketOpen: indice === 'apertura_mercado' ? marketOpen : null,
          isActive,
          lookback: indice === 'inbalance' || indice === 'apertura_mercado' ? lookback : null,
          prompt: promptPayload,
          aiWindow: aiWindowPayload,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        await updateDoc(doc(db, 'observers', mode.observer.id), {
          name: namePayload,
          indice,
          temporalidad,
          mercado,
          marketOpen: indice === 'apertura_mercado' ? marketOpen : null,
          isActive,
          lookback: indice === 'inbalance' || indice === 'apertura_mercado' ? lookback : null,
          prompt: promptPayload,
          aiWindow: aiWindowPayload,
          updatedAt: serverTimestamp(),
        });
      }

      setMode({ kind: 'closed' });
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (observer: Observer) => {
    const confirmed = window.confirm(
      `¿Eliminar el observador? Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, 'observers', observer.id));
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="p-8">
        <Card title="Acceso denegado">
          <p className="text-sm text-muted-foreground">
            Necesitás ser superadmin para gestionar observadores.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-secondary">Observadores</h2>
          <p className="text-sm text-muted-foreground">
            Alta, baja y modificación de observadores del mercado.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo observador
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Card>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Cargando observadores...
          </div>
        ) : observers.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Todavía no hay observadores cargados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-3 pr-4 font-medium">Indicador</th>
                  <th className="py-3 pr-4 font-medium">Temporalidad</th>
                  <th className="py-3 pr-4 font-medium">Mercado</th>
                  <th className="py-3 pr-4 font-medium">Estado</th>
                  <th className="py-3 pr-4 font-medium">Actualizado</th>
                  <th className="py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {observers.map((o) => {
                  const indiceLabel =
                    INDICE_OPTIONS.find((opt) => opt.value === o.indice)?.label ?? o.indice;
                  const marketOpenLabel = o.marketOpen
                    ? MARKET_OPEN_OPTIONS.find((opt) => opt.value === o.marketOpen)?.label ??
                      o.marketOpen
                    : null;
                  const isIa = o.indice === 'ia';
                  const iaName =
                    isIa && typeof o.name === 'string' && o.name.trim().length > 0
                      ? o.name.trim()
                      : null;
                  return (
                    <tr key={o.id} className="border-b border-border last:border-b-0 align-top">
                      <td className="py-3 pr-4 text-muted-foreground">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {isIa ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                              <Sparkles className="h-3 w-3" />
                              {iaName ?? indiceLabel}
                            </span>
                          ) : (
                            <span>{indiceLabel}</span>
                          )}
                          {marketOpenLabel && (
                            <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                              {marketOpenLabel}
                            </span>
                          )}
                          {isIa && o.prompt && (
                            <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700">
                              Prompt
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {TEMPORALIDAD_OPTIONS.find((opt) => opt.value === o.temporalidad)?.label ?? o.temporalidad}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {MERCADO_OPTIONS.find((opt) => opt.value === o.mercado)?.label ?? o.mercado}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            o.isActive
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {o.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {formatDate(o.updatedAt)}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => openEdit(o)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-secondary hover:bg-muted"
                            title="Editar"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Editar
                          </button>
                          {o.indice === 'ia' && (
                            <button
                              onClick={() => setAiDrawerObserver(o)}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-violet-700 hover:bg-violet-50"
                              title="Ver ejecuciones de IA"
                            >
                              <History className="h-3.5 w-3.5" />
                              Ver IA
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(o)}
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

      {mode.kind !== 'closed' && (
        <ObserverFormModal
          mode={mode}
          onClose={closeModal}
          onSubmit={handleSubmit}
          submitting={submitting}
          formError={formError}
        />
      )}

      {aiDrawerObserver && (
        <AiExecutionsDrawer
          observer={aiDrawerObserver}
          onClose={() => setAiDrawerObserver(null)}
        />
      )}
    </div>
  );
}

function ObserverFormModal({
  mode,
  onClose,
  onSubmit,
  submitting,
  formError,
}: {
  mode: Exclude<Mode, { kind: 'closed' }>;
  onClose: () => void;
  onSubmit: (payload: {
    name: string | null;
    indice: ObserverIndice;
    temporalidad: ObserverTemporalidad;
    mercado: ObserverMercado;
    marketOpen: MarketOpen | null;
    isActive: boolean;
    lookback: number | null;
    prompt: string | null;
    aiWindow: number | null;
  }) => void;
  submitting: boolean;
  formError: string | null;
}) {
  const isEdit = mode.kind === 'edit';
  const observer = isEdit ? mode.observer : null;

  const [indice, setIndice] = useState<ObserverIndice>(
    observer?.indice ?? 'inbalance'
  );
  const [temporalidad, setTemporalidad] = useState<ObserverTemporalidad>(
    observer?.temporalidad ?? '1m'
  );
  const [mercado, setMercado] = useState<ObserverMercado>(
    observer?.mercado ?? 'nasdaq'
  );
  const [marketOpen, setMarketOpen] = useState<MarketOpen | ''>(
    observer?.marketOpen ?? ''
  );
  const [isActive, setIsActive] = useState<boolean>(observer?.isActive ?? true);
  const [name, setName] = useState<string>(observer?.name ?? '');
  const [prompt, setPrompt] = useState<string>(observer?.prompt ?? '');
  const [aiWindow, setAiWindow] = useState<number>(
    typeof observer?.aiWindow === 'number' && observer.aiWindow > 0
      ? observer.aiWindow
      : DEFAULT_AI_WINDOW
  );
  const [tab, setTab] = useState<FormTab>('general');

  const isIa = indice === 'ia';
  const showMarketOpenSelector = indice === 'apertura_mercado';
  const showIaTab = isIa;

  useEffect(() => {
    if (!showIaTab && tab === 'ia') {
      setTab('general');
    }
  }, [showIaTab, tab]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit({
      name: isIa ? name : '',
      indice,
      temporalidad,
      mercado,
      marketOpen: showMarketOpenSelector && marketOpen ? marketOpen : null,
      isActive,
      lookback: null,
      prompt: isIa ? prompt : '',
      aiWindow: isIa ? aiWindow : null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-lg font-semibold text-secondary">
            {isEdit ? 'Editar observador' : 'Nuevo observador'}
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

          {showIaTab && (
            <div className="flex gap-1 rounded-md border border-border bg-muted/30 p-1">
              <button
                type="button"
                onClick={() => setTab('general')}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  tab === 'general'
                    ? 'bg-white text-secondary shadow-sm'
                    : 'text-muted-foreground hover:text-secondary'
                }`}
              >
                <Settings2 className="h-4 w-4" />
                Datos generales
              </button>
              <button
                type="button"
                onClick={() => setTab('ia')}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  tab === 'ia'
                    ? 'bg-white text-secondary shadow-sm'
                    : 'text-muted-foreground hover:text-secondary'
                }`}
              >
                <Sparkles className="h-4 w-4" />
                IA
                {prompt.trim() && (
                  <span className="ml-1 inline-flex h-2 w-2 rounded-full bg-primary" />
                )}
              </button>
            </div>
          )}

          {tab === 'general' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-secondary">Índice</label>
                  <select
                    value={indice}
                    onChange={(e) => setIndice(e.target.value as ObserverIndice)}
                    className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    {INDICE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-secondary">Mercado</label>
                  <select
                    value={mercado}
                    onChange={(e) => setMercado(e.target.value as ObserverMercado)}
                    className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    {MERCADO_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {showMarketOpenSelector && (
                <div className="rounded-md border border-border bg-muted/30 p-3">
                  <label className="mb-1 block text-sm font-medium text-secondary">
                    ¿Qué apertura de mercado?
                  </label>
                  <select
                    value={marketOpen}
                    onChange={(e) => setMarketOpen(e.target.value as MarketOpen | '')}
                    required
                    className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="" disabled>
                      Seleccionar...
                    </option>
                    {MARKET_OPEN_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {isIa && (
                <div className="rounded-md border border-violet-200 bg-violet-50/40 p-3 text-xs text-secondary">
                  <p className="font-medium">Indicador IA</p>
                  <p className="mt-1 text-muted-foreground">
                    Este observador se procesa con un modelo de IA. Definí el prompt y la
                    ventana de velas en la pestaña <strong>IA</strong>.
                  </p>
                </div>
              )}

              {isIa && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-secondary">
                    Nombre del indicador IA
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={60}
                    placeholder="Ej: Detector de momentum"
                    className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Nombre que se muestra en la tabla. Si lo dejás vacío, se muestra "IA".
                  </p>
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-secondary">
                  Temporalidad
                </label>
                <select
                  value={temporalidad}
                  onChange={(e) => setTemporalidad(e.target.value as ObserverTemporalidad)}
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  {TEMPORALIDAD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm text-secondary">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                Observador activo
              </label>
            </div>
          )}

          {tab === 'ia' && isIa && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-secondary">Prompt</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={8}
                  required
                  placeholder="Ej: Analizá la última vela y devolvé un JSON con dirección, fuerza y zona..."
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Se envía tal cual al backend en la consulta del indicador.
                </p>
              </div>

              <div className="rounded-md border border-border bg-muted/30 p-3">
                <label className="mb-1 block text-sm font-medium text-secondary">
                  Ventana de IA (velas)
                </label>
                <input
                  type="number"
                  min={2}
                  max={500}
                  step={1}
                  value={aiWindow}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    if (Number.isFinite(next)) setAiWindow(next);
                  }}
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Cantidad de velas OHLC que se le envían a la IA en cada consulta. Mínimo 2.
                  Default {DEFAULT_AI_WINDOW}.
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? 'Guardar cambios' : 'Crear observador'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}
