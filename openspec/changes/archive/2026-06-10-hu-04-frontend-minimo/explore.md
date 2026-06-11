# Exploration: HU-04 — Interfaz Base Interna para Asesora

## Current State

### apps/web (frontend)
The frontend is **scaffolding only** — Next.js 16.2.7 project with zero business logic.

**Existing files:**
| File | Purpose |
|------|---------|
| `app/layout.tsx` | Root layout with Geist fonts, `<html>` + `<body>` shell |
| `app/page.tsx` | Static landing page: "Gestión Financiera" title + description |
| `app/globals.css` | Tailwind 4 entry (`@import "tailwindcss"`), CSS variables for theme |
| `next.config.ts` | Empty config — no proxy rewrites or redirects |
| `tsconfig.json` | Standard Next.js TS config with `@/*` path alias |
| `package.json` | Only next, react, react-dom + tailwindcss 4 + typescript |

**Missing (needed for HU-04):**
- `.env` / `.env.local` — no `API_URL` or `SESSION_SECRET` variables
- `proxy.ts` — no route protection
- `server-only` package — not installed
- `jose` package — not installed (needed for JWT / session encryption)
- Any `app/lib/` directory — no DAL, no session utils, no API client
- Any `app/ui/` directory — no components at all
- Any routes beyond `/` — no login, dashboard, clients, or cases pages
- Any forms — no login form, no client creation form, no case creation form
- Any API calls — zero communication with the NestJS backend

### apps/api (backend — complete)
NestJS at `localhost:3001`, 80 green tests, fully functional.

**Auth system:**
- `JwtStrategy` extracts JWT from `Authorization: Bearer <token>` header
- JWT payload: `{ email, sub (userId), role }` (from `auth.service.ts` line 26)
- `JwtAuthGuard` protects all resource endpoints
- JWT expires in 8h (from `.env`)
- Login returns: `{ access_token, user: { id, email, name, role } }`

**CORS:** Allows `http://localhost:3000` with credentials (`main.ts` line 11)

**Environment (`.env`):**
```
PORT=3001
DATABASE_URL=postgresql://root:rootpassword@localhost:5432/hipotecario_db
JWT_SECRET=super-secret-development-key
JWT_EXPIRES_IN=8h
```

## API Contracts

All endpoints except `/auth/login` require `Authorization: Bearer <token>`.

