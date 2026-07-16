import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Verificación básica de sesión en servidor.
  // El middleware ya protege por rol, pero reforzamos aquí.
  const cookieStore = await cookies();
  const session = cookieStore.get('__session')?.value;

  if (!session) {
    redirect('/login');
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
