# Spec: Interfaz Base Interna para Asesora (HU-04)

## Purpose

Frontend web UI mínima para que la asesora gestione clientes y expedientes hipotecarios desde el navegador. Autenticación vía JWT en cookie httpOnly, Server Components para fetching, Client Components solo para formularios interactivos.

> **Convención de rutas:** Las rutas frontend usan español (`/dashboard/clientes`, `/dashboard/expedientes`). Los endpoints del backend se mantienen en inglés (`/clients`, `/mortgage-cases`). El mapeo ocurre dentro de `apiFetch` y las Server Actions; las URLs del navegador nunca exponen endpoints del backend.

## Capabilities

| Capability | Type | Description |
|---|---|---|
| `frontend-auth` | New | Login, logout y gestión de sesión JWT en httpOnly cookie |
| `frontend-clients` | New | Listado, alta y detalle de clientes desde UI |
| `frontend-mortgage-cases` | New | Listado, alta y detalle de expedientes desde UI |
| `frontend-proxy` | New | Redirección de rutas protegidas en Next.js |

---

## 1. Requirements

### Functional

| ID | Requirement |
|----|-------------|
| FR-01 | La asesora MUST poder iniciar sesión con email y contraseña desde `/login` |
| FR-02 | El sistema MUST almacenar el JWT como cookie httpOnly `token` al iniciar sesión |
| FR-03 | El sistema MUST redirigir a `/login` si no hay cookie `token` en rutas `/dashboard/*` |
| FR-04 | El sistema MUST redirigir a `/dashboard` si hay cookie `token` al acceder a `/login` |
| FR-05 | La asesora MUST poder cerrar sesión (borrar cookie y redirigir a `/login`) |
| FR-06 | La asesora MUST ver listado paginado de clientes en `/dashboard/clientes` |
| FR-07 | La asesora MUST poder crear un cliente desde `/dashboard/clientes/nuevo` |
| FR-08 | La asesora MUST ver detalle de un cliente en `/dashboard/clientes/[id]` (datos básicos: nombre, RFC, CURP, email, teléfono, fechas). Expedientes vinculados diferidos a HU posterior. |
| FR-09 | La asesora MUST ver listado paginado de expedientes en `/dashboard/expedientes` |
| FR-10 | La asesora MUST poder crear un expediente desde `/dashboard/expedientes/nuevo` |
| FR-11 | La asesora MUST ver detalle de expediente en `/dashboard/expedientes/[id]` |
| FR-12 | El sistema MUST mostrar errores de validación (400) al usuario. Si el backend devuelve un campo específico en `message`, se muestra error inline debajo del campo correspondiente. Si no, se muestra un mensaje general del formulario. |
| FR-13 | El sistema MUST redirigir a `/login` y borrar cookie ante cualquier respuesta 401 del backend |
| FR-14 | El sistema MUST mostrar "No encontrado" ante 404 en páginas de detalle |
| FR-15 | El sistema MUST mostrar mensaje específico ante 409 ("RFC ya registrado" / "Email ya registrado") |
| FR-16 | La asesora MUST poder navegar entre módulos desde una barra lateral en el dashboard |

### Non-Functional

| ID | Requirement |
|----|-------------|
| NFR-01 | El proxy (`proxy.ts`, reemplaza al deprecado `middleware.ts` en Next.js 16) MUST evaluar la cookie `token` server-side antes de servir rutas `/dashboard/*`. No debe depender de redirecciones client-side. |
| NFR-02 | Toda llamada a API desde Server Components/Actions MUST incluir `Authorization: Bearer <token>` |
| NFR-03 | La cookie `token` MUST ser httpOnly, SameSite=Lax, Path=/. `Secure` solo en producción (`NODE_ENV=production`). En desarrollo local debe funcionar sobre `localhost` sin HTTPS. |
| NFR-04 | Ante JWT expirado (401), el frontend SHOULD borrar la cookie y redirigir consistentemente |
| NFR-05 | Las páginas de listado MUST aceptar query params `page` y `limit` para paginación |

---

## 2. Scenarios

### FR-01: Login con email y contraseña

