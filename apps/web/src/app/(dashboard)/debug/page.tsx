export const dynamic = 'force-dynamic';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Button';

export default function DebugPage() {
  return (
    <DashboardLayout>
      <Header title="Debug" subtitle="Panel de depuración en tiempo real" />
      <div className="p-8">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Logs del sistema">
            <div className="h-64 rounded-md bg-black p-4 font-mono text-xs text-green-400">
              <p>// Logs en tiempo real</p>
              <p>// Aquí aparecerán los logs de las estrategias y bots</p>
            </div>
          </Card>
          <Card title="Últimas operaciones">
            <p className="text-sm text-muted-foreground">No hay operaciones registradas.</p>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
