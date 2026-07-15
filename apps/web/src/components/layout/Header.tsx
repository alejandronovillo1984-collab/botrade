'use client';

import { auth } from '@/lib/firebase';
import { useUser } from '@/lib/hooks/useUser';
import { Shield } from 'lucide-react';
import { ROLES } from '@botrade/shared';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
  const { user } = useUser(auth.currentUser?.uid);

  return (
    <header className="flex items-start justify-between border-b border-border bg-white px-8 py-6">
      <div>
        <h1 className="text-2xl font-bold text-secondary">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {user?.role === ROLES.SUPERADMIN && (
        <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <Shield className="h-3 w-3" />
          Superadmin
        </div>
      )}
    </header>
  );
}
