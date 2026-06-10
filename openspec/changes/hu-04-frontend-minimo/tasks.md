# Tasks: HU-04 — Interfaz Base Interna para Asesora

> **Orden de ejecución:** Fases secuenciales. Dentro de cada fase, tareas en orden de dependencia.
> **Verificación:** Manual exclusivamente. No hay infraestructura de testing en `apps/web`.

---

## Phase 1: Foundation

Infraestructura pura, sin output visual. Todo lo demás depende de esto.

- [x] **T-1.1: Install `server-only` dependency**
  - Add `"server-only": "^0.0.1"` (o versión más reciente) a `apps/web/package.json` → `dependencies`
  - Ejecutar `npm install` en `apps/web/`

- [x] **T-1.2: Create `.env.local`**
  - Archivo: `apps/web/.env.local`
  - Contenido: `API_URL=http://localhost:3001`

- [x] **T-1.3: Create `app/lib/definitions.ts`**
  - Interfaces TypeScript: `LoginResponse`, `User`, `Client`, `MortgageCase`, `CreditType`, `CaseStatus`, `PaginatedResponse<T>`, `ActionState`
  - Seguir las interfaces exactas de design.md § Key Interfaces

- [x] **T-1.4: Create `app/lib/session.ts`**
  - Archivo server-only (`import 'server-only'` en la primera línea)
  - Funciones: `getSession()` → lee cookie `token`, `createSession(token)` → `cookies().set('token', token, {httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production'})`, `deleteSession()` → `cookies().delete('token')`

- [x] **T-1.5: Create `app/lib/api.ts`**
  - Archivo server-only
  - Función `apiFetch(path, init?)`: lee cookie `token` vía `getSession()`, agrega header `Authorization: Bearer <token>`, hace fetch a `${API_URL}${path}`
  - **Método GET:** NO envía `Content-Type` ni `body`. Solo headers de auth.
  - **Método POST:** serializa `body` a JSON (`JSON.stringify`) y setea `Content-Type: application/json`.
  - Manejo de errores: 401 → `deleteSession()` + `redirect('/login?reason=expired')`; 400 → parsea mensajes de campo de NestJS y retorna `{ ok: false, errors: {...} }`; 404 → retorna `{ ok: false, notFound: true }`; 409 → retorna `{ ok: false, errors: {...} }`; 500 → retorna `{ ok: false, errors: { _form: 'Error inesperado...' } }`; network error → retorna `{ ok: false, errors: { _form: 'No se pudo conectar...' } }`
  - Casos exitosos → retorna `{ ok: true, data: ... }`

- [x] **T-1.6: Create `proxy.ts`**
  - Archivo en raíz de `apps/web/` (mismo nivel que `app/`)
  - Regla 1: `request.nextUrl.pathname.startsWith('/dashboard')` sin cookie `token` → `Response.redirect(new URL('/login', request.nextUrl), 307)`
  - Regla 2: `request.nextUrl.pathname === '/login'` con cookie `token` → `Response.redirect(new URL('/dashboard', request.nextUrl), 307)`
  - Resto → `NextResponse.next()`
  - Config `matcher`: `['/dashboard/:path*', '/login']`

---

## Phase 2: Auth

Flujo de autenticación completo.

- [x] **T-2.1: Create `app/actions/auth.ts`**
  - Server Action `login(prevState, formData)`: valida email/password no vacíos, llama `apiFetch('/auth/login', { method: 'POST', body: { email, password } })`, en éxito → `createSession(access_token)` + `redirect('/dashboard')`, en error → retorna `{ errors: { _form: 'Credenciales inválidas' } }`
  - Server Action `logout()`: `deleteSession()` + `redirect('/login')`

- [x] **T-2.2: Modify `app/layout.tsx`**
  - Cambiar `lang="en"` → `lang="es"`
  - Actualizar metadata: `title: 'Análisis Hipotecario'`, `description: 'Sistema de gestión hipotecaria'`

- [x] **T-2.3: Modify `app/page.tsx`**
  - Server Component que verifica `getSession()`
  - Si hay sesión → `redirect('/dashboard')`
  - Si no → muestra landing simple con link a `/login` (o redirige a `/login`)

