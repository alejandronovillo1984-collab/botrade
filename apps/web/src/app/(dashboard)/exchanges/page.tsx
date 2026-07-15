import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Header } from '@/components/layout/Header';
import { Card, Button } from '@/components/ui/Button';

export default function ExchangesPage() {
  return (
    <DashboardLayout>
      <Header title="Exchanges" subtitle="Cuentas de exchange vinculadas" />
      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Agregá las credenciales de tus exchanges.</p>
          <Button disabled>Agregar exchange</Button>
        </div>
        <Card title="Cuentas vinculadas">
          <p className="text-sm text-muted-foreground">No hay exchanges vinculados.</p>
        </Card>
      </div>
    </DashboardLayout>
  );
}
