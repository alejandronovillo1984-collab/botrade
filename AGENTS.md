# AGENTS.md — botrade

Documentación técnica para agentes de codificación. Incluye arquitectura, convenciones, scripts y flujo de trabajo del proyecto.

---

## 1. Descripción del proyecto

**botrade** es una plataforma web multi-usuario para bots de trading. El foco inicial es el mercado **NASDAQ**, con arquitectura extensible para soportar múltiples exchanges/brokers en el futuro.

Características clave:
- Frontend en **Next.js 15** con App Router.
- Backend en **Firebase Functions v2** (TypeScript).
- Base de datos **Firestore**.
- Autenticación con **Firebase Auth** (email/password + Google).
- Dos roles: `user` y `superadmin`.
- Estrategias predefinidas que observan el mercado y generan señales.
- Dashboard de debug en tiempo real vía Firestore listeners.

---

## 2. Arquitectura

```
botrade/
├── apps/
│   ├── web/                    # Next.js 15 + App Router
│   └── functions/              # Firebase Functions v2
├── packages/
│   └── shared/                 # Tipos, utilidades y validaciones compartidas
├── firebase.json
├── .firebaserc
├── firestore.rules
├── pnpm-workspace.yaml
└── package.json
```

### Flujo de datos
1. El usuario se autentica en el frontend (Next.js + Firebase Auth).
2. Al registrarse, un trigger de Functions crea el documento en `users/{uid}` y asigna el rol.
3. El email `alejandronovillo1984@gmail.com` recibe automáticamente el rol `superadmin`.
4. El frontend escucha cambios en Firestore para mostrar datos en tiempo real.
5. Las estrategias correrán en Firebase Functions (programadas o por eventos) y generarán señales en `signals/`.

---

## 3. Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Monorepo | pnpm workspaces + Turbo |
| Frontend | Next.js 15, React 19, TypeScript |
| Estilos | TailwindCSS 3 |
| UI | Componentes custom básicos (sin shadcn por ahora) |
| Estado | Zustand + TanStack Query |
| Auth | Firebase Auth + custom claims |
| Backend | Firebase Functions v2 (Node.js 22) |
| DB | Firestore |
| Validación | Zod |
| Iconos | lucide-react |

---

## 4. Scripts disponibles

Desde la raíz del proyecto:

```bash
# Desarrollo
pnpm dev:web          # Inicia el frontend Next.js
pnpm dev:functions    # Compila functions en modo watch

# Build
pnpm build            # Compila todos los paquetes
pnpm typecheck        # Typecheck en todos los paquetes
pnpm lint             # Lint en todos los paquetes

# Despliegue
pnpm publicar         # Commit + push a main (App Hosting deploya automáticamente)
pnpm desplegar        # Deploy de Firebase Functions
pnpm deploy:all       # Deploy completo de Firebase

# Emuladores
pnpm emulators        # Inicia emuladores de auth, firestore y functions
```

### Detalle de scripts

- `publicar`: como el frontend está conectado a **Firebase App Hosting** en la rama `main`, publicar el front significa hacer `git push origin main`. El script hace un commit automático con el mensaje `chore: publish web to main` y luego el push. **Revisá los cambios antes de ejecutarlo**.
- `desplegar`: ejecuta `scripts/deploy-functions.sh`, que compila `packages/shared` y `apps/functions`, resuelve la dependencia workspace (`@botrade/shared`) en un directorio temporal y luego ejecuta `firebase deploy --only functions`. Es necesario porque Cloud Functions no entiende el protocolo `workspace:*` de pnpm.
- `deploy:all`: ejecuta `firebase deploy` completo (functions + hosting + firestore rules).

---

## 5. Autenticación y roles

### Roles
- `user`: acceso a dashboard, bots, exchanges, señales y debug.
- `superadmin`: además, acceso al panel `/admin` para gestionar usuarios y configuración global.

### Cómo funciona
- Al registrarse, un usuario recibe rol `user` por defecto.
- El email `alejandronovillo1984@gmail.com` recibe automáticamente `superadmin`.
- El rol se guarda como **custom claim** en Firebase Auth y también en el documento `users/{uid}`.
- Solo un `superadmin` puede cambiar roles de otros usuarios mediante la función `setRole`.

### Protección de rutas
- El `middleware.ts` de Next.js verifica la existencia de la cookie `__session`.
- Las rutas de dashboard y admin requieren autenticación.
- El panel `/admin` también verifica el rol `superadmin`.

---

## 6. Estructura de Firestore

| Colección | Propósito |
|-----------|-----------|
| `users/{uid}` | Perfil, rol y estado del usuario |
| `exchangeAccounts/{id}` | Cuentas de exchange vinculadas (credenciales encriptadas) |
| `bots/{id}` | Configuración de bots por usuario |
| `signals/{id}` | Señales generadas por estrategias |
| `trades/{id}` | Operaciones ejecutadas |
| `logs/{id}` | Logs del sistema y bots |
| `adminConfig/{doc}` | Configuración global para superadmin |
| `adminConfig/apiKeys` | API keys de proveedores externos (ej. `eodhd` para velas OHLC) |
| `adminConfig/marketData` | Configuración del proveedor de mercado (`cacheTtlSeconds`) |
| `adminConfig/aiConfig` | Modelo de IA por defecto (`{ defaultAiModelId: string \| null }`) |
| `aiModels/{id}` | Modelos de IA configurados para análisis (cada uno con su `apiKey`) |

