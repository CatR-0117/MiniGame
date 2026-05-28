export type LobbySuccess<T> = {
  ok: true;
  data: T;
};

export type LobbyFailure = {
  ok: false;
  status: 400 | 403 | 404 | 409;
  message: string;
};

export type LobbyResult<T> = LobbySuccess<T> | LobbyFailure;

export const LOBBY_TTL_MS = 4 * 60 * 60 * 1_000;
export const WAITING_LOBBY_TTL_MS = 5 * 60 * 1_000;

const LOBBY_CODE_LENGTH = 6;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeLobbyCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function cleanupExpiredLobbies<
  T extends {
    status?: string;
    updatedAt: number;
    waitingExpiresAt?: number | null;
  },
>(
  lobbies: Map<string, T>,
  now: number,
): void {
  for (const [code, lobby] of lobbies) {
    if (isLobbyExpired(lobby, now)) {
      lobbies.delete(code);
    }
  }
}

export function getWaitingLobbyExpiresAt(now: number): number {
  return now + WAITING_LOBBY_TTL_MS;
}

export function isLobbyExpired(
  lobby: {
    status?: string;
    updatedAt: number;
    waitingExpiresAt?: number | null;
  },
  now: number,
): boolean {
  return (
    (lobby.status === "waiting" &&
      typeof lobby.waitingExpiresAt === "number" &&
      now >= lobby.waitingExpiresAt) ||
    now - lobby.updatedAt > LOBBY_TTL_MS
  );
}

export function generateUniqueLobbyCode<T>(lobbies: Map<string, T>): string {
  let code = generateLobbyCode();

  while (lobbies.has(code)) {
    code = generateLobbyCode();
  }

  return code;
}

export function lobbyError(
  status: LobbyFailure["status"],
  message: string,
): LobbyFailure {
  return {
    ok: false,
    status,
    message,
  };
}

export function sanitizePlayerName(name: string, fallback: string): string {
  const trimmedName = name.trim().replace(/\s+/g, " ");

  if (!trimmedName) {
    return fallback;
  }

  return trimmedName.slice(0, 24);
}

export function generateLobbyCode(): string {
  return Array.from({ length: LOBBY_CODE_LENGTH }, () =>
    CODE_ALPHABET.charAt(Math.floor(Math.random() * CODE_ALPHABET.length)),
  ).join("");
}
