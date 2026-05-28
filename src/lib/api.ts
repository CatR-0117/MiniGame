import { NextResponse } from "next/server";

export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => ({}));

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }

  return body as Record<string, unknown>;
}

export function readStringField(
  body: Record<string, unknown>,
  fieldName: string,
): string {
  const value = body[fieldName];

  return typeof value === "string" ? value : "";
}

export function readNumberField(
  body: Record<string, unknown>,
  fieldName: string,
): number {
  const value = body[fieldName];

  return typeof value === "number" ? value : Number.NaN;
}

export function createApiErrorResponse(error: unknown): NextResponse {
  const message = getSafeApiErrorMessage(error);

  console.error(error);

  return NextResponse.json(
    {
      error: message,
    },
    {
      status: 503,
    },
  );
}

function getSafeApiErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes("public.arcade_lobbies") ||
    message.includes("PGRST205")
  ) {
    return "Supabase setup is incomplete. Run supabase/arcade_lobbies.sql in Supabase, then redeploy.";
  }

  if (message.includes("Supabase lobby store is not configured")) {
    return "Supabase environment variables are missing. Set SUPABASE_REST_URL and SUPABASE_API_KEY in Vercel, or set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.";
  }

  if (message.includes("Supabase request failed")) {
    return "Supabase lobby storage is unavailable. Check the Supabase table, policies, and Vercel environment variables.";
  }

  return "Something went wrong while contacting the lobby backend.";
}
