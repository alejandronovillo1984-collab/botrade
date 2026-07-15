'use client';

import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { User } from '@botrade/shared';

export function useUser(uid: string | undefined) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!uid) {
      setUser(null);
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, 'users', uid),
      (snapshot) => {
        if (snapshot.exists()) {
          setUser({ uid: snapshot.id, ...snapshot.data() } as User);
        } else {
          setUser(null);
        }
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [uid]);

  return { user, loading, error };
}
