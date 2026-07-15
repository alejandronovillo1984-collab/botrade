'use client';

import { auth } from '@/lib/firebase';
import { onAuthStateChanged, User as FirebaseUser, getIdTokenResult } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { Role, ROLES } from '@botrade/shared';

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
          const tokenResult = await getIdTokenResult(currentUser, true);
          const roleClaim = tokenResult.claims.role as Role;
          setRole(roleClaim === ROLES.SUPERADMIN ? ROLES.SUPERADMIN : ROLES.USER);
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
