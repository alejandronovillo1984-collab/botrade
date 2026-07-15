'use client';

import { useAuthRole } from '@/lib/hooks/useAuthRole';
import { Shield, User } from 'lucide-react';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
  const { isSuperAdmin, loading } = useAuthRole();

  return (
    <header className="flex items-start justify-between border-b border-border bg-white px-8 py-6">
      <div>
        <h1 className="text-2xl font-bold text-secondary">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {!loading && (
        <div
          className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
            isSuperAdmin
              ? 'bg-primary/10 text-primary'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {isSuperAdmin ? (
            <>
              <Shield className="h-3 w-3" />
              Superadmin
            </>
          ) : (
            <>
              <User className="h-3 w-3" />
              Usuario
            </>
          )}
        </div>
      )}
    </header>
  );
}
