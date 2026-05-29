import {
  createWordSearchLobby,
  getWordSearchLobbyView,
  isValidWordSearchPosition,
  isWordSearchPlayerId,
  joinWordSearchLobby,
  readyWordSearchPlayer,
  restartWordSearchLobby,
  submitWordSearchSelection,
  type WordSearchCellPosition,
  type WordSearchLobby,
  type WordSearchLobbyView,
  type WordSearchPlayerId,
} from "@/lib/word-search";
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

export async function createWordSearchLobbyForPlayer(
  playerName: string,
  rejoinToken: string,
): Promise<{
  lobby: WordSearchLobbyView;
  playerId: WordSearchPlayerId;
}> {
  const now = Date.now();
  await cleanupExpiredLobbyRecords(now);

  const code = await generateUniqueArcadeLobbyCode();
  const privateLobby = createWordSearchLobby(
    code,
    playerName,
    now,
    undefined,
    createRejoinTokenHash(rejoinToken) ?? undefined,
  );
  const lobby = getWordSearchLobbyView(privateLobby, "player-1");

  await saveStoredLobby("word-search", privateLobby);
  await registerArcadeLobbyCode(code, "word-search");

  if (!lobby) {
    throw new Error("Failed to create lobby.");
  }

  return {
    lobby,
    playerId: "player-1",
  };
}

export async function createWordSearchLobbyForHostCode(
  code: string,
  playerName: string,
  rejoinToken: string,
): Promise<{
  lobby: WordSearchLobbyView;
  playerId: WordSearchPlayerId;
}> {
  const now = Date.now();
  await cleanupExpiredLobbyRecords(now);

  const normalizedCode = normalizeLobbyCode(code);
  const privateLobby = createWordSearchLobby(
    normalizedCode,
    playerName,
    now,
    undefined,
    createRejoinTokenHash(rejoinToken) ?? undefined,
  );
  const lobby = getWordSearchLobbyView(privateLobby, "player-1");

  await saveStoredLobby("word-search", privateLobby);
  await registerArcadeLobbyCode(normalizedCode, "word-search");

  if (!lobby) {
    throw new Error("Failed to create lobby.");
  }

  return {
    lobby,
    playerId: "player-1",
  };
}

export async function getWordSearchLobbyByCode(
  code: string,
  playerId: string,
): Promise<LobbyResult<{
  lobby: WordSearchLobbyView;
}>> {
  const authResult = await getAuthorizedLobby(code, playerId);

  if (!authResult.ok) {
    return authResult;
  }

  return {
    ok: true,
    data: {
      lobby: authResult.data.lobbyView,
    },
  };
}

export async function joinWordSearchLobbyByCode(
  code: string,
  playerName: string,
  rejoinToken: string,
): Promise<LobbyResult<{
  lobby: WordSearchLobbyView;
  playerId: WordSearchPlayerId;
}>> {
  const now = Date.now();
  const normalizedCode = normalizeLobbyCode(code);
  const lobby = await getStoredLobby<WordSearchLobby>(
    normalizedCode,
    "word-search",
  );

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
    const lobbyView = getWordSearchLobbyView(nextLobby, rejoiningPlayer.id);

    if (!lobbyView) {
      return lobbyError(403, "Player is not in this lobby.");
    }

    await saveStoredLobby("word-search", nextLobby);

    return {
      ok: true,
      data: {
        lobby: lobbyView,
        playerId: rejoiningPlayer.id,
      },
    };
  }

  if (lobby.players.length >= 2) {
    return lobbyError(409, "Lobby is full.");
  }

  if (lobby.status !== "waiting" && lobby.status !== "readying") {
    return lobbyError(409, "Game already started.");
  }

  const nextLobby = joinWordSearchLobby(
    lobby,
    playerName,
    now,
    rejoinTokenHash,
  );
  const playerId = nextLobby.players.at(-1)?.id;

  if (!playerId) {
    return lobbyError(409, "Lobby is full.");
  }

  const lobbyView = getWordSearchLobbyView(nextLobby, playerId);

  if (!lobbyView) {
    return lobbyError(403, "Player is not in this lobby.");
  }

  await saveStoredLobby("word-search", nextLobby);

  return {
    ok: true,
    data: {
      lobby: lobbyView,
      playerId,
    },
  };
}

export async function readyWordSearchLobbyPlayer(
  code: string,
  playerId: string,
): Promise<LobbyResult<{
  lobby: WordSearchLobbyView;
}>> {
  const authResult = await getAuthorizedLobby(code, playerId);

  if (!authResult.ok) {
    return authResult;
  }

  if (
    authResult.data.lobby.status !== "waiting" &&
    authResult.data.lobby.status !== "readying"
  ) {
    return lobbyError(409, "Round already started.");
  }

  const nextLobby = readyWordSearchPlayer(
    authResult.data.lobby,
    authResult.data.playerId,
  );
  await saveStoredLobby("word-search", nextLobby);

  return getLobbyViewResult(nextLobby, authResult.data.playerId);
}

