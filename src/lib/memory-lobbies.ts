import {
  createMemoryLobby,
  flipMemoryCard,
  isMemoryPlayerId,
  joinMemoryLobby,
  readyMemoryPlayer,
  restartMemoryLobby,
  settleMemoryLobby,
  type MemoryLobby,
  type MemoryPlayerId,
} from "@/lib/memory";
import {
  cleanupExpiredLobbies,
  lobbyError,
  normalizeLobbyCode,
  type LobbyResult,
} from "@/lib/lobby-utils";
import { createRejoinTokenHash } from "@/lib/lobby-server";
import {
  generateUniqueArcadeLobbyCode,
  registerArcadeLobbyCode,
} from "@/lib/arcade-lobby-directory";

const globalForMemory = globalThis as typeof globalThis & {
  __miniArcadeMemoryLobbies?: Map<string, MemoryLobby>;
};

export function createLobbyForPlayer(
  playerName: string,
  rejoinToken: string,
): {
  lobby: MemoryLobby;
  playerId: MemoryPlayerId;
} {
  const lobbies = getLobbyStore();
  const now = Date.now();
  cleanupExpiredLobbies(lobbies, now);

  const code = generateUniqueArcadeLobbyCode();
  const lobby = createMemoryLobby(
    code,
    playerName,
    now,
    createRejoinTokenHash(rejoinToken) ?? undefined,
  );
  lobbies.set(code, lobby);
  registerArcadeLobbyCode(code, "memory");

  return {
    lobby,
    playerId: "player-1",
  };
}

export function createLobbyForHostCode(
  code: string,
  playerName: string,
  rejoinToken: string,
): {
  lobby: MemoryLobby;
  playerId: MemoryPlayerId;
} {
  const lobbies = getLobbyStore();
  const now = Date.now();
  cleanupExpiredLobbies(lobbies, now);

  const normalizedCode = normalizeLobbyCode(code);
  const lobby = createMemoryLobby(
    normalizedCode,
    playerName,
    now,
    createRejoinTokenHash(rejoinToken) ?? undefined,
  );

  lobbies.set(normalizedCode, lobby);
  registerArcadeLobbyCode(normalizedCode, "memory");

  return {
    lobby,
    playerId: "player-1",
  };
}

export function getLobbyByCode(code: string): LobbyResult<{
  lobby: MemoryLobby;
}> {
  const lobbies = getLobbyStore();
  const now = Date.now();
  cleanupExpiredLobbies(lobbies, now);

  const normalizedCode = normalizeLobbyCode(code);
  const lobby = lobbies.get(normalizedCode);

  if (!lobby) {
    return lobbyError(404, "Lobby not found.");
  }

  const settledLobby = settleMemoryLobby(lobby);
  lobbies.set(normalizedCode, settledLobby);

  return {
    ok: true,
    data: {
      lobby: settledLobby,
    },
  };
}

export function joinLobbyByCode(
  code: string,
  playerName: string,
  rejoinToken: string,
): LobbyResult<{
  lobby: MemoryLobby;
  playerId: MemoryPlayerId;
}> {
  const lobbies = getLobbyStore();
  const now = Date.now();
  cleanupExpiredLobbies(lobbies, now);

  const normalizedCode = normalizeLobbyCode(code);
  const lobby = lobbies.get(normalizedCode);

  if (!lobby) {
    return lobbyError(404, "Lobby not found.");
  }

  const rejoinTokenHash = createRejoinTokenHash(rejoinToken) ?? undefined;
  const rejoiningPlayer = rejoinTokenHash
    ? lobby.players.find((player) => player.rejoinTokenHash === rejoinTokenHash)
    : null;

  if (rejoiningPlayer) {
    const nextLobby = {
      ...lobby,
      updatedAt: now,
    };

    lobbies.set(normalizedCode, nextLobby);

    return {
      ok: true,
      data: {
        lobby: nextLobby,
        playerId: rejoiningPlayer.id,
      },
    };
  }

  if (lobby.players.length >= 2) {
    return lobbyError(409, "Lobby is full.");
  }

  const nextLobby = joinMemoryLobby(lobby, playerName, now, rejoinTokenHash);
  const playerId = nextLobby.players.at(-1)?.id;

  if (!playerId) {
    return lobbyError(409, "Lobby is full.");
  }

  lobbies.set(normalizedCode, nextLobby);

  return {
    ok: true,
    data: {
      lobby: nextLobby,
      playerId,
    },
  };
}