### Auth (public)
| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/auth/login` | `{ email, password }` | `{ access_token: string, user: { id, email, name, role } }` |

### Clients (JWT-protected)
| Method | Path | Query/Body | Response |
|--------|------|------------|----------|
| GET | `/clients` | `?page=1&limit=10` | `{ data: Client[], meta: { total, page, limit } }` |
| POST | `/clients` | `{ firstName*, paternalLastName*, maternalLastName?, rfc?, curp?, email*, phone* }` | Created Client |
| GET | `/clients/:id` | — | Full Client object |
| PATCH | `/clients/:id` | Partial of CreateClientDto | Updated Client |

### Mortgage Cases (JWT-protected)
| Method | Path | Query/Body | Response |
|--------|------|------------|----------|
| GET | `/mortgage-cases` | `?page=1&limit=10` | `{ data: MortgageCase[], meta: { total, page, limit } }` |
| POST | `/mortgage-cases` | `{ clientId*, creditTypeId*, personType?, propertyLocation?, requestedAmount?, propertyValue?, estimatedTermMonths?, notes? }` | Created MortgageCase |
| GET | `/mortgage-cases/:id` | — | Full MortgageCase with client, advisor, creditType, status relations |

> \* = required. `advisorId` comes from JWT; `statusId` auto-set to PENDING_DOCUMENTS.

### Catalogs (JWT-protected)
| Method | Path | Response |
|--------|------|----------|
| GET | `/credit-types` | `{ data: { id, code, name, isActive }[] }` |
| GET | `/case-statuses` | `{ data: { id, code, name, order }[] }` |

## Recommended Architecture

### Session Strategy: Raw JWT in httpOnly Cookie (Phase 1)

**Decision:** Store the NestJS-issued JWT directly in an httpOnly cookie. Encrypt with jose in a follow-up iteration.

**Rationale:**
- The JWT payload contains only `{ sub, email, role }` — no PII or secrets
- httpOnly + secure + sameSite flags prevent XSS and CSRF
- Eliminates client-side token management entirely
- Follows Next.js 16 stateless session pattern
- Minimal dependencies for HU-04 (no jose needed yet)
- **Risk noted:** JWT payload is base64-readable (not encrypted). For production, upgrade to jose-encrypted session wrapper.

**Flow:**
```
1. User submits login form → Server Action → POST to NestJS /auth/login
2. Server Action receives { access_token, user }
3. Server Action sets httpOnly cookie: 'token' = access_token
4. Server Components read cookie → forward as Bearer header to NestJS API
5. Server Actions read cookie → forward as Bearer header for mutations
```

### Component Architecture: Server-First

| Layer | Type | Responsibility |
|-------|------|---------------|
| Pages (`app/dashboard/`, `app/clientes/`, etc.) | Server Components | Fetch data, orchestrate layout |
| Forms (`app/ui/login-form.tsx`, etc.) | Client Components (`'use client'`) | Form state, event handlers, useActionState |
| Data Access (`app/lib/api.ts`) | Server-only module | fetch wrapper that reads JWT cookie, forwards Bearer header |
| Session (`app/lib/session.ts`) | Server-only module | getSession(), createSession(), deleteSession() |
| Proxy (`proxy.ts`) | Edge/Node runtime | Optimistic auth check, redirect unauthenticated users |

### Proxy Pattern

```typescript
// proxy.ts (root of apps/web)
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const protectedRoutes = ['/dashboard', '/clientes', '/expedientes']
const publicRoutes = ['/login', '/']

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
  const isProtected = protectedRoutes.some(r => path.startsWith(r))
  const isPublic = publicRoutes.some(r => path === r || (r !== '/' && path.startsWith(r)))

  const token = (await cookies()).get('token')?.value

  if (isProtected && !token) {
    return NextResponse.redirect(new URL('/login', req.nextUrl))
  }

  if (isPublic && token && path === '/login') {
    return NextResponse.redirect(new URL('/dashboard', req.nextUrl))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)'],
}
```

### Data Access Layer

```typescript
// app/lib/api.ts
import 'server-only'
import { cookies } from 'next/headers'

const API_URL = process.env.API_URL ?? 'http://localhost:3001'

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = (await cookies()).get('token')?.value

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(error.message ?? `API error ${res.status}`)
  }

  return res.json()
}
```

### Route Structure (proposed)

```
app/
├── layout.tsx              # Root layout (exists)
├── page.tsx                # Landing page → redirect to /dashboard if authed (exists, modify)
├── globals.css             # Tailwind 4 entry (exists)
├── login/
│   └── page.tsx            # Login page (Server Component wrapping login form)
├── dashboard/
│   └── page.tsx            # Dashboard home (Server Component)
├── clientes/
│   ├── page.tsx            # Client list (Server Component)
│   ├── nuevo/
│   │   └── page.tsx        # New client form (Server Component wrapping form)
│   └── [id]/
│       └── page.tsx        # Client detail (Server Component)
├── expedientes/
│   ├── page.tsx            # Mortgage case list (Server Component)
│   ├── nuevo/
│   │   └── page.tsx        # New case form (Server Component wrapping form)
│   └── [id]/
│       └── page.tsx        # Case detail (Server Component)
├── ui/
│   ├── login-form.tsx      # 'use client' — form with useActionState
│   ├── client-form.tsx     # 'use client' — client creation form
│   ├── case-form.tsx       # 'use client' — case creation form
│   ├── logout-button.tsx   # 'use client' — logout button
│   ├── nav.tsx             # 'use client' — navigation (needs active state)
│   └── ...                 # Skeleton loaders, data tables
├── lib/
│   ├── api.ts              # Server-only API fetch wrapper
│   ├── session.ts          # Server-only session helpers
│   └── definitions.ts      # Shared types (Client, MortgageCase, etc.)
└── actions/
    ├── auth.ts             # 'use server' — login, logout
    ├── clients.ts          # 'use server' — createClient, updateClient
    └── cases.ts            # 'use server' — createCase