- **GIVEN** credenciales válidas → **WHEN** envía formulario en `/login` → **THEN** `POST /auth/login` retorna `access_token`, se guarda cookie `token`, redirige a `/dashboard`
- **GIVEN** credenciales inválidas → **WHEN** envía formulario → **THEN** se muestra "Credenciales inválidas", permanece en `/login`
- **GIVEN** email vacío → **WHEN** intenta enviar → **THEN** error inline "El email es obligatorio"
- **GIVEN** contraseña vacía → **WHEN** intenta enviar → **THEN** error inline "La contraseña es obligatoria"
- **GIVEN** contraseña < 6 caracteres → **WHEN** envía → **THEN** error inline del backend

### FR-02: Cookie JWT httpOnly

- **GIVEN** login exitoso → **WHEN** Server Action recibe `access_token` → **THEN** cookie `token` seteada con flags: httpOnly, Secure (prod), SameSite=Lax, Path=/
- **GIVEN** sesión activa → **WHEN** inspecciona `document.cookie` en browser → **THEN** cookie `token` no es accesible desde JavaScript

### FR-03: Redirección no autenticados

- **GIVEN** usuario sin cookie `token` → **WHEN** accede a cualquier `/dashboard/*` → **THEN** proxy redirige a `/login`
- **GIVEN** cookie con JWT expirado → **WHEN** `apiFetch` recibe 401 del backend → **THEN** borra cookie, redirige a `/login` con mensaje "Sesión expirada"

### FR-04: Redirección desde /login con sesión activa

- **GIVEN** cookie `token` presente y válida → **WHEN** accede a `/login` → **THEN** proxy redirige a `/dashboard`

### FR-05: Cierre de sesión

- **GIVEN** asesora autenticada → **WHEN** hace clic en "Cerrar sesión" → **THEN** cookie `token` eliminada, redirige a `/login`

### FR-06: Listado de clientes

- **GIVEN** clientes registrados → **WHEN** accede a `/dashboard/clientes` → **THEN** tabla muestra: nombre completo, email, teléfono, RFC, acción "Ver"
- **GIVEN** más de 10 clientes → **WHEN** navega a página 2 → **THEN** `GET /clients?page=2&limit=10`, muestra segunda página
- **GIVEN** cero clientes → **WHEN** accede al listado → **THEN** mensaje "No hay clientes registrados"

### FR-07: Alta de cliente

- **GIVEN** campos obligatorios completos (firstName, paternalLastName, email, phone) → **WHEN** envía formulario → **THEN** `POST /clients`, redirige a listado con confirmación
- **GIVEN** RFC o email duplicado → **WHEN** envía → **THEN** 409, mensaje específico inline
- **GIVEN** email con formato inválido → **WHEN** envía → **THEN** 400, error inline "Debe ser un email válido"
- **GIVEN** RFC mal formado → **WHEN** envía → **THEN** 400, error inline "RFC debe tener un formato válido"

### FR-08: Detalle de cliente

- **GIVEN** cliente con id `abc-123` → **WHEN** accede a `/dashboard/clientes/abc-123` → **THEN** muestra nombre completo, RFC, CURP, email, teléfono, fechas de creación/actualización. Expedientes vinculados quedan diferidos (no se consultan en HU-04).
- **GIVEN** id inexistente → **WHEN** accede → **THEN** 404, muestra "Cliente no encontrado"

### FR-09: Listado de expedientes

- **GIVEN** expedientes registrados → **WHEN** accede a `/dashboard/expedientes` → **THEN** tabla con cliente, tipo crédito, estado, monto, fecha, acción "Ver"
- **GIVEN** más de 10 expedientes → **WHEN** navega página 2 → **THEN** `GET /mortgage-cases?page=2&limit=10`
- **GIVEN** cero expedientes → **WHEN** accede → **THEN** "No hay expedientes registrados"

### FR-10: Alta de expediente

- **GIVEN** clientId válido y creditTypeId seleccionado → **WHEN** envía en `/dashboard/expedientes/nuevo` → **THEN** `POST /mortgage-cases`, redirige a listado
- **GIVEN** clientId inexistente → **WHEN** envía → **THEN** 404 backend, mensaje "Cliente no encontrado" inline
- **GIVEN** creditTypeId no seleccionado → **WHEN** envía → **THEN** 400, error inline

### FR-11: Detalle de expediente

- **GIVEN** expediente existente → **WHEN** accede a `/dashboard/expedientes/:id` → **THEN** muestra cliente, asesor, tipo crédito, estado, monto, ubicación, plazo, notas
- **GIVEN** id inexistente → **WHEN** accede → **THEN** 404, "Expediente no encontrado"