export function flipLobbyCard(
  code: string,
  playerId: string,
  cardId: string,
): LobbyResult<{
  lobby: MemoryLobby;
}> {
  const lobbyResult = getLobbyByCode(code);

  if (!lobbyResult.ok) {
    return lobbyResult;
  }

  if (!isMemoryPlayerId(playerId)) {
    return lobbyError(400, "Invalid player.");
  }

  const { lobby } = lobbyResult.data;

  if (!lobby.players.some((player) => player.id === playerId)) {
    return lobbyError(403, "Player is not in this lobby.");
  }

  if (!lobby.cards.some((card) => card.id === cardId)) {
    return lobbyError(400, "Card not found.");
  }

  const nextLobby = flipMemoryCard(lobby, playerId, cardId);
  getLobbyStore().set(lobby.code, nextLobby);

  return {
    ok: true,
    data: {
      lobby: nextLobby,
    },
  };
}

export function readyLobbyPlayer(
  code: string,
  playerId: string,
): LobbyResult<{
  lobby: MemoryLobby;
}> {
  const lobbyResult = getLobbyByCode(code);

  if (!lobbyResult.ok) {
    return lobbyResult;
  }

  if (!isMemoryPlayerId(playerId)) {
    return lobbyError(400, "Invalid player.");
  }

  const { lobby } = lobbyResult.data;

  if (!lobby.players.some((player) => player.id === playerId)) {
    return lobbyError(403, "Player is not in this lobby.");
  }

  if (lobby.status !== "waiting" && lobby.status !== "readying") {
    return lobbyError(409, "Round already started.");
  }

  const nextLobby = readyMemoryPlayer(lobby, playerId);
  getLobbyStore().set(lobby.code, nextLobby);

  return {
    ok: true,
    data: {
      lobby: nextLobby,
    },
  };
}

export function restartLobby(
  code: string,
  playerId: string,
): LobbyResult<{
  lobby: MemoryLobby;
}> {
  const lobbyResult = getLobbyByCode(code);

  if (!lobbyResult.ok) {
    return lobbyResult;
  }

  if (!isMemoryPlayerId(playerId)) {
    return lobbyError(400, "Invalid player.");
  }

  const { lobby } = lobbyResult.data;

  if (!lobby.players.some((player) => player.id === playerId)) {
    return lobbyError(403, "Player is not in this lobby.");
  }

  const nextLobby = restartMemoryLobby(lobby);
  getLobbyStore().set(lobby.code, nextLobby);

  return {
    ok: true,
    data: {
      lobby: nextLobby,
    },
  };
}

export function deleteLobbyByCode(code: string): void {
  getLobbyStore().delete(normalizeLobbyCode(code));
}

export function isMemoryLobbyHost(code: string, rejoinToken: string): boolean {
  const lobby = getLobbyStore().get(normalizeLobbyCode(code));
  const rejoinTokenHash = createRejoinTokenHash(rejoinToken);

  return Boolean(
    lobby?.players[0]?.id === "player-1" &&
      rejoinTokenHash &&
      lobby.players[0].rejoinTokenHash === rejoinTokenHash,
  );
}

function getLobbyStore(): Map<string, MemoryLobby> {
  globalForMemory.__miniArcadeMemoryLobbies ??= new Map();

  return globalForMemory.__miniArcadeMemoryLobbies;
}
