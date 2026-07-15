# botrade

Plataforma web multi-usuario para bots de trading, con foco inicial en NASDAQ.

## Stack

- **Frontend:** Next.js 15 + React 19 + TypeScript + TailwindCSS
- **Backend:** Firebase Functions v2 (TypeScript)
- **Base de datos:** Firestore
- **Auth:** Firebase Auth (email/password + Google)
- **Monorepo:** pnpm workspaces + Turbo

## Roles

- `user`: acceso a dashboard, bots, exchanges, señales y debug.
- `superadmin`: acceso adicional al panel `/admin` para gestión de usuarios y configuración global.

El email `alejandronovillo1984@gmail.com` recibe automáticamente el rol de `superadmin` al registrarse.

## Scripts

```bash
pnpm dev:web          # Inicia el frontend
pnpm dev:functions    # Compila functions en modo watch
pnpm build            # Build de todo el monorepo
pnpm publicar         # Commit + push a main (App Hosting deploya automáticamente)
pnpm desplegar        # Deploy de Firebase Functions
pnpm emulators        # Inicia emuladores locales
```

## Estructura

```
botrade/
├── apps/
│   ├── web/            # Next.js 15 + App Router
│   └── functions/      # Firebase Functions v2
├── packages/
│   └── shared/         # Tipos y utilidades compartidas
├── firebase.json
├── firestore.rules
└── AGENTS.md
```

## Documentación

Ver `AGENTS.md` para detalles técnicos, convenciones y flujo de trabajo.

## Estado actual

Cascarón inicial con autenticación, roles y estructura de navegación lista. Próximos pasos: gestión de exchanges, CRUD de bots y estrategias predefinidas.
