import { Card } from '@/components/ui/Button';

export default function AdminPage() {
  return (
    <div className="p-8">
      <h2 className="mb-6 text-xl font-bold text-secondary">Administración</h2>
      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Usuarios">
          <p className="text-sm text-muted-foreground">
            Gestiona usuarios y roles desde la sección Usuarios.
          </p>
        </Card>
        <Card title="Configuración global">
          <p className="text-sm text-muted-foreground">
            Ajusta parámetros globales del sistema.
          </p>
        </Card>
      </div>
    </div>
  );
}
