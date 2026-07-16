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
import { Plus, Pencil, Trash2, X, Loader2 } from 'lucide-react';
import { MarketOpen, Observer, ObserverIndice, ObserverMercado, ObserverTemporalidad } from '@botrade/shared';

type Mode = { kind: 'closed' } | { kind: 'create' } | { kind: 'edit'; observer: Observer };

const INDICE_OPTIONS: { value: ObserverIndice; label: string }[] = [
  { value: 'inbalance', label: 'Inbalance' },
  { value: 'choch', label: 'CHoCH' },
  { value: 'barrido', label: 'Barrido' },
];

const TEMPORALIDAD_OPTIONS: { value: ObserverTemporalidad; label: string }[] = [
  { value: '1m', label: '1 minuto' },
  { value: '15m', label: '15 minutos' },
  { value: '30m', label: '30 minutos' },
  { value: '1h', label: '1 hora' },
];

const MERCADO_OPTIONS: { value: ObserverMercado; label: string }[] = [
  { value: 'nasdaq', label: 'NASDAQ' },
  { value: 'sp500', label: 'S&P 500' },
];

const MARKET_OPEN_OPTIONS: { value: MarketOpen; label: string }[] = [
  { value: 'sidney', label: 'Sídney' },
  { value: 'tokio', label: 'Tokio' },
  { value: 'nueva_york', label: 'Nueva York' },
];

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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (mode.kind === 'closed') return;
    setSubmitting(true);
    setFormError(null);
    try {
      const formData = new FormData(e.currentTarget);
      const indice = formData.get('indice') as ObserverIndice;
      const temporalidad = formData.get('temporalidad') as ObserverTemporalidad;
      const mercado = formData.get('mercado') as ObserverMercado;
      const marketOpenValue = formData.get('marketOpen') as MarketOpen | '';
      const marketOpen = marketOpenValue ? (marketOpenValue as MarketOpen) : null;
      const isActive = formData.get('isActive') === 'on';

      if (!indice || !temporalidad || !mercado) {
        setFormError('Todos los campos son obligatorios');
        return;
      }

      if (mode.kind === 'create') {
        const now = serverTimestamp();
        await addDoc(collection(db, 'observers'), {
          indice,
          temporalidad,
          mercado,
          marketOpen,
          isActive,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        await updateDoc(doc(db, 'observers', mode.observer.id), {
          indice,
          temporalidad,
          mercado,
          marketOpen,
          isActive,
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
                  <th className="py-3 pr-4 font-medium">Índice</th>
                  <th className="py-3 pr-4 font-medium">Temporalidad</th>
                  <th className="py-3 pr-4 font-medium">Mercado</th>
                  <th className="py-3 pr-4 font-medium">Apertura</th>
                  <th className="py-3 pr-4 font-medium">Estado</th>
                  <th className="py-3 pr-4 font-medium">Actualizado</th>
                  <th className="py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {observers.map((o) => (
                  <tr key={o.id} className="border-b border-border last:border-b-0 align-top">
                    <td className="py-3 pr-4 text-muted-foreground">
                      {INDICE_OPTIONS.find((opt) => opt.value === o.indice)?.label ?? o.indice}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {TEMPORALIDAD_OPTIONS.find((opt) => opt.value === o.temporalidad)?.label ?? o.temporalidad}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {MERCADO_OPTIONS.find((opt) => opt.value === o.mercado)?.label ?? o.mercado}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {o.marketOpen ? (MARKET_OPEN_OPTIONS.find((opt) => opt.value === o.marketOpen)?.label ?? o.marketOpen) : '-'}
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
                ))}
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
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  submitting: boolean;
  formError: string | null;
}) {
  const isEdit = mode.kind === 'edit';
  const initialIndice = isEdit ? mode.observer.indice : 'inbalance';
  const initialTemporalidad = isEdit ? mode.observer.temporalidad : '1m';
  const initialMercado = isEdit ? mode.observer.mercado : 'nasdaq';
  const initialMarketOpen = isEdit ? (mode.observer.marketOpen ?? '') : '';
  const initialIsActive = isEdit ? mode.observer.isActive : true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-lg font-semibold text-secondary">
            {isEdit ? 'Editar observador' : 'Nuevo observador'}
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-secondary"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 px-5 py-4">
          {formError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-secondary">Índice</label>
            <select
              name="indice"
              defaultValue={initialIndice}
              required
              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {INDICE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-secondary">Temporalidad</label>
            <select
              name="temporalidad"
              defaultValue={initialTemporalidad}
              required
              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {TEMPORALIDAD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-secondary">Mercado</label>
            <select
              name="mercado"
              defaultValue={initialMercado}
              required
              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {MERCADO_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-secondary">Indicador apertura de mercado</label>
            <select
              name="marketOpen"
              defaultValue={initialMarketOpen}
              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Ninguno</option>
              {MARKET_OPEN_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-secondary">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={initialIsActive}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            Observador activo
          </label>

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
