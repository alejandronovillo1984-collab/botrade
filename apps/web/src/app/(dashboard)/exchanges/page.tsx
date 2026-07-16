'use client';

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
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthRole } from '@/lib/hooks/useAuthRole';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Header } from '@/components/layout/Header';
import { Card, Button } from '@/components/ui/Button';
import { Plus, Trash2, X, Loader2, KeyRound, Building2 } from 'lucide-react';
import { SUPPORTED_EXCHANGES } from '@botrade/shared';

interface ExchangeAccount {
  id: string;
  exchangeId: string;
  label: string;
  isTestnet: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

type Mode = { kind: 'closed' } | { kind: 'create' };

function getErrorMessage(err: unknown): string {
  const code = (err as { code?: string }).code;
  const message = (err as { message?: string }).message;
  if (typeof message === 'string' && message.length > 0) return message;
  if (typeof code === 'string') return code;
  return 'Error desconocido';
}

function exchangeName(id: string): string {
  return SUPPORTED_EXCHANGES.find((e) => e.id === id)?.name ?? id;
}

function toIso(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return ((value as { toDate: () => Date }).toDate()).toISOString();
  }
  return new Date().toISOString();
}

export default function ExchangesPage() {
  const { user } = useAuthRole();
  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: 'closed' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, 'users', user.uid, 'exchanges'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => {
          const raw = docSnap.data();
          return {
            id: docSnap.id,
            exchangeId: raw.exchangeId,
            label: raw.label,
            isTestnet: raw.isTestnet ?? false,
            isActive: raw.isActive ?? true,
            createdAt: toIso(raw.createdAt),
            updatedAt: toIso(raw.updatedAt),
          } satisfies ExchangeAccount;
        });
        setAccounts(data);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error('Error listening to exchange accounts:', err);
        setError(getErrorMessage(err));
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  const openCreate = () => {
    setMode({ kind: 'create' });
    setFormError(null);
  };

  const closeModal = () => {
    if (submitting) return;
    setMode({ kind: 'closed' });
    setFormError(null);
  };

  const handleCreate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user?.uid) return;
    if (mode.kind === 'closed') return;
    setSubmitting(true);
    setFormError(null);
    try {
      const formData = new FormData(e.currentTarget);
      const exchangeId = String(formData.get('exchangeId') ?? '');
      const label = String(formData.get('label') ?? '').trim();
      const token = String(formData.get('token') ?? '').trim();
      const isTestnet = formData.get('isTestnet') === 'on';

      if (!exchangeId || !token) {
        setFormError('Elegí un exchange y completá el token');
        return;
      }

      const exchange = SUPPORTED_EXCHANGES.find((ex) => ex.id === exchangeId);
      if (!exchange) {
        setFormError('Exchange no soportado');
        return;
      }

      const now = serverTimestamp();
      await addDoc(collection(db, 'users', user.uid, 'exchanges'), {
        exchangeId: exchange.id,
        label: label || exchange.name,
        credentials: {
          type: 'oauth',
          token,
        },
        isTestnet,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      setMode({ kind: 'closed' });
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (account: ExchangeAccount) => {
    if (!user?.uid) return;
    const confirmed = window.confirm(
      `¿Eliminar la cuenta "${account.label}"? Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;
    setDeletingId(account.id);
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'exchanges', account.id));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <DashboardLayout>
      <Header title="Exchanges" subtitle="Cuentas de exchange vinculadas" />
      <div className="p-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Agregá las credenciales de tus exchanges.
          </p>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Agregar exchange
          </Button>
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
              Cargando cuentas...
            </div>
          ) : accounts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Building2 className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                No hay exchanges vinculados todavía.
              </p>
              <Button variant="outline" onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Vincular el primero
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-3 pr-4 font-medium">Exchange</th>
                    <th className="py-3 pr-4 font-medium">Etiqueta</th>
                    <th className="py-3 pr-4 font-medium">Entorno</th>
                    <th className="py-3 pr-4 font-medium">Estado</th>
                    <th className="py-3 pr-4 font-medium">Creado</th>
                    <th className="py-3 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((acc) => (
                    <tr key={acc.id} className="border-b border-border last:border-b-0">
                      <td className="py-3 pr-4 font-medium text-secondary">
                        {exchangeName(acc.exchangeId)}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">{acc.label}</td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            acc.isTestnet
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {acc.isTestnet ? 'Testnet' : 'Producción'}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            acc.isActive
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {acc.isActive ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {formatDate(acc.createdAt)}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => handleDelete(acc)}
                          disabled={deletingId === acc.id}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                          title="Eliminar"
                        >
                          {deletingId === acc.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {mode.kind === 'create' && (
        <CreateExchangeModal
          onClose={closeModal}
          onSubmit={handleCreate}
          submitting={submitting}
          formError={formError}
        />
      )}
    </DashboardLayout>
  );
}

function CreateExchangeModal({
  onClose,
  onSubmit,
  submitting,
  formError,
}: {
  onClose: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  submitting: boolean;
  formError: string | null;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-lg font-semibold text-secondary">Agregar exchange</h3>
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
            <label className="mb-1 block text-sm font-medium text-secondary">
              Exchange
            </label>
            <select
              name="exchangeId"
              required
              defaultValue=""
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="" disabled>
                Seleccioná un exchange
              </option>
              {SUPPORTED_EXCHANGES.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-secondary">Token</label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="password"
                name="token"
                required
                autoComplete="off"
                placeholder="Pegá tu token de acceso"
                className="w-full rounded-md border border-border py-2 pl-9 pr-10 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <button
                type="button"
                onClick={() => {
                  const input = document.querySelector('input[name="token"]') as HTMLInputElement;
                  input.type = input.type === 'password' ? 'text' : 'password';
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-secondary"
                aria-label="Ver token"
              >
                <KeyRound className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              El token se guarda en la subcolección de tu usuario.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm text-secondary">
            <input
              type="checkbox"
              name="isTestnet"
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            Es cuenta de testnet
          </label>

          <div>
            <label className="mb-1 block text-sm font-medium text-secondary">
              Etiqueta <span className="text-muted-foreground">(opcional)</span>
            </label>
            <input
              type="text"
              name="label"
              maxLength={80}
              placeholder="Ej: Cuenta principal"
              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Vincular exchange
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