### FR-12 a FR-15: Manejo de errores — ver Sección 5

### FR-16: Navegación entre módulos

- **GIVEN** asesora en `/dashboard` → **WHEN** hace clic en "Clientes" en la barra lateral → **THEN** navega a `/dashboard/clientes`
- **GIVEN** asesora en cualquier página del dashboard → **WHEN** hace clic en "Dashboard" → **THEN** vuelve a `/dashboard`

---

## 3. API Contracts (Frontend Perspective)

| Página / Acción | Método | Endpoint | Request | Respuesta Esperada |
|---|---|---|---|---|
| `/login` submit | POST | `/auth/login` | `{ email, password }` | `{ access_token, user: { id, email, name, role } }` |
| Logout | — | (local) | — | Borra cookie, redirect `/login` |
| Listado clientes | GET | `/clients?page=&limit=` | — | `{ data: Client[], meta: { page, limit, total } }` |
| Crear cliente | POST | `/clients` | `{ firstName, paternalLastName, maternalLastName?, rfc?, curp?, email, phone }` | `Client` (201) |
| Detalle cliente | GET | `/clients/:id` | — | `Client` (datos básicos: id, firstName, paternalLastName, maternalLastName, fullName, rfc, curp, email, phone, createdAt, updatedAt) |
| Listado expedientes | GET | `/mortgage-cases?page=&limit=` | — | `{ data: MortgageCase[], meta }` |
| Crear expediente | POST | `/mortgage-cases` | `{ clientId, creditTypeId, personType?, propertyLocation?, requestedAmount?, propertyValue?, estimatedTermMonths?, notes? }` | `MortgageCase` (201) |
| Detalle expediente | GET | `/mortgage-cases/:id` | — | `MortgageCase` con `client`, `advisor`, `creditType`, `status` |
| Tipos de crédito | GET | `/credit-types` | — | `{ data: { id, code, name }[] }` |
| Estados de expediente | GET | `/case-statuses` | — | `{ data: { id, code, name, order }[] }` |

**Auth header:** `apiFetch()` lee cookie `token` y agrega `Authorization: Bearer <token>` en cada request. Solo corre en server-side (`server-only`).

---

## 4. Route Design

| Ruta | Auth | Comportamiento |
|---|---|---|
| `/` | Opcional | Redirige a `/dashboard` si hay cookie; sino landing |
| `/login` | Pública | Formulario login; redirige a `/dashboard` si autenticada |
| `/dashboard` | Requerida | Layout con sidebar + resumen de módulos |
| `/dashboard/clientes` | Requerida | Tabla paginada |
| `/dashboard/clientes/nuevo` | Requerida | Formulario alta cliente |
| `/dashboard/clientes/[id]` | Requerida | Detalle read-only |
| `/dashboard/expedientes` | Requerida | Tabla paginada |
| `/dashboard/expedientes/nuevo` | Requerida | Formulario con selectores de catálogo |
| `/dashboard/expedientes/[id]` | Requerida | Detalle read-only |

**Proxy rules (`proxy.ts`):**
- `startsWith('/dashboard')` sin cookie `token` → 307 `/login`
- `/login` con cookie `token` → 307 `/dashboard`
- Archivo `proxy.ts` en raíz de `apps/web` (mismo nivel que `app/`). `middleware.ts` está deprecado en Next.js 16.

---

## 5. Error Handling

| Código | Origen | UX |
|---|---|---|
| **400** | Backend validation | Si el `message` incluye nombre de campo (ej. `["firstName should not be empty"]`), error inline debajo del campo. Si no, mensaje general del formulario. |
| **401** | Token inválido/expirado | Borrar cookie `token`, redirect `/login?reason=expired`, toast "Sesión expirada" |
| **404** | Recurso no encontrado | Página centrada con mensaje "Cliente no encontrado" / "Expediente no encontrado" + link volver |
| **409** | Conflicto (unique constraint) | Mensaje inline específico: "RFC ya registrado" o "Email ya registrado" |
| **500** | Error interno servidor | Banner/toast genérico: "Error inesperado. Intente nuevamente." |
| **Network** | Fetch falla (sin respuesta) | Mensaje: "No se pudo conectar con el servidor" |
