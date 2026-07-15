'use client';

import { auth } from '@/lib/firebase';
import { logoutUser } from '@/lib/auth';
import { useUser } from '@/lib/hooks/useUser';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Bot,
  Building2,
  Bell,
  Bug,
  Settings,
  Users,
  LogOut,
  Shield,
} from 'lucide-react';
import { ROLES } from '@botrade/shared';

const userNavItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/bots', label: 'Bots', icon: Bot },
  { href: '/exchanges', label: 'Exchanges', icon: Building2 },
  { href: '/signals', label: 'Señales', icon: Bell },
  { href: '/debug', label: 'Debug', icon: Bug },
];

const adminNavItems = [
  { href: '/admin', label: 'Admin', icon: Shield },
  { href: '/admin/users', label: 'Usuarios', icon: Users },
  { href: '/admin/settings', label: 'Configuración', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser(auth.currentUser?.uid);

  const isSuperAdmin = user?.role === ROLES.SUPERADMIN;

  const handleLogout = async () => {
    await logoutUser();
    router.push('/login');
  };

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-secondary text-secondary-foreground">
      <div className="flex h-16 items-center border-b border-white/10 px-6">
        <span className="text-xl font-bold">botrade</span>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        <p className="mb-2 px-2 text-xs font-semibold uppercase text-white/50">Usuario</p>
        {userNavItems.map((item) => {
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

        {isSuperAdmin && (
          <>
            <p className="mb-2 mt-6 px-2 text-xs font-semibold uppercase text-white/50">
              Superadmin
            </p>
            {adminNavItems.map((item) => {
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
          </>
        )}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="mb-3 px-2 text-sm text-white/70">
          {user?.email || auth.currentUser?.email || 'Usuario'}
        </div>
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