- [x] **T-2.4: Create `app/login/page.tsx`**
  - Server Component wrapper
  - Verifica `getSession()` → si ya autenticada, `redirect('/dashboard')`
  - Renderiza `<LoginForm />`

- [x] **T-2.5: Create `app/ui/login-form.tsx`**
  - `'use client'`
  - Usa `useActionState` con `login` action
  - Campos: email (type="email"), password (type="password")
  - Muestra errores inline por campo y error general `_form`
  - Botón submit "Iniciar sesión"

---

## Phase 3: Dashboard Shell

Layout principal del dashboard con navegación lateral.

- [x] **T-3.1: Create `app/ui/error-message.tsx`**
   - Server Component reutilizable
   - Props: `message?: string`, `className?: string`
   - Si no hay mensaje → retorna `null`
   - Banner rojo: `bg-red-50`, `border-red-200`, `text-red-700`

- [x] **T-3.2: Create `app/ui/sidebar.tsx`**
   - `'use client'`
   - Usa `usePathname` para resaltar link activo (`pathname.startsWith`)
   - Links: 📊 Dashboard (`/dashboard`), 👥 Clientes (`/dashboard/clientes`), 📁 Expedientes (`/dashboard/expedientes`)
   - Botón "Cerrar sesión" vía `<form action={logout}>`
   - Fixed left sidebar, `w-64`, `h-screen`, `bg-slate-50`, `border-r`

- [x] **T-3.3: Create `app/dashboard/layout.tsx`**
   - Server Component
   - Verifica `getSession()` → si no hay sesión, `redirect('/login')`
   - Layout: `<Sidebar />` fijo a izquierda + `<main className="flex-1 ml-64">` para children
   - Layout envuelve todas las rutas `/dashboard/*`

- [x] **T-3.4: Create `app/dashboard/page.tsx`**
   - Server Component
   - Home del dashboard con cards resumen: Clientes y Expedientes
   - Grid responsive `grid-cols-1 md:grid-cols-2` con hover shadow

---

## Phase 4: Clients

CRUD de clientes (list, create, detail).

- [ ] **T-4.1: Create `app/actions/clients.ts`**
  - Server Action `createClient(prevState, formData)`: recibe firstName, paternalLastName, maternalLastName, rfc, curp, email, phone
  - Llama `apiFetch('/clients', { method: 'POST', body: { ... } })`
  - Éxito (201) → `redirect('/dashboard/clientes')`
  - Error (400/409) → retorna `{ errors: { campo: 'mensaje' } }`

- [ ] **T-4.2: Create `app/dashboard/clientes/page.tsx`**
  - Server Component
  - Lee query params `page` y `limit` (default: page=1, limit=10)
  - Llama `apiFetch('/clients?page=X&limit=Y')`
  - Renderiza tabla con columnas: nombre completo, email, teléfono, RFC, acción "Ver"
  - Si cero resultados → mensaje "No hay clientes registrados"
  - Importa y renderiza `<Pagination />`

- [ ] **T-4.3: Create `app/ui/pagination.tsx`**
  - `'use client'`
  - Props: `currentPage`, `totalPages`, `basePath` (ej. `/dashboard/clientes`)
  - Usa `useRouter` y `useSearchParams` para navegar con `?page=N`
  - Botones: anterior, siguiente, números de página

- [ ] **T-4.4: Create `app/dashboard/clientes/nuevo/page.tsx`**
  - Server Component wrapper
  - Renderiza `<ClientForm />`

- [ ] **T-4.5: Create `app/ui/client-form.tsx`**
  - `'use client'`
  - Usa `useActionState` con `createClient` action
  - Campos: firstName*, paternalLastName*, maternalLastName, rfc, curp, email*, phone* (* = required)
  - Muestra errores inline por campo y error general
  - Botones: "Guardar" y "Cancelar" (redirect al listado)

- [ ] **T-4.6: Create `app/dashboard/clientes/[id]/page.tsx`**
  - Server Component
  - Llama `apiFetch('/clients/${id}')`
  - Si 404 → muestra "Cliente no encontrado" con link de volver
  - Si éxito → muestra datos: nombre completo, RFC, CURP, email, teléfono, createdAt, updatedAt
  - Nota: expedientes vinculados NO se muestran (diferido a HU posterior)

