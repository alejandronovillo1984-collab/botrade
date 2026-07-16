export const dynamic = 'force-dynamic';

'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

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
import { Plus, Pencil, Trash2, X, Loader2, Search } from 'lucide-react';

interface Strategy {
  id: string;
  name: string;
  detail: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

type Mode = { kind: 'closed' } | { kind: 'create' } | { kind: 'edit'; strategy: Strategy };

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

export default function AdminStrategiesPage() {
  const { isSuperAdmin } = useAuthRole();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<Mode>({ kind: 'closed' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(collection(db, 'strategies'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map(
          (docSnap) =>
            ({
              id: docSnap.id,
              ...(docSnap.data() as Omit<Strategy, 'id'>),
              createdAt: toIso(docSnap.get('createdAt')),
              updatedAt: toIso(docSnap.get('updatedAt')),
            }) as Strategy
        );
        setStrategies(data);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error('Error listening to strategies:', err);
        setError(getErrorMessage(err));
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isSuperAdmin]);

  const filteredStrategies = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return strategies;
    return strategies.filter((s) => {
      const name = (s.name ?? '').toLowerCase();
      const detail = (s.detail ?? '').toLowerCase();
      return name.includes(term) || detail.includes(term);
    });
  }, [strategies, search]);

  const openCreate = () => {
    setMode({ kind: 'create' });
    setFormError(null);
  };

  const openEdit = (strategy: Strategy) => {
    setMode({ kind: 'edit', strategy });
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
      const name = String(formData.get('name') ?? '').trim();
      const detail = String(formData.get('detail') ?? '').trim();
      const isActive = formData.get('isActive') === 'on';

      if (!name || !detail) {
        setFormError('Nombre y detalle son obligatorios');
        return;
      }

      if (mode.kind === 'create') {
        const now = serverTimestamp();
        await addDoc(collection(db, 'strategies'), {
          name,
          detail,
          isActive,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        await updateDoc(doc(db, 'strategies', mode.strategy.id), {
          name,
          detail,
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

  const handleDelete = async (strategy: Strategy) => {
    const confirmed = window.confirm(
      `¿Eliminar la estrategia "${strategy.name}"? Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, 'strategies', strategy.id));
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="p-8">
        <Card title="Acceso denegado">
          <p className="text-sm text-muted-foreground">
            Necesitás ser superadmin para gestionar estrategias.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-secondary">Estrategias</h2>
          <p className="text-sm text-muted-foreground">
            Alta, baja y modificación de estrategias disponibles en la plataforma.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o detalle"
              className="w-full rounded-md border border-border bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 sm:w-72"
            />
          </div>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva estrategia
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
            Cargando estrategias...
          </div>
        ) : filteredStrategies.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {strategies.length === 0
              ? 'Todavía no hay estrategias cargadas.'
              : 'No se encontraron estrategias con ese criterio.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-3 pr-4 font-medium">Nombre</th>
                  <th className="py-3 pr-4 font-medium">Detalle</th>
                  <th className="py-3 pr-4 font-medium">Estado</th>
                  <th className="py-3 pr-4 font-medium">Actualizado</th>
                  <th className="py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredStrategies.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-b-0 align-top">
                    <td className="py-3 pr-4 font-medium text-secondary">{s.name}</td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      <p className="line-clamp-2 max-w-md whitespace-pre-wrap">{s.detail}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          s.isActive
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {s.isActive ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {formatDate(s.updatedAt)}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openEdit(s)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-secondary hover:bg-muted"
                          title="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(s)}
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
        <StrategyFormModal
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

function StrategyFormModal({
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
  const initialName = isEdit ? mode.strategy.name : '';
  const initialDetail = isEdit ? mode.strategy.detail : '';
  const initialIsActive = isEdit ? mode.strategy.isActive : true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-lg font-semibold text-secondary">
            {isEdit ? 'Editar estrategia' : 'Nueva estrategia'}
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
            <label className="mb-1 block text-sm font-medium text-secondary">Nombre</label>
            <input
              type="text"
              name="name"
              defaultValue={initialName}
              maxLength={80}
              required
              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-secondary">Detalle</label>
            <textarea
              name="detail"
              defaultValue={initialDetail}
              maxLength={2000}
              required
              rows={5}
              className="w-full resize-y rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-secondary">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={initialIsActive}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            Estrategia activa
          </label>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? 'Guardar cambios' : 'Crear estrategia'}
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
