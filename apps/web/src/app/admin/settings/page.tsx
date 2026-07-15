import { Card } from '@/components/ui/Button';

export default function AdminSettingsPage() {
  return (
    <div className="p-8">
      <h2 className="mb-6 text-xl font-bold text-secondary">Configuración global</h2>
      <Card title="Parámetros del sistema">
        <p className="text-sm text-muted-foreground">
          Configuración general del bot y exchanges soportados.
        </p>
      </Card>
    </div>
  );
}
