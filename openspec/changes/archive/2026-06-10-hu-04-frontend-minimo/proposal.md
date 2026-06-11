# Proposal: Interfaz Base Interna para Asesora

## Intent

La asesora actualmente depende exclusivamente de Postman para interactuar con el backend. Esta entrega construye la interfaz web interna mínima que le permite iniciar sesión, consultar clientes y expedientes, y crear ambos desde el navegador, validando el flujo base del sistema sin herramientas externas.

## Scope

### In Scope
- Página de login (`/login`) con autenticación contra NestJS
- Dashboard base (`/dashboard`) con navegación a módulos
- Listado de clientes (`/dashboard/clientes`) con paginación
- Formulario de alta de cliente (`/dashboard/clientes/nuevo`)
- Listado de expedientes (`/dashboard/expedientes`) con paginación
- Formulario de alta de expediente (`/dashboard/expedientes/nuevo`)
- Detalle básico de cliente y expediente (vista read-only)
- Cierre de sesión (logout)
- Sesión vía JWT en httpOnly cookie gestionada desde Next.js
- Proxy de rutas para redirección de no autenticados

### Out of Scope
- Carga de documentos, Google Cloud Storage, OCR, Gemini
- Cálculos financieros, reportes, diseño visual avanzado
- Roles avanzados, refresh tokens
- Modificaciones al backend (salvo bugs bloqueantes)
- Nuevos endpoints de API, cambios en schema Prisma
- Edición de clientes o expedientes (solo alta y lectura)
- Eliminaciones

## Capabilities

### New Capabilities
- `frontend-auth`: Login, logout y gestión de sesión JWT en httpOnly cookie
- `frontend-clients`: Listado, alta y detalle de clientes desde UI
- `frontend-mortgage-cases`: Listado, alta y detalle de expedientes desde UI
- `frontend-proxy`: Redirección optimista de rutas protegidas en Next.js

### Modified Capabilities
- None

## Approach

- **Auth**: Server Action llama `POST /auth/login`, recibe `access_token`, lo guarda en httpOnly cookie `token`. Server Components y Server Actions leen la cookie y la reenvían como `Authorization: Bearer <token>`.
- **Data**: Server Components para fetching, Client Components (`'use client'`) solo para formularios y navegación interactiva.
- **API**: Wrapper `apiFetch` en `app/lib/api.ts` (server-only) que inyecta el header Bearer automáticamente.
- **Proxy**: `proxy.ts` en raíz de `apps/web` redirige `/login` → `/dashboard` si hay cookie, y rutas protegidas → `/login` si no hay cookie.
- **401**: Cualquier 401 del backend dispara `deleteSession()` y redirección a `/login`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web/app/login/page.tsx` | New | Página de login |
| `apps/web/app/dashboard/page.tsx` | New | Dashboard base |
| `apps/web/app/dashboard/clientes/page.tsx` | New | Listado clientes |
| `apps/web/app/dashboard/clientes/nuevo/page.tsx` | New | Alta cliente |
| `apps/web/app/dashboard/clientes/[id]/page.tsx` | New | Detalle cliente |
| `apps/web/app/dashboard/expedientes/page.tsx` | New | Listado expedientes |
| `apps/web/app/dashboard/expedientes/nuevo/page.tsx` | New | Alta expediente |
| `apps/web/app/dashboard/expedientes/[id]/page.tsx` | New | Detalle expediente |
| `apps/web/app/ui/` | New | Formularios, navegación, loaders (Client Components) |
| `apps/web/app/lib/api.ts` | New | Wrapper server-only para API NestJS |
| `apps/web/app/lib/session.ts` | New | Helpers de cookie (getSession, createSession, deleteSession) |
| `apps/web/app/lib/definitions.ts` | New | Tipos compartidos |
| `apps/web/app/actions/` | New | Server Actions (auth, clients, cases) |
| `apps/web/proxy.ts` | New | Protección de rutas |
| `apps/web/.env.local` | New | `API_URL` |
| `apps/web/package.json` | Modified | Agregar `server-only` |
| `apps/web/app/layout.tsx` | Modified | Envolver con nav para rutas autenticadas |
| `apps/web/app/page.tsx` | Modified | Redirigir a `/dashboard` si hay sesión |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| JWT en cookie sin encriptar (payload base64 legible) | Med | Aceptable para herramienta interna; encriptar con `jose` en iteración posterior |
| Expiración de JWT (8h) sin refresh tokens | Med | Capturar 401, borrar cookie y redirigir a `/login` |
| Auth check solo en proxy (no en leaf components) | Med | Verificar token en toda función de fetching (`apiFetch`) |
| CORS en desarrollo (puertos separados) | Baja | Backend ya tiene CORS configurado para `localhost:3000` |

## Rollback Plan

1. Revertir commit de la rama `feature/hu-04`.
2. Si la rama ya fue mergeada a `main`, revertir el merge commit.
3. Si no hay commit disponible, eliminar los directorios nuevos (`app/dashboard`, `app/ui`, `app/lib`, `app/actions`, `proxy.ts`) y restaurar `layout.tsx` y `page.tsx` a su estado inicial.

## Dependencies

- Backend NestJS corriendo en `localhost:3001` con JWT activo
- PostgreSQL con seed data: al menos un usuario asesora, tipos de crédito y estados de expediente
- `API_URL` configurado en `apps/web/.env.local`

## Success Criteria

- [ ] La asesora puede iniciar sesión desde `/login` y llegar a `/dashboard`
- [ ] Puede ver el listado paginado de clientes en `/dashboard/clientes`
- [ ] Puede crear un cliente desde `/dashboard/clientes/nuevo` y verlo reflejado en el listado
- [ ] Puede ver el listado paginado de expedientes en `/dashboard/expedientes`
- [ ] Puede crear un expediente desde `/dashboard/expedientes/nuevo` vinculado a un cliente existente
- [ ] Puede ver detalle de cliente y expediente
- [ ] Puede cerrar sesión y es redirigida a `/login`
- [ ] Todo el flujo se valida desde el navegador sin usar Postman
