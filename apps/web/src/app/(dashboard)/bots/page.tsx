export const dynamic = 'force-dynamic';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Header } from '@/components/layout/Header';
import { Card, Button } from '@/components/ui/Button';

export default function BotsPage() {
  return (
    <DashboardLayout>
      <Header title="Bots" subtitle="Gestión de estrategias automatizadas" />
      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Configurá y activá tus bots de trading.</p>
          <Button disabled>Crear bot</Button>
        </div>
        <Card title="Tus bots">
          <p className="text-sm text-muted-foreground">No hay bots configurados.</p>
        </Card>
      </div>
    </DashboardLayout>
  );
}
