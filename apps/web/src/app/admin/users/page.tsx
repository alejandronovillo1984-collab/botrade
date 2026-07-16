'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

export const dynamic = 'force-dynamic';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';
import { functions } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { db } from '@/lib/firebase';
import { useAuthRole } from '@/lib/hooks/useAuthRole';
import { ROLES, Role } from '@botrade/shared';
import { Card, Button } from '@/components/ui/Button';
import { Plus, Pencil, Trash2, X, Loader2, Search } from 'lucide-react';

interface AdminUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

type Mode = { kind: 'closed' } | { kind: 'create' } | { kind: 'edit'; user: AdminUser };

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

export default function AdminUsersPage() {
  const { user: currentUser, isSuperAdmin } = useAuthRole();
  const [users, setUsers] = useState<AdminUser[]>([]);
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
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map(
          (docSnap) =>
            ({
              uid: docSnap.id,
              ...(docSnap.data() as Omit<AdminUser, 'uid'>),
              createdAt: toIso(docSnap.get('createdAt')),
              updatedAt: toIso(docSnap.get('updatedAt')),
            }) as AdminUser
        );
        setUsers(data);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error('Error listening to users:', err);
        setError(getErrorMessage(err));
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isSuperAdmin]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter((u) => {
      const email = (u.email ?? '').toLowerCase();
      const name = (u.displayName ?? '').toLowerCase();
      return email.includes(term) || name.includes(term);
    });
  }, [users, search]);

  const openCreate = () => {
    setMode({ kind: 'create' });
    setFormError(null);
  };

  const openEdit = (user: AdminUser) => {
    setMode({ kind: 'edit', user });
    setFormError(null);
  };

  const closeModal = () => {
    if (submitting) return;
    setMode({ kind: 'closed' });
    setFormError(null);
  };

  const handleCreate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (mode.kind !== 'create') return;
    setSubmitting(true);
    setFormError(null);
    try {
      const formData = new FormData(e.currentTarget);
      const payload = {
        email: String(formData.get('email') ?? '').trim(),
        password: String(formData.get('password') ?? ''),
        displayName: String(formData.get('displayName') ?? '').trim(),
        role: String(formData.get('role') ?? ROLES.USER) as Role,
      };
      if (!payload.email || !payload.password) {
        setFormError('Email y contraseña son obligatorios');
        return;
      }
      const createUser = httpsCallable(functions, 'createUser');
      await createUser(payload);
      setMode({ kind: 'closed' });
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (mode.kind !== 'edit') return;
    setSubmitting(true);
    setFormError(null);
    try {
      const formData = new FormData(e.currentTarget);
      const displayNameRaw = String(formData.get('displayName') ?? '').trim();
      const isActiveValue = formData.get('isActive') === 'on';
      const roleValue = String(formData.get('role') ?? mode.user.role) as Role;

      const isOwnProfile = mode.user.uid === currentUser?.uid;
      const previousRole = mode.user.role;

      if (!isOwnProfile) {
        await updateDoc(doc(db, 'users', mode.user.uid), {
          displayName: displayNameRaw || null,
          isActive: isActiveValue,
          role: roleValue,
          updatedAt: new Date().toISOString(),
        });
      } else {
        await updateDoc(doc(db, 'users', mode.user.uid), {
          displayName: displayNameRaw || null,
          isActive: isActiveValue,
          updatedAt: new Date().toISOString(),
        });
      }

      if (roleValue !== previousRole) {
        const updateUser = httpsCallable(functions, 'updateUser');
        await updateUser({
          uid: mode.user.uid,
          role: roleValue,
        });
      }

      setMode({ kind: 'closed' });
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (user: AdminUser) => {
    if (user.uid === currentUser?.uid) return;
    const confirmed = window.confirm(
      `¿Eliminar al usuario ${user.email ?? user.uid}? Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;
    try {
      const deleteUser = httpsCallable<{ uid: string }, { success: boolean }>(
        functions,
        'deleteUser'
      );
      await deleteUser({ uid: user.uid });
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="p-8">
        <Card title="Acceso denegado">
          <p className="text-sm text-muted-foreground">
            Necesitás ser superadmin para gestionar usuarios.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-secondary">Usuarios</h2>
          <p className="text-sm text-muted-foreground">
            Alta, baja y modificación de usuarios de la plataforma.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por email o nombre"
              className="w-full rounded-md border border-border bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 sm:w-72"
            />
          </div>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo usuario
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
            Cargando usuarios...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {users.length === 0
              ? 'Todavía no hay usuarios registrados.'
              : 'No se encontraron usuarios con ese criterio.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-3 pr-4 font-medium">Email</th>
                  <th className="py-3 pr-4 font-medium">Nombre</th>
                  <th className="py-3 pr-4 font-medium">Rol</th>
                  <th className="py-3 pr-4 font-medium">Estado</th>
                  <th className="py-3 pr-4 font-medium">Creado</th>
                  <th className="py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const isSelf = u.uid === currentUser?.uid;
                  return (
                    <tr key={u.uid} className="border-b border-border last:border-b-0">
                      <td className="py-3 pr-4 font-medium text-secondary">{u.email ?? '—'}</td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {u.displayName ?? '—'}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            u.role === ROLES.SUPERADMIN
                              ? 'bg-primary/10 text-primary'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            u.isActive
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {u.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {formatDate(u.createdAt)}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => openEdit(u)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-secondary hover:bg-muted"
                            title="Editar"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Editar
                          </button>
                          <button
                            onClick={() => handleDelete(u)}
                            disabled={isSelf}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                            title={isSelf ? 'No podés eliminarte a vos mismo' : 'Eliminar'}
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

      {mode.kind === 'create' && (
        <UserFormModal
          mode={mode}
          onClose={closeModal}
          onSubmit={handleCreate}
          submitting={submitting}
          formError={formError}
        />
      )}
      {mode.kind === 'edit' && (
        <UserFormModal
          mode={mode}
          onClose={closeModal}
          onSubmit={handleEdit}
          submitting={submitting}
          formError={formError}
        />
      )}
    </div>
  );
}

function UserFormModal({
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
  const initialEmail = isEdit ? mode.user.email ?? '' : '';
  const initialDisplayName = isEdit ? mode.user.displayName ?? '' : '';
  const initialRole = isEdit ? mode.user.role : ROLES.USER;
  const initialIsActive = isEdit ? mode.user.isActive : true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-lg font-semibold text-secondary">
            {isEdit ? 'Editar usuario' : 'Nuevo usuario'}
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
            <label className="mb-1 block text-sm font-medium text-secondary">Email</label>
            <input
              type="email"
              name="email"
              defaultValue={initialEmail}
              disabled={isEdit}
              required
              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-muted disabled:text-muted-foreground"
            />
          </div>

          {!isEdit && (
            <div>
              <label className="mb-1 block text-sm font-medium text-secondary">
                Contraseña
              </label>
              <input
                type="password"
                name="password"
                minLength={6}
                required
                placeholder="Mínimo 6 caracteres"
                className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-secondary">Nombre</label>
            <input
              type="text"
              name="displayName"
              defaultValue={initialDisplayName}
              maxLength={80}
              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-secondary">Rol</label>
            <select
              name="role"
              defaultValue={initialRole}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value={ROLES.USER}>user</option>
              <option value={ROLES.SUPERADMIN}>superadmin</option>
            </select>
          </div>

          {isEdit && (
            <label className="flex items-center gap-2 text-sm text-secondary">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={initialIsActive}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              Usuario activo
            </label>
          )}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? 'Guardar cambios' : 'Crear usuario'}
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
