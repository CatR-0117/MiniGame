import {
  generateUniqueLobbyCode,
  LOBBY_TTL_MS,
  normalizeLobbyCode,
} from "@/lib/lobby-utils";

export type ArcadeLobbyGame = "tic-tac-toe" | "memory" | "hangman";

type ArcadeLobbyDirectoryEntry = {
  game: ArcadeLobbyGame;
  createdAt: number;
};

const globalForArcadeLobbies = globalThis as typeof globalThis & {
  __miniArcadeLobbyDirectory?: Map<string, ArcadeLobbyDirectoryEntry>;
};

export function generateUniqueArcadeLobbyCode(): string {
  const directory = getLobbyDirectory();

  cleanupExpiredArcadeLobbyCodes(directory);

  return generateUniqueLobbyCode(directory);
}

export function registerArcadeLobbyCode(
  code: string,
  game: ArcadeLobbyGame,
): void {
  const directory = getLobbyDirectory();

  cleanupExpiredArcadeLobbyCodes(directory);
  directory.set(normalizeLobbyCode(code), {
    game,
    createdAt: Date.now(),
  });
}

export function getArcadeLobbyGame(code: string): ArcadeLobbyGame | null {
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
