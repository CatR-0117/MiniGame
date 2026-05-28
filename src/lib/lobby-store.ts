import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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

const LOBBY_TABLE = "arcade_lobbies";
const LOBBY_SELECT =
  "code,game,lobby,created_at_ms,updated_at_ms,waiting_expires_at_ms";
const supabase = isSupabaseConfigured()
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    )
  : null;

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
      const { error } = await getSupabaseClient()
        .from(LOBBY_TABLE)
        .delete()
        .or(`waiting_expires_at_ms.lte.${now},updated_at_ms.lt.${updatedAtCutoff}`);

      if (error) {
        throw createSupabaseError(error);
      }
    },
    () => undefined,
  );
}

async function withStoreFallback<T>(
  supabaseOperation: () => Promise<T>,
  memoryOperation: () => T,
): Promise<T> {
  const canUseMemoryFallback = shouldUseMemoryFallback();

  if (!supabase) {
    if (canUseMemoryFallback) {
      return memoryOperation();
    }

    throw new Error(
      "Supabase lobby store is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
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
  let query = getSupabaseClient()
    .from(LOBBY_TABLE)
    .select(LOBBY_SELECT)
    .eq("code", code);

  if (game) {
    query = query.eq("game", game);
  }

  const { data, error } = await query.limit(1).maybeSingle();

  if (error) {
    throw createSupabaseError(error);
  }

  return (data as StoredLobbyRecord<T> | null) ?? null;
}

async function upsertSupabaseRecord<T extends StoredLobby>(
  record: StoredLobbyRecord<T>,
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from(LOBBY_TABLE)
    .upsert(record, { onConflict: "code" });

  if (error) {
    throw createSupabaseError(error);
  }
}

async function deleteSupabaseRecord(
  code: string,
  game?: ArcadeLobbyGame,
): Promise<void> {
  let query = getSupabaseClient().from(LOBBY_TABLE).delete().eq("code", code);

  if (game) {
    query = query.eq("game", game);
  }

  const { error } = await query;

  if (error) {
    throw createSupabaseError(error);
  }
}

function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    throw new Error("Supabase lobby store is not configured.");
  }

  return supabase;
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

function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

function createSupabaseError(error: {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message: string;
}): Error {
  const details = [error.code, error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ");

  return new Error(`Supabase request failed: ${details}`);
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
