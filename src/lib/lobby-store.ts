import type { ArcadeLobbyGame } from "@/lib/arcade-lobby-directory";
import {
  isLobbyExpired,
  LOBBY_TTL_MS,
  normalizeLobbyCode,
} from "@/lib/lobby-utils";

export type StoredLobby = {
  code: string;
  createdAt: number;
  updatedAt: number;
  waitingExpiresAt?: number | null;
  status?: string;
};

type StoredLobbyRecord<T extends StoredLobby = StoredLobby> = {
  code: string;
  game: ArcadeLobbyGame;
  lobby: T;
  created_at_ms: number;
  updated_at_ms: number;
  waiting_expires_at_ms: number | null;
};

type SupabaseConfig = {
  restUrl: string;
  apiKey: string;
};

const LOBBY_TABLE = "arcade_lobbies";
const LOBBY_SELECT =
  "code,game,lobby,created_at_ms,updated_at_ms,waiting_expires_at_ms";

const globalForLobbyStore = globalThis as typeof globalThis & {
  __miniArcadeLobbyRows?: Map<string, StoredLobbyRecord>;
  __miniArcadeSupabaseUnavailable?: boolean;
  __miniArcadeSupabaseWarningShown?: boolean;
};

export async function saveStoredLobby<T extends StoredLobby>(
  game: ArcadeLobbyGame,
  lobby: T,
): Promise<T> {
  const record = createRecord(game, lobby);

  await withStoreFallback(
    async () => {
      await upsertSupabaseRecord(record);
    },
    () => {
      saveMemoryRecord(record);
    },
  );

  return lobby;
}

export async function getStoredLobby<T extends StoredLobby>(
  code: string,
  game: ArcadeLobbyGame,
): Promise<T | null> {
  const normalizedCode = normalizeLobbyCode(code);
  const now = Date.now();

  return withStoreFallback(
    async () => {
      const record = await getSupabaseRecord<T>(normalizedCode, game);

      if (record && isLobbyExpired(record.lobby, now)) {
        await deleteSupabaseRecord(normalizedCode, game);
        return null;
      }

      return record?.lobby ?? null;
    },
    () => getMemoryRecord<T>(normalizedCode, game, now)?.lobby ?? null,
  );
}

export async function hasStoredLobbyByCode(
  code: string,
  game?: ArcadeLobbyGame,
): Promise<boolean> {
  const normalizedCode = normalizeLobbyCode(code);
  const now = Date.now();

  return withStoreFallback(
    async () => {
      const record = await getSupabaseRecord(normalizedCode, game);

      if (record && isLobbyExpired(record.lobby, now)) {
        await deleteSupabaseRecord(normalizedCode, game);
        return false;
      }

      return Boolean(record);
    },
    () => Boolean(getMemoryRecord(normalizedCode, game, now)),
  );
}

export async function getStoredLobbyGame(
  code: string,
): Promise<ArcadeLobbyGame | null> {
  const normalizedCode = normalizeLobbyCode(code);
  const now = Date.now();

  return withStoreFallback(
    async () => {
      const record = await getSupabaseRecord(normalizedCode);

      if (record && isLobbyExpired(record.lobby, now)) {
        await deleteSupabaseRecord(normalizedCode, record.game);
        return null;
      }

      return record?.game ?? null;
    },
    () => getMemoryRecord(normalizedCode, undefined, now)?.game ?? null,
  );
}

export async function deleteStoredLobby(
  code: string,
  game?: ArcadeLobbyGame,
): Promise<void> {
  const normalizedCode = normalizeLobbyCode(code);

  await withStoreFallback(
    async () => {
      await deleteSupabaseRecord(normalizedCode, game);
    },
    () => {
      deleteMemoryRecord(normalizedCode, game);
    },
  );
}

export async function cleanupExpiredLobbyRecords(
  now = Date.now(),
): Promise<void> {
  cleanupExpiredMemoryRecords(now);

  await withStoreFallback(
    async () => {
      const updatedAtCutoff = now - LOBBY_TTL_MS;
      const path =
        `${LOBBY_TABLE}?or=` +
        encodeURIComponent(
          `(waiting_expires_at_ms.lte.${now},updated_at_ms.lt.${updatedAtCutoff})`,
        );

      await fetchSupabase<void>(path, {
        method: "DELETE",
      });
    },
    () => undefined,
  );
}

async function withStoreFallback<T>(
  supabaseOperation: () => Promise<T>,
  memoryOperation: () => T,
): Promise<T> {
  const canUseMemoryFallback = shouldUseMemoryFallback();

  if (!getSupabaseConfig()) {
    if (canUseMemoryFallback) {
      return memoryOperation();
    }

    throw new Error(
      "Supabase lobby store is not configured. Set SUPABASE_REST_URL and SUPABASE_API_KEY.",
    );
  }

  if (
    canUseMemoryFallback &&
    globalForLobbyStore.__miniArcadeSupabaseUnavailable
  ) {
    return memoryOperation();
  }

  try {
    return await supabaseOperation();
  } catch (error) {
    if (!canUseMemoryFallback) {
      throw error;
    }

    globalForLobbyStore.__miniArcadeSupabaseUnavailable = true;
    warnAboutSupabaseFallback(error);

    return memoryOperation();
  }
}

