# Design: Interfaz Base Interna para Asesora (HU-04)

## Technical Approach

Cookie-based JWT flow through Next.js 16.2.7 App Router. Server Actions for mutations (login, create), Server Components for data fetching. `proxy.ts` for optimistic route guards (verified: Next.js 16.2.7 supports `proxy.ts` — `middleware.ts` is deprecated in this version). `apiFetch()` server-only wrapper reads `token` cookie and forwards `Authorization: Bearer <token>` to NestJS at `localhost:3001`. Client Components (`'use client'`) only for forms and interactive nav — everything else stays server-rendered.

```
Browser ──→ Next.js App Router (apps/web) ──→ NestJS API (:3001) ──→ PostgreSQL
  │                    │
  │  httpOnly cookie   │  Bearer token
  │  "token"           │  via apiFetch()
  └────────────────────┘
```

## Architecture Decisions

| Decision | Options | Tradeoff | Choice |
|----------|---------|----------|--------|
| JWT storage | **cookie httpOnly** vs localStorage | Cookie: immune to XSS, invisible to JS. localStorage: simpler dev, but vulnerable to XSS. Phase 1 = internal tool, cookie wins on security posture. | httpOnly cookie |
| API caller location | **server-only apiFetch** vs client fetch | Server-only: token never reaches browser JS, cookie read only on server. Client fetch: would expose token to JS or need httpOnly anyway. Server-only aligns with Server Component default. | server-only apiFetch |
| Route guard | **proxy.ts** vs per-page auth check | proxy.ts: optimistic, catches unauthorized at edge. Per-page: more granular but repetitive. proxy.ts covers 90% of cases; apiFetch handles the 401 edge case for expired tokens mid-session. Both needed. | proxy.ts + apiFetch 401 handling |
| State management | **None** vs Zustand/Redux | No client-side global state needed for Phase 1. Form state = React `useActionState`. Session = cookie (server). List data = Server Component props. Adding a lib now = premature abstraction. | None |
| Data fetching | **Server Component fetch** vs React Query/SWR | Server Components render server-side with direct fetch. React Query adds client-side caching/stale management that's unnecessary when data is rendered server-side on every navigation. Phase 2 may add it for polling/real-time. | Server Component fetch |
| Form validation | **Backend-only** vs Zod client-side | Backend class-validator already catches all errors with Spanish messages. Duplicating validation client-side adds maintenance burden. Render backend errors inline via `useActionState`. | Backend validation only |

## Data Flow

### Login
```
User → LoginForm ('use client') → Server Action login() → POST /auth/login
  ← 200 {access_token, user}
  → cookies().set('token', access_token, {httpOnly, SameSite=Lax, Path=/, Secure in prod})
  → redirect('/dashboard')
```

### Authenticated Data Fetch
```
DashboardPage (Server) → apiFetch('/clients') → cookies().get('token')
  → fetch(API_URL + '/clients', {headers: {Authorization: 'Bearer ' + token}})
  ← 200 {data: Client[], meta}
  → render table
  ← 401 → deleteSession() → redirect('/login?reason=expired')
```

