import {
  generateLobbyCode,
  LOBBY_TTL_MS,
  normalizeLobbyCode,
} from "@/lib/lobby-utils";
import {
  cleanupExpiredLobbyRecords,
  getStoredLobbyGame,
  hasStoredLobbyByCode,
} from "@/lib/lobby-store";

export type ArcadeLobbyGame = "tic-tac-toe" | "memory" | "hangman";

type ArcadeLobbyDirectoryEntry = {
  game: ArcadeLobbyGame;
  createdAt: number;
};

const globalForArcadeLobbies = globalThis as typeof globalThis & {
  __miniArcadeLobbyDirectory?: Map<string, ArcadeLobbyDirectoryEntry>;
};

export async function generateUniqueArcadeLobbyCode(): Promise<string> {
  await cleanupExpiredLobbyRecords();

  let code = generateLobbyCode();

  while (await hasStoredLobbyByCode(code)) {
    code = generateLobbyCode();
  }

  return code;
}

export async function registerArcadeLobbyCode(
  code: string,
  game: ArcadeLobbyGame,
): Promise<void> {
  const directory = getLobbyDirectory();

  cleanupExpiredArcadeLobbyCodes(directory);
  directory.set(normalizeLobbyCode(code), {
    game,
    createdAt: Date.now(),
  });
}

export async function getArcadeLobbyGame(
  code: string,
): Promise<ArcadeLobbyGame | null> {
  const storedGame = await getStoredLobbyGame(code);

  if (storedGame) {
    return storedGame;
  }

  const directory = getLobbyDirectory();

  cleanupExpiredArcadeLobbyCodes(directory);

  return directory.get(normalizeLobbyCode(code))?.game ?? null;
}

function getLobbyDirectory(): Map<string, ArcadeLobbyDirectoryEntry> {
  globalForArcadeLobbies.__miniArcadeLobbyDirectory ??= new Map();

  return globalForArcadeLobbies.__miniArcadeLobbyDirectory;
}

function cleanupExpiredArcadeLobbyCodes(
  directory: Map<string, ArcadeLobbyDirectoryEntry>,
): void {
  const now = Date.now();

  for (const [code, entry] of directory) {
    if (now - entry.createdAt > LOBBY_TTL_MS) {
      directory.delete(code);
    }
  }
}
