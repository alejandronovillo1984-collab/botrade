'use client';

import { auth } from '@/lib/firebase';
import { logoutUser } from '@/lib/auth';
import { useAuthRole } from '@/lib/hooks/useAuthRole';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Bot,
  Building2,
  Settings,
  Users,
  LogOut,
  Shield,
  Sparkles,
  Eye,
  LineChart,
} from 'lucide-react';
import { ROLES } from '@botrade/shared';

const userNavItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/bots', label: 'Bots', icon: Bot },
  { href: '/exchanges', label: 'Exchanges', icon: Building2 },
  { href: '/chart', label: 'Gráfica', icon: LineChart },
];

const adminNavItems = [
  { href: '/admin/users', label: 'Usuarios', icon: Users },
  { href: '/admin/strategies', label: 'Estrategias', icon: Sparkles },
  { href: '/admin/observers', label: 'Observadores', icon: Eye },
  { href: '/admin/settings', label: 'Configuración', icon: Settings },
];

function NavSection({ title, items }: { title: string; items: typeof userNavItems }) {
  const pathname = usePathname();

  return (
    <div className="mb-6">
      <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-white/50">
        {title}
      </p>
      <div className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-white/80 hover:bg-white/10'
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isSuperAdmin, loading } = useAuthRole();

  const handleLogout = async () => {
    await logoutUser();
    router.push('/login');
  };

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-secondary text-secondary-foreground">
      <div className="flex h-16 items-center border-b border-white/10 px-6">
        <span className="text-xl font-bold">botrade</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        <NavSection title="Menú de usuario" items={userNavItems} />

        {isSuperAdmin && <NavSection title="Menú de superadmin" items={adminNavItems} />}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="mb-3 px-2">
          <div className="text-sm font-medium text-white/90">
            {user?.displayName || user?.email || 'Usuario'}
          </div>
          <div className="text-xs text-white/50">{user?.email}</div>
        </div>

        {!loading && (
          <div className="mb-3 px-2">
            {isSuperAdmin ? (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/20 px-2.5 py-1 text-xs font-medium text-primary-foreground">
                <Shield className="h-3 w-3" />
                Superadmin
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/70">
                Usuario
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