### Create
```
ClientForm ('use client') → useActionState(createClient) → POST /clients via apiFetch
  ← 201 → redirect('/dashboard/clientes')
  ← 400 → return {errors: {field: 'message'}} to form inline
  ← 409 → return {errors: {rfc: 'RFC ya registrado'}} inline
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/web/proxy.ts` | Create | Route guard: dashboard/* → login if no token; /login → dashboard if token |
| `apps/web/app/layout.tsx` | Modify | Change lang to "es", update metadata |
| `apps/web/app/page.tsx` | Modify | Redirect logic: if token → dashboard, else landing |
| `apps/web/app/login/page.tsx` | Create | Login page (Server wrapper for Client Form) |
| `apps/web/app/dashboard/layout.tsx` | Create | Dashboard layout + Sidebar |
| `apps/web/app/dashboard/page.tsx` | Create | Dashboard home |
| `apps/web/app/dashboard/clientes/page.tsx` | Create | Client list (Server, paginated) |
| `apps/web/app/dashboard/clientes/nuevo/page.tsx` | Create | Create client (Server wrapper) |
| `apps/web/app/dashboard/clientes/[id]/page.tsx` | Create | Client detail (Server, read-only) |
| `apps/web/app/dashboard/expedientes/page.tsx` | Create | Case list (Server, paginated) |
| `apps/web/app/dashboard/expedientes/nuevo/page.tsx` | Create | Create case (Server wrapper) |
| `apps/web/app/dashboard/expedientes/[id]/page.tsx` | Create | Case detail (Server, read-only) |
| `apps/web/app/ui/sidebar.tsx` | Create | Sidebar nav ('use client' for active link) |
| `apps/web/app/ui/login-form.tsx` | Create | Login form ('use client', useActionState) |
| `apps/web/app/ui/client-form.tsx` | Create | Client create form ('use client') |
| `apps/web/app/ui/case-form.tsx` | Create | Case create form ('use client') |
| `apps/web/app/ui/pagination.tsx` | Create | Pagination controls ('use client') |
| `apps/web/app/ui/error-message.tsx` | Create | Error display component |
| `apps/web/app/lib/api.ts` | Create | apiFetch (server-only, auto-Bearer) |
| `apps/web/app/lib/session.ts` | Create | getSession, createSession, deleteSession (server-only) |
| `apps/web/app/lib/definitions.ts` | Create | TypeScript interfaces |
| `apps/web/app/actions/auth.ts` | Create | login, logout Server Actions |
| `apps/web/app/actions/clients.ts` | Create | createClient Server Action |
| `apps/web/app/actions/cases.ts` | Create | createCase Server Action |
| `apps/web/.env.local` | Create | API_URL=http://localhost:3001 |
| `apps/web/package.json` | Modify | Add `server-only` dependency |

## Key Interfaces

```typescript
// definitions.ts
interface LoginResponse { access_token: string; user: { id: string; email: string; name: string; role: string } }
interface Client { id: string; firstName: string; paternalLastName: string; maternalLastName?: string; fullName: string; rfc?: string; curp?: string; email: string; phone: string; createdAt: string; updatedAt: string }
interface MortgageCase { id: string; clientId: string; client: { fullName: string }; advisor: { name: string }; creditType: { code: string; name: string }; status: { code: string; name: string }; personType: string; propertyLocation?: string; requestedAmount?: number; propertyValue?: number; estimatedTermMonths?: number; notes?: string; createdAt: string; updatedAt: string }
interface PaginatedResponse<T> { data: T[]; meta: { total: number; page: number; limit: number } }
interface ActionState { errors?: Record<string, string>; success?: boolean; redirect?: string }
```

## Components: Server vs Client

**Server Components (default, no directive):**
`layout.tsx`, `page.tsx` (all pages), `error-message.tsx` (can render on server)

**Client Components ('use client'):**
`sidebar.tsx` (usePathname for active link), `login-form.tsx` (useActionState), `client-form.tsx` (useActionState), `case-form.tsx` (useActionState), `pagination.tsx` (useSearchParams, useRouter)

## Error Handling Strategy

| HTTP | Behavior |
|------|----------|
| 400 with field name | `apiFetch` parses NestJS message array, maps to field. Server Action returns `{errors: {firstName: "no debe estar vacío"}}`. Form renders inline. |
| 400 without field | General message via `state.errors._form` |
| 401 | `apiFetch` catches → `deleteSession()` → `redirect('/login?reason=expired')` |
| 404 | Page renders not-found UI with back link |
| 409 | Backend returns field name in message → inline "RFC ya registrado" |

## Testing Strategy

> **Nota:** `apps/web` no tiene setup de testing (sin Jest, sin Vitest, sin Playwright). No se configura testing desde cero en HU-04. Todo testing es manual hasta que se agregue infraestructura de pruebas en una HU posterior.

| Layer | What | How |
|-------|------|-----|
| Manual | Login, CRUD clientes, CRUD expedientes, navegación, errores | Navegador contra NestJS real en `localhost:3000` / `localhost:3001` |
| Manual | Cookie flags (httpOnly, SameSite, Secure) | Browser devtools → Application → Cookies |
| Manual | 401 handling (token expirado, token inválido) | Borrar cookie manualmente y verificar redirect |
| Diferido | Unit/Integration (apiFetch, session, actions) | Jest + Playwright — configurados en HU posterior cuando se agregue setup de testing

## Open Questions

- None. All decisions resolved in exploration and spec phases.
