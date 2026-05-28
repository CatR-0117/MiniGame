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
  lobbyError,
  normalizeLobbyCode,
  type LobbyResult,
} from "@/lib/lobby-utils";
import { createRejoinTokenHash } from "@/lib/lobby-server";
import {
  generateUniqueArcadeLobbyCode,
  registerArcadeLobbyCode,
} from "@/lib/arcade-lobby-directory";
import {
  cleanupExpiredLobbyRecords,
  deleteStoredLobby,
  getStoredLobby,
  hasStoredLobbyByCode,
  saveStoredLobby,
} from "@/lib/lobby-store";

export async function createLobbyForPlayer(
  playerName: string,
  rejoinToken: string,
): Promise<{
  lobby: MemoryLobby;
  playerId: MemoryPlayerId;
}> {
  const now = Date.now();
  await cleanupExpiredLobbyRecords(now);

  const code = await generateUniqueArcadeLobbyCode();
  const lobby = createMemoryLobby(
    code,
    playerName,
    now,
    createRejoinTokenHash(rejoinToken) ?? undefined,
  );
  await saveStoredLobby("memory", lobby);
  await registerArcadeLobbyCode(code, "memory");

  return {
    lobby,
    playerId: "player-1",
  };
}

export async function createLobbyForHostCode(
  code: string,
  playerName: string,
  rejoinToken: string,
): Promise<{
  lobby: MemoryLobby;
  playerId: MemoryPlayerId;
}> {
  const now = Date.now();
  await cleanupExpiredLobbyRecords(now);

  const normalizedCode = normalizeLobbyCode(code);
  const lobby = createMemoryLobby(
    normalizedCode,
    playerName,
    now,
    createRejoinTokenHash(rejoinToken) ?? undefined,
  );

  await saveStoredLobby("memory", lobby);
  await registerArcadeLobbyCode(normalizedCode, "memory");

  return {
    lobby,
    playerId: "player-1",
  };
}

export async function getLobbyByCode(code: string): Promise<LobbyResult<{
  lobby: MemoryLobby;
}>> {
  const normalizedCode = normalizeLobbyCode(code);
  const lobby = await getStoredLobby<MemoryLobby>(normalizedCode, "memory");

  if (!lobby) {
    return lobbyError(404, "Lobby not found.");
  }

  const settledLobby = settleMemoryLobby(lobby);
  await saveStoredLobby("memory", settledLobby);

  return {
    ok: true,
    data: {
      lobby: settledLobby,
    },
  };
}

export async function joinLobbyByCode(
  code: string,
  playerName: string,
  rejoinToken: string,
): Promise<LobbyResult<{
  lobby: MemoryLobby;
  playerId: MemoryPlayerId;
}>> {
  const now = Date.now();

  const normalizedCode = normalizeLobbyCode(code);
  const lobby = await getStoredLobby<MemoryLobby>(normalizedCode, "memory");

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

    await saveStoredLobby("memory", nextLobby);

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

  await saveStoredLobby("memory", nextLobby);

  return {
    ok: true,
    data: {
      lobby: nextLobby,
      playerId,
    },
  };
}

export async function flipLobbyCard(
  code: string,
  playerId: string,
  cardId: string,
): Promise<LobbyResult<{
  lobby: MemoryLobby;
}>> {
  const lobbyResult = await getLobbyByCode(code);

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
  await saveStoredLobby("memory", nextLobby);

  return {
    ok: true,
    data: {
      lobby: nextLobby,
    },
  };
}

export async function readyLobbyPlayer(
  code: string,
  playerId: string,
): Promise<LobbyResult<{
  lobby: MemoryLobby;
}>> {
  const lobbyResult = await getLobbyByCode(code);

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
  await saveStoredLobby("memory", nextLobby);

  return {
    ok: true,
    data: {
      lobby: nextLobby,
    },
  };
}

export async function restartLobby(
  code: string,
  playerId: string,
): Promise<LobbyResult<{
  lobby: MemoryLobby;
}>> {
  const lobbyResult = await getLobbyByCode(code);

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
  await saveStoredLobby("memory", nextLobby);

  return {
    ok: true,
    data: {
      lobby: nextLobby,
    },
  };
}

export async function deleteLobbyByCode(code: string): Promise<void> {
  await deleteStoredLobby(normalizeLobbyCode(code), "memory");
}

export async function leaveLobbyByCode(
  code: string,
  playerId: string,
  rejoinToken: string,
): Promise<LobbyResult<{
  didCloseLobby: boolean;
}>> {
  const lobbyResult = await getLobbyByCode(code);

  if (!lobbyResult.ok) {
    return lobbyResult;
  }

  const { lobby } = lobbyResult.data;

  if (!isMemoryPlayerId(playerId)) {
    return lobbyError(400, "Invalid player.");
  }

  if (!lobby.players.some((player) => player.id === playerId)) {
    return lobbyError(403, "Player is not in this lobby.");
  }

  if (isHostPlayerLeaving(lobby, playerId, rejoinToken)) {
    await deleteLobbyByCode(code);

    return {
      ok: true,
      data: {
        didCloseLobby: true,
      },
    };
  }

  return {
    ok: true,
    data: {
      didCloseLobby: false,
    },
  };
}

export async function hasMemoryLobbyByCode(code: string): Promise<boolean> {
  return hasStoredLobbyByCode(normalizeLobbyCode(code), "memory");
}

export async function isMemoryLobbyHost(
  code: string,
  rejoinToken: string,
): Promise<boolean> {
  const lobby = await getStoredLobby<MemoryLobby>(
    normalizeLobbyCode(code),
    "memory",
  );
  const rejoinTokenHash = createRejoinTokenHash(rejoinToken);

  return Boolean(
    lobby?.players[0]?.id === "player-1" &&
      rejoinTokenHash &&
      lobby.players[0].rejoinTokenHash === rejoinTokenHash,
  );
}

function isHostPlayerLeaving(
  lobby: MemoryLobby,
  playerId: string,
  rejoinToken: string,
): boolean {
  const rejoinTokenHash = createRejoinTokenHash(rejoinToken);

  return Boolean(
    playerId === "player-1" &&
      lobby.players[0]?.id === "player-1" &&
      rejoinTokenHash &&
      lobby.players[0].rejoinTokenHash === rejoinTokenHash,
  );
}
