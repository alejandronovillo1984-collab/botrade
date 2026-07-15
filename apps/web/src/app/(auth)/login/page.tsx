import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-center text-2xl font-bold text-secondary">botrade</h1>
        <p className="mb-6 text-center text-sm text-muted-foreground">
          Iniciá sesión para acceder a tu panel
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
