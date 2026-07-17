export const dynamic = 'force-dynamic';

import { RegisterForm } from '@/components/auth/RegisterForm';
import Image from 'next/image';

export default function RegisterPage() {
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
        </div>
        <RegisterForm />
      </div>
    </main>
  );
}