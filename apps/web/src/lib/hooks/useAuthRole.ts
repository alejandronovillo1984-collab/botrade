'use client';

import { auth } from '@/lib/firebase';
import { onAuthStateChanged, User as FirebaseUser, getIdTokenResult } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useEffect, useState } from 'react';
import { Role, ROLES } from '@botrade/shared';

const SUPERADMIN_EMAIL = 'alejandronovillo1984@gmail.com';

function resolveRole(roleClaim: unknown): Role {
  return roleClaim === ROLES.SUPERADMIN ? ROLES.SUPERADMIN : ROLES.USER;
}

export function useAuthRole() {
  const [role, setRole] = useState<Role | null>(null);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          // Forzamos refresh del token para obtener los custom claims actualizados.
          let tokenResult = await getIdTokenResult(currentUser, true);
          let resolvedRole = resolveRole(tokenResult.claims.role);

          // Fallback: si el email corresponde al superadmin pero el claim no refleja
          // el rol, sincronizamos desde el backend y volvemos a refrescar el token.
          if (
            currentUser.email?.toLowerCase() === SUPERADMIN_EMAIL &&
            resolvedRole !== ROLES.SUPERADMIN
          ) {
            try {
              const functions = getFunctions();
              const syncRole = httpsCallable(functions, 'syncRole');
              await syncRole();
              tokenResult = await getIdTokenResult(currentUser, true);
              resolvedRole = resolveRole(tokenResult.claims.role);
            } catch (syncError) {
              // Si falla la sincronización, mantenemos el rol que teníamos del token.
              console.error('Error syncing role:', syncError);
            }
          }

          setRole(resolvedRole);
        } catch {
          setRole(ROLES.USER);
        }
      } else {
        setRole(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return {
    user,
    role,
    loading,
    isSuperAdmin: role === ROLES.SUPERADMIN,
    isUser: role === ROLES.USER,
  };
}
