import { redirect } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { cookies } from 'next/headers';

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

  return (
    <div className="min-h-screen bg-muted">
      <div className="border-b border-border bg-secondary px-8 py-4 text-secondary-foreground">
        <h1 className="text-lg font-bold">Panel de Superadmin</h1>
      </div>
      <main>{children}</main>
    </div>
  );
}
