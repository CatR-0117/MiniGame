import { createHash } from "node:crypto";

export function createRejoinTokenHash(rejoinToken: string): string | null {
  const normalizedToken = rejoinToken.trim();

  if (!normalizedToken) {
    return null;
  }

  return createHash("sha256").update(normalizedToken).digest("base64url");
}
