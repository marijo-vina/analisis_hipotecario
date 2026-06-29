import "server-only";

import { redirect } from "next/navigation";
import { getSession, deleteSession } from "@/app/lib/session";
import type { ApiResult } from "@/app/lib/definitions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the base URL from the environment variable (with fallback). */
function baseUrl(): string {
  return process.env.API_URL ?? "http://localhost:3001";
}

/**
 * Parse NestJS validation-error response into a flat Record.
 *
 * NestJS may return `message` as:
 *  - an array of strings  → first word = field, remainder = value
 *  - an array of objects  → `property` + first `constraints` value
 *  - a single string      → stored under `_form`
 */
function parseNestJSMessage(
  body: Record<string, unknown>,
): Record<string, string> {
  const raw = body.message;

  // Single string — general / _form error
  if (typeof raw === "string") {
    return { _form: raw };
  }

  // Array of strings or objects
  if (Array.isArray(raw)) {
    const errors: Record<string, string> = {};

    for (const item of raw) {
      if (typeof item === "string") {
        const spaceIdx = item.indexOf(" ");
        if (spaceIdx === -1) {
          errors._form = (errors._form ? errors._form + "; " : "") + item;
        } else {
          const field = item.slice(0, spaceIdx);
          const message = item.slice(spaceIdx + 1);
          errors[field] = message;
        }
      } else if (typeof item === "object" && item !== null) {
        const obj = item as Record<string, unknown>;
        const property = typeof obj.property === "string" ? obj.property : undefined;
        const constraints = obj.constraints as Record<string, string> | undefined;

        if (property && constraints) {
          const first = Object.values(constraints)[0];
          if (first) errors[property] = first;
        }
      }
    }

    return errors;
  }

  // Fallback
  return { _form: "Error de validación del servidor." };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FetchInit {
  method?: string;
  body?: Record<string, unknown>;
}

/**
 * Server-only fetch wrapper that automatically:
 *  1. Reads the JWT token from the httpOnly cookie
 *  2. Adds `Authorization: Bearer <token>` header
 *  3. Handles 401 (deletes session + redirects to login)
 *  4. Parses NestJS error responses (400, 409)
 *  5. Returns a typed `ApiResult<T>` discriminated union
 */
export async function apiFetch<T>(
  path: string,
  init?: FetchInit,
): Promise<ApiResult<T>> {
  const token = await getSession();
  const url = `${baseUrl()}${path}`;

  const headers: Record<string, string> = {};

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let body: string | undefined;

  if (init?.method && init.method !== "GET") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.body ?? {});
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: init?.method ?? "GET",
      headers,
      body,
    });
  } catch {
    return {
      ok: false,
      errors: { _form: "No se pudo conectar con el servidor." },
    };
  }

  // ---- 401 → session expired / invalid token ----------------------------
  if (res.status === 401) {
    try {
      await deleteSession();
    } catch {
      // Cookie deletion not available during server component render.
      // The login page will clear the session.
    }
    redirect("/login?reason=expired");
  }

  // ---- Parse response body (may be empty for 204, etc.) ------------------
  let resBody: Record<string, unknown>;
  try {
    resBody = (await res.json()) as Record<string, unknown>;
  } catch {
    // Response body is not JSON (unlikely for NestJS but handle gracefully)
    if (!res.ok) {
      return {
        ok: false,
        errors: { _form: "Error inesperado. Intente nuevamente." },
        status: res.status,
      };
    }
    // Treat empty / non-JSON success as empty data
    return { ok: true, data: undefined as unknown as T };
  }

  // ---- Success -----------------------------------------------------------
  if (res.ok) {
    return { ok: true, data: resBody as T };
  }

  // ---- 400 / 409 → field-level errors ------------------------------------
  if (res.status === 400 || res.status === 409) {
    const errors = parseNestJSMessage(resBody);
    return { ok: false, errors, status: res.status };
  }

  // ---- 404 ---------------------------------------------------------------
  if (res.status === 404) {
    return { ok: false, errors: {}, notFound: true, status: 404 };
  }

  // ---- 500 / generic server error ----------------------------------------
  if (res.status >= 500) {
    return {
      ok: false,
      errors: { _form: "Error inesperado. Intente nuevamente." },
      status: res.status,
    };
  }

  // ---- Any other non-ok status -------------------------------------------
  return {
    ok: false,
    errors: { _form: "Error inesperado. Intente nuevamente." },
    status: res.status,
  };
}