### Seguridad
- Las reglas de Firestore (`firestore.rules`) permiten lectura/escritura solo según el rol y propiedad.
- Las credenciales de exchanges y datos sensibles se escriben **solo desde Firebase Functions**.
- Nunca se exponen secrets en el frontend.

### Proveedor de datos de mercado
- El menú **Gráfica** del dashboard consume velas OHLC del proveedor **EODHD** (EOD Historical Data).
- API key guardada en `adminConfig/apiKeys.eodhd` (configurable desde `/admin/settings`).
- Símbolos actuales: `NDX.INDX` (NASDAQ 100), `GSPC.INDX` (S&P 500).
- Timeframes soportados: `1m`, `5m`, `1h` (intraday) y `1d` (EOD).
- Endpoints consumidos:
  - EOD (`1d`): `GET /api/eod/{symbol}?api_token=...&period=d&from=YYYY-MM-DD&to=YYYY-MM-DD&fmt=json`
  - Intraday (`1m`/`5m`/`1h`): `GET /api/intraday/{symbol}?api_token=...&interval={1m|5m|1h}&from={epoch}&to={epoch}&fmt=json`
- Plan actual: **All World Extended** (pago, $19.99+/mes) — EOD + intraday incluido.
- Limitaciones de ventana por intervalo (EODHD): 1m ≤ 120 días, 5m ≤ 600 días, 1h ≤ 7200 días.
- TTL de cache configurable en `adminConfig/marketData.cacheTtlSeconds` (default 900s = 15 min), editable desde `/admin/settings`.

---

## 7. Variables de entorno

### Frontend (`apps/web/.env.local`)
```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
```

Para App Hosting, las variables están configuradas en `apps/web/apphosting.yaml`.

### Functions
Firebase Functions usa `firebase-admin` con credenciales automáticas del entorno de Google Cloud. No se requiere configuración manual en producción. Para emuladores, usar `GOOGLE_APPLICATION_CREDENTIALS` si es necesario.

---

## 8. Convenciones de código

### TypeScript
- Siempre usar TypeScript estricto.
- Preferir interfaces sobre types para objetos.
- Usar `as const` para constantes enumeradas.

### Importaciones
- Usar el alias `@/` para imports dentro de `apps/web`.
- Usar `@botrade/shared` para tipos compartidos.

### Componentes
- Server Components por defecto.
- Usar `'use client'` solo cuando se necesite interacción o hooks de React.
- Componentes UI básicos en `apps/web/src/components/ui/`.

### Firebase Functions
- Usar Functions v2 (`firebase-functions/v2/*`).
- Región por defecto: `us-central1`.
- Cada función exportada en su propio archivo y re-exportada en `index.ts`.
- Validar inputs con Zod.

### Nombres de archivos
- Componentes: PascalCase (`LoginForm.tsx`)
- Hooks: camelCase con prefijo `use` (`useAuth.ts`)
- Funciones: camelCase (`setRole.ts`)
- Tipos: PascalCase (`User.ts`)

---

## 9. Despliegue

### App Hosting (frontend)
1. Hacer commit de los cambios.
2. Ejecutar `pnpm publicar` o `git push origin main`.
3. App Hosting compila y despliega automáticamente.

### Functions (backend)
1. Ejecutar `pnpm desplegar`.
2. Verificar en Firebase Console > Functions.

### Firestore rules
1. Ejecutar `pnpm deploy:all` o `firebase deploy --only firestore:rules`.

---

## 10. Emuladores locales

Para probar sin tocar producción:

```bash
pnpm emulators
```

Esto inicia emuladores de auth, firestore y functions. El frontend se conecta a los emuladores cambiando las configuraciones en `apps/web/src/lib/firebase.ts` cuando sea necesario.

---

## 11. Roadmap inmediato

1. ✅ Estructura del monorepo
2. ✅ Autenticación y roles
3. ✅ Panel de superadmin vacío
4. ⬜ Configurar emuladores y probar login
5. ⬜ Implementar gestión de cuentas de exchange
6. ⬜ Implementar CRUD de bots
7. ⬜ Implementar estrategias predefinidas y señales
8. ⬜ Dashboard de debug con Firestore listeners
9. ⬜ Integrar con exchange/broker de NASDAQ

---

## 12. Notas de seguridad

- El archivo `keygit` y `firebase_config` están en `.gitignore` y **no deben subirse**.
- Las credenciales de exchange deben encriptarse en Functions antes de guardarse en Firestore.
- El token de GitHub (`keygit`) se usa solo para autenticación local; no debe aparecer en commits.
- Si el token se expone accidentalmente, rotarlo inmediatamente.

---

## 13. Contacto y decisiones

- Proyecto Firebase: `botrade-d0517`
- Superadmin inicial: `alejandronovillo1984@gmail.com`
- Repositorio: `https://github.com/alejandronovillo1984-collab/botrade.git`
- Región: `us-central1`
