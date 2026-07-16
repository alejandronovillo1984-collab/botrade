import { LoginForm } from '@/components/auth/LoginForm';
import Image from 'next/image';

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center">
          <Image
            src="/logobotradig.jpg"
            alt="botrade logo"
            width={498}
            height={182}
            className="mb-4 rounded-lg object-contain"
            priority
          />
          <h1 className="text-center text-2xl font-bold text-secondary">botrade</h1>
          <p className="text-center text-sm text-muted-foreground">
            Iniciá sesión para acceder a tu panel
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
