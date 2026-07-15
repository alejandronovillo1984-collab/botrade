import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Button';

export default function DashboardPage() {
  return (
    <DashboardLayout>
      <Header title="Dashboard" subtitle="Resumen general de tu actividad" />
      <div className="p-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card title="Bots activos">
            <p className="text-3xl font-bold text-secondary">0</p>
            <p className="text-sm text-muted-foreground">No tenés bots configurados todavía.</p>
          </Card>
          <Card title="Cuentas de exchange">
            <p className="text-3xl font-bold text-secondary">0</p>
            <p className="text-sm text-muted-foreground">Vinculá tu exchange para empezar.</p>
          </Card>
          <Card title="Señales hoy">
            <p className="text-3xl font-bold text-secondary">0</p>
            <p className="text-sm text-muted-foreground">Sin señales generadas hoy.</p>
          </Card>
        </div>

        <div className="mt-8">
          <Card title="Próximos pasos">
            <ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">
              <li>Vinculá una cuenta de exchange en la sección Exchanges.</li>
              <li>Creá tu primer bot en la sección Bots.</li>
              <li>Activá una estrategia predefinida.</li>
              <li>Monitoreá las señales en el panel Debug.</li>
            </ol>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
