import { getJson } from "@/lib/http-client";

export type ArcadeLobbyGame = "tic-tac-toe" | "memory" | "hangman";

export type StoredLobbySession<TPlayerId extends string> = {
  code: string;
  playerId: TPlayerId;
  rejoinToken?: string;
};

type ArcadeLobbyStatusResponse = {
  game: ArcadeLobbyGame;
};

export function createRejoinToken(): string {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function rememberLobbySession<TPlayerId extends string>(
  storageKey: string,
  session: StoredLobbySession<TPlayerId>,
): void {
  const serializedSession = JSON.stringify(session);

  writeStorage(window.sessionStorage, storageKey, serializedSession);
  writeStorage(window.localStorage, storageKey, serializedSession);
}

export function forgetLobbySession(storageKey: string): void {
  removeStorage(window.sessionStorage, storageKey);
  removeStorage(window.localStorage, storageKey);
}

export function readLobbySession<TPlayerId extends string>(
  storageKey: string,
  normalizeCode: (code: string) => string,
  isPlayerId: (value: string) => value is TPlayerId,
): StoredLobbySession<TPlayerId> | null {
  const storedValue =
    readStorage(window.sessionStorage, storageKey) ??
    readStorage(window.localStorage, storageKey);

  if (!storedValue) {
    return null;
  }

  try {
    const parsedValue: unknown = JSON.parse(storedValue);

    if (
      parsedValue &&
      typeof parsedValue === "object" &&
      !Array.isArray(parsedValue)
    ) {
      const { code, playerId, rejoinToken } = parsedValue as Record<
        string,
        unknown
      >;

      if (typeof code === "string" && typeof playerId === "string") {
        const normalizedCode = normalizeCode(code);

        if (normalizedCode && isPlayerId(playerId)) {
          return {
            code: normalizedCode,
            playerId,
            rejoinToken:
              typeof rejoinToken === "string" && rejoinToken.trim()
                ? rejoinToken
                : undefined,
          };
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}

export async function readArcadeLobbyGame(
  code: string,
  signal?: AbortSignal,
): Promise<ArcadeLobbyGame> {
  const response = await getJson<ArcadeLobbyStatusResponse>(
    `/api/lobbies/${encodeURIComponent(code)}`,
    { signal },
  );

  return response.game;
}

function readStorage(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // Storage can be unavailable in private contexts; the lobby still works.
  }
}

function removeStorage(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Storage can be unavailable in private contexts; there is nothing to clear.
  }
}
