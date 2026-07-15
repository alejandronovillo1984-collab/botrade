import { Card } from '@/components/ui/Button';

export default function AdminUsersPage() {
  return (
    <div className="p-8">
      <h2 className="mb-6 text-xl font-bold text-secondary">Usuarios</h2>
      <Card title="Lista de usuarios">
        <p className="text-sm text-muted-foreground">
          Aquí se mostrarán todos los usuarios registrados con opciones para cambiar roles.
        </p>
      </Card>
    </div>
  );
}