export async function submitWordSearchLobbySelection(
  code: string,
  playerId: string,
  start: WordSearchCellPosition,
  end: WordSearchCellPosition,
): Promise<LobbyResult<{
  lobby: WordSearchLobbyView;
}>> {
  const authResult = await getAuthorizedLobby(code, playerId);

  if (!authResult.ok) {
    return authResult;
  }

  if (!isValidWordSearchPosition(start) || !isValidWordSearchPosition(end)) {
    return lobbyError(400, "Invalid selection.");
  }

  if (authResult.data.lobby.status !== "playing") {
    return lobbyError(409, "Round has not started.");
  }

  const nextLobby = submitWordSearchSelection(
    authResult.data.lobby,
    authResult.data.playerId,
    start,
    end,
  );
  await saveStoredLobby("word-search", nextLobby);

  return getLobbyViewResult(nextLobby, authResult.data.playerId);
}

export async function restartWordSearchLobbyRound(
  code: string,
  playerId: string,
): Promise<LobbyResult<{
  lobby: WordSearchLobbyView;
}>> {
  const authResult = await getAuthorizedLobby(code, playerId);

  if (!authResult.ok) {
    return authResult;
  }

  const nextLobby = restartWordSearchLobby(authResult.data.lobby);
  await saveStoredLobby("word-search", nextLobby);

  return getLobbyViewResult(nextLobby, authResult.data.playerId);
}

export async function deleteWordSearchLobbyByCode(
  code: string,
): Promise<void> {
  await deleteStoredLobby(normalizeLobbyCode(code), "word-search");
}

export async function leaveWordSearchLobbyByCode(
  code: string,
  playerId: string,
  rejoinToken: string,
): Promise<LobbyResult<{
  didCloseLobby: boolean;
}>> {
  const authResult = await getAuthorizedLobby(code, playerId);

  if (!authResult.ok) {
    return authResult;
  }

  if (isHostPlayerLeaving(authResult.data.lobby, playerId, rejoinToken)) {
    await deleteWordSearchLobbyByCode(code);

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

export async function hasWordSearchLobbyByCode(
  code: string,
): Promise<boolean> {
  return hasStoredLobbyByCode(normalizeLobbyCode(code), "word-search");
}

export async function isWordSearchLobbyHost(
  code: string,
  rejoinToken: string,
): Promise<boolean> {
  const lobby = await getStoredLobby<WordSearchLobby>(
    normalizeLobbyCode(code),
    "word-search",
  );
  const rejoinTokenHash = createRejoinTokenHash(rejoinToken);

  return Boolean(
    lobby?.players[0]?.id === "player-1" &&
      rejoinTokenHash &&
      lobby.players[0].rejoinTokenHash === rejoinTokenHash,
  );
}

async function getAuthorizedLobby(
  code: string,
  playerId: string,
): Promise<LobbyResult<{
  lobby: WordSearchLobby;
  lobbyView: WordSearchLobbyView;
  playerId: WordSearchPlayerId;
}>> {
  const normalizedCode = normalizeLobbyCode(code);
  const lobby = await getStoredLobby<WordSearchLobby>(
    normalizedCode,
    "word-search",
  );

  if (!lobby) {
    return lobbyError(404, "Lobby not found.");
  }

  if (!isWordSearchPlayerId(playerId)) {
    return lobbyError(400, "Invalid player.");
  }

  if (!lobby.players.some((player) => player.id === playerId)) {
    return lobbyError(403, "Player is not in this lobby.");
  }

  const lobbyView = getWordSearchLobbyView(lobby, playerId);

  if (!lobbyView) {
    return lobbyError(403, "Player is not in this lobby.");
  }

  return {
    ok: true,
    data: {
      lobby,
      lobbyView,
      playerId,
    },
  };
}

function getLobbyViewResult(
  lobby: WordSearchLobby,
  playerId: WordSearchPlayerId,
): LobbyResult<{
  lobby: WordSearchLobbyView;
}> {
  const lobbyView = getWordSearchLobbyView(lobby, playerId);

  if (!lobbyView) {
    return lobbyError(403, "Player is not in this lobby.");
  }

  return {
    ok: true,
    data: {
      lobby: lobbyView,
    },
  };
}

function isHostPlayerLeaving(
  lobby: WordSearchLobby,
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