---

## Phase 5: Mortgage Cases

CRUD de expedientes (list, create, detail).

- [ ] **T-5.1: Create `app/actions/mortgage-cases.ts`**
  - Server Action `createCase(prevState, formData)`: recibe clientId, creditTypeId, personType, propertyLocation, requestedAmount, propertyValue, estimatedTermMonths, notes
  - Llama `apiFetch('/mortgage-cases', { method: 'POST', body: { ... } })`
  - Éxito (201) → `redirect('/dashboard/expedientes')`
  - Error → retorna `{ errors: { campo: 'mensaje' } }`

- [ ] **T-5.2: Create `app/dashboard/expedientes/page.tsx`**
  - Server Component
  - Lee query params `page` y `limit`
  - Llama `apiFetch('/mortgage-cases?page=X&limit=Y')`
  - Renderiza tabla con columnas: cliente, tipo crédito, estado, monto, fecha, acción "Ver"
  - Si cero resultados → "No hay expedientes registrados"
  - Importa `<Pagination />`

- [ ] **T-5.3: Create `app/dashboard/expedientes/nuevo/page.tsx`**
  - Server Component wrapper
  - Fetchea `apiFetch('/credit-types')` para obtener opciones del select
  - Pasa creditTypes como prop a `<CaseForm />`

- [ ] **T-5.4: Create `app/ui/case-form.tsx`**
  - `'use client'`
  - Usa `useActionState` con `createCase` action
  - Recibe `creditTypes` como prop para el select
  - Campos: clientId* (input text/uuid), creditTypeId* (select), personType (opcional, valor fijo "SALARIED" — no hay select, MVP solo asalariados), propertyLocation, requestedAmount, propertyValue, estimatedTermMonths, notes
  - Muestra errores inline por campo y error general
  - Botones: "Guardar" y "Cancelar"

- [ ] **T-5.5: Create `app/dashboard/expedientes/[id]/page.tsx`**
  - Server Component
  - Llama `apiFetch('/mortgage-cases/${id}')`
  - Si 404 → "Expediente no encontrado" con link de volver
  - Si éxito → muestra: cliente, asesor, tipo crédito, estado, monto, ubicación, plazo, notas, fechas

---

## Phase 6: Verification (Manual)

> **No automatizar.** Ejecutar manualmente con ambos servidores corriendo.

- [ ] **T-6.1: Start both servers**
  - NestJS backend en `localhost:3001`
  - Next.js frontend en `localhost:3000`

- [ ] **T-6.2: Verify login flow**
  - Credenciales válidas → redirect a `/dashboard`, cookie `token` presente
  - Credenciales inválidas → mensaje "Credenciales inválidas", permanece en `/login`
  - Campos vacíos → errores inline

- [ ] **T-6.3: Verify cookie flags**
  - Browser devtools → Application → Cookies → verificar: `httpOnly` ✓, `SameSite=Lax` ✓, `Path=/` ✓, `Secure` solo en producción

- [ ] **T-6.4: Verify proxy redirects**
  - Sin cookie → acceder a `/dashboard/*` → redirect a `/login`
  - Con cookie → acceder a `/login` → redirect a `/dashboard`

- [ ] **T-6.5: Verify client CRUD**
  - Listado: tabla con datos, paginación funcional
  - Crear: formulario con validación, redirect tras éxito, 409 con RFC/email duplicado
  - Detalle: datos completos, 404 con ID inexistente

- [ ] **T-6.6: Verify case CRUD**
  - Listado: tabla con datos, paginación funcional
  - Crear: formulario con select de credit-types, redirect tras éxito
  - Detalle: datos completos, 404 con ID inexistente

- [ ] **T-6.7: Verify error handling**
  - 400 → errores inline debajo de campos
  - 401 → cookie borrada, redirect a `/login?reason=expired`
  - 404 → página "No encontrado" con link de volver
  - 409 → mensaje inline específico ("RFC ya registrado" / "Email ya registrado")

- [ ] **T-6.8: Verify logout**
  - Click "Cerrar sesión" → cookie `token` eliminada → redirect a `/login`
  - Intentar acceder a `/dashboard` → redirect a `/login`
