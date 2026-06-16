import { NextResponse } from "next/server";
import { getSession } from "@/app/lib/session";

/**
 * POST /api/mortgage-cases/[id]/documents/upload
 *
 * Proxies multipart FormData from the browser to the NestJS upload endpoint.
 * The JWT token is read from the httpOnly cookie serverside — it never
 * reaches browser JavaScript.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // ---- Read JWT from httpOnly cookie ------------------------------------
  const token = await getSession();
  if (!token) {
    return NextResponse.json(
      { message: "Unauthorized" },
      { status: 401 },
    );
  }

  // ---- Read FormData from the incoming request ---------------------------
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { message: "Invalid request body" },
      { status: 400 },
    );
  }

  // ---- Forward to NestJS -------------------------------------------------
  const apiUrl =
    process.env.API_URL ?? "http://localhost:3001";

  let nestRes: Response;
  try {
    nestRes = await fetch(
      `${apiUrl}/mortgage-cases/${id}/documents/upload`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      },
    );
  } catch {
    return NextResponse.json(
      { message: "File storage service unavailable" },
      { status: 502 },
    );
  }

  // ---- Return the NestJS response as-is ----------------------------------
  const body = await nestRes.json().catch(() => ({}));

  return NextResponse.json(body, { status: nestRes.status });
}