```

## Dependencies Required

| Package | Purpose | Priority |
|---------|---------|----------|
| `server-only` | Prevent server code leaking to client bundle | **Required** |
| `jose` | JWT verification + session encryption (future) | **Deferred** (Phase 2) |
| `zod` (optional) | Client-side form validation before Server Action | **Optional** — backend validates via class-validator |

## Environment Variables Needed

Create `apps/web/.env.local`:
```
API_URL=http://localhost:3001
```

> Note: No `SESSION_SECRET` needed in Phase 1 since we store the raw JWT. Add when jose encryption is introduced.

## Risks and Unknowns

1. **Raw JWT in cookie (no encryption):** The JWT payload `{ sub, email, role }` is readable as base64. For an internal tool this is acceptable short-term, but should be addressed before any production deployment.

2. **Token expiration handling:** JWT expires in 8h. The frontend needs to handle 401 responses gracefully — redirect to login, clear the cookie. No refresh token mechanism exists in the backend yet.

3. **CORS credentials:** The backend has `credentials: true`. Server-side fetches from Next.js to NestJS don't use CORS (server-to-server), but if we ever use Client Components for direct API calls, credentials will work.

4. **Proxy vs real auth:** Proxy provides optimistic checks only. All data mutations MUST verify auth in Server Actions (reading the token cookie). The proxy is a UX optimization, not a security boundary.

5. **Layout re-render caveat:** Next.js layouts don't re-render on navigation. Auth checks must happen in pages or leaf components — NOT solely in layouts. Follow the DAL pattern: `verifySession()` called in every data-fetching function.

6. **NestJS API on separate port:** In production, both apps would be behind a reverse proxy. For development, CORS and separate ports work fine.

7. **No `params`/`searchParams` type helpers:** Next.js 16 requires `params` to be `Promise<>` in page components. All Server Components that receive params must `await` them.

## Key Decisions to Surface in Proposal

1. **Cookie-based JWT vs localStorage:** Recommend httpOnly cookie (secure, follows Next.js 16 patterns).
2. **Raw JWT vs jose-encrypted session:** Recommend raw JWT for Phase 1, encryption as a follow-up task.
3. **Server Components vs Client Components:** Server Components for data fetching, Client Components only for forms and interactivity.
4. **Server Actions vs Route Handlers:** Server Actions for mutations (follows Next.js 16 patterns, no extra API routes needed).
5. **Proxy file location:** `apps/web/proxy.ts` (root of the Next.js project).
6. **Form validation strategy:** Lean on backend class-validator; add client-side zod only if UX demands it.

## Affected Areas

- `apps/web/app/` — new pages (login, dashboard, clientes/*, expedientes/*)
- `apps/web/app/ui/` — new Client Components (forms, nav)
- `apps/web/app/lib/` — new server-only modules (api client, session)
- `apps/web/app/actions/` — new Server Actions
- `apps/web/proxy.ts` — new route protection
- `apps/web/package.json` — add `server-only` dependency
- `apps/web/next.config.ts` — may need minor config (API_URL env exposure)
- `apps/web/.env.local` — new environment file
- `apps/web/app/globals.css` — may need layout/component styles
- `apps/web/app/layout.tsx` — add nav wrapper for authenticated routes
- `apps/web/app/page.tsx` — modify landing to redirect if authenticated

## Ready for Proposal

**Yes.** The architecture is clear, the API contracts are fully defined, and the approach follows Next.js 16 best practices. The proposal should define scope boundaries (what pages/features are in HU-04 vs. deferred) and confirm the cookie-based auth approach.
