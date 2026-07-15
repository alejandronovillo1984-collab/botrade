import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Button';

export default function SignalsPage() {
  return (
    <DashboardLayout>
      <Header title="Señales" subtitle="Señales generadas por las estrategias" />
      <div className="p-8">
        <Card title="Historial de señales">
          <p className="text-sm text-muted-foreground">No hay señales registradas.</p>
        </Card>
      </div>
    </DashboardLayout>
  );
}
