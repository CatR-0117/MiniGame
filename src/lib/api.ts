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
