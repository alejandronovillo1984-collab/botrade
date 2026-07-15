import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'botrade - Bot de Trading',
  description: 'Plataforma multi-usuario de bots de trading para NASDAQ',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