async function getSupabaseRecord<T extends StoredLobby = StoredLobby>(
  code: string,
  game?: ArcadeLobbyGame,
): Promise<StoredLobbyRecord<T> | null> {
  const filters = [`code=eq.${encodeURIComponent(code)}`];

  if (game) {
    filters.push(`game=eq.${encodeURIComponent(game)}`);
  }

  const path = `${LOBBY_TABLE}?select=${LOBBY_SELECT}&${filters.join("&")}&limit=1`;
  const rows = await fetchSupabase<StoredLobbyRecord<T>[]>(path);

  return rows[0] ?? null;
}

async function upsertSupabaseRecord<T extends StoredLobby>(
  record: StoredLobbyRecord<T>,
): Promise<void> {
  await fetchSupabase<StoredLobbyRecord<T>[]>(`${LOBBY_TABLE}?on_conflict=code`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(record),
  });
}

async function deleteSupabaseRecord(
  code: string,
  game?: ArcadeLobbyGame,
): Promise<void> {
  const filters = [`code=eq.${encodeURIComponent(code)}`];

  if (game) {
    filters.push(`game=eq.${encodeURIComponent(game)}`);
  }

  await fetchSupabase<void>(`${LOBBY_TABLE}?${filters.join("&")}`, {
    method: "DELETE",
  });
}

async function fetchSupabase<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const config = getSupabaseConfig();

  if (!config) {
    throw new Error("Supabase lobby store is not configured.");
  }

  const response = await fetch(`${config.restUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      apikey: config.apiKey,
      Authorization: `Bearer ${config.apiKey}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(
      `Supabase request failed (${response.status}): ${message || response.statusText}`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json().catch(() => undefined)) as T;
}

function getSupabaseConfig(): SupabaseConfig | null {
  const restUrl = createSupabaseRestUrl(
    readEnv(
      "SUPABASE_REST_URL",
      "NEXT_PUBLIC_SUPABASE_REST_URL",
      "SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
    ),
  );
  const apiKey =
    readEnv(
      "SUPABASE_API_KEY",
      "SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ) ?? "";

  if (!restUrl || !apiKey) {
    return null;
  }

  return {
    restUrl,
    apiKey,
  };
}

function shouldUseMemoryFallback(): boolean {
  if (process.env.SUPABASE_LOBBY_FALLBACK === "true") {
    return true;
  }

  if (process.env.SUPABASE_LOBBY_FALLBACK === "false") {
    return false;
  }

  return process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1";
}

function readEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();

    if (value) {
      return value;
    }
  }

  return "";
}

function createSupabaseRestUrl(value: string): string {
  const trimmedValue = value.trim().replace(/\/+$/, "");

  if (!trimmedValue) {
    return "";
  }

  if (trimmedValue.endsWith("/rest/v1")) {
    return `${trimmedValue}/`;
  }

  return `${trimmedValue}/rest/v1/`;
}

function createRecord<T extends StoredLobby>(
  game: ArcadeLobbyGame,
  lobby: T,
): StoredLobbyRecord<T> {
  return {
    code: normalizeLobbyCode(lobby.code),
    game,
    lobby,
    created_at_ms: lobby.createdAt,
    updated_at_ms: lobby.updatedAt,
    waiting_expires_at_ms: lobby.waitingExpiresAt ?? null,
  };
}

function getMemoryRows(): Map<string, StoredLobbyRecord> {
  globalForLobbyStore.__miniArcadeLobbyRows ??= new Map();

  return globalForLobbyStore.__miniArcadeLobbyRows;
}

function saveMemoryRecord<T extends StoredLobby>(
  record: StoredLobbyRecord<T>,
): void {
  getMemoryRows().set(record.code, record);
}

function getMemoryRecord<T extends StoredLobby = StoredLobby>(
  code: string,
  game: ArcadeLobbyGame | undefined,
  now: number,
): StoredLobbyRecord<T> | null {
  cleanupExpiredMemoryRecords(now);

  const record = getMemoryRows().get(code);

  if (!record || (game && record.game !== game)) {
    return null;
  }

  return record as StoredLobbyRecord<T>;
}

function deleteMemoryRecord(code: string, game?: ArcadeLobbyGame): void {
  const record = getMemoryRows().get(code);

  if (record && (!game || record.game === game)) {
    getMemoryRows().delete(code);
  }
}

function cleanupExpiredMemoryRecords(now: number): void {
  for (const [code, record] of getMemoryRows()) {
    if (isLobbyExpired(record.lobby, now)) {
      getMemoryRows().delete(code);
    }
  }
}

function warnAboutSupabaseFallback(error: unknown): void {
  if (globalForLobbyStore.__miniArcadeSupabaseWarningShown) {
    return;
  }

  globalForLobbyStore.__miniArcadeSupabaseWarningShown = true;
  const message = error instanceof Error ? error.message : String(error);

  console.warn(
    `Supabase lobby store is unavailable; using in-memory lobbies instead. ${message}`,
  );
}
