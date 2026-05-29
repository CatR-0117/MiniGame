import {
  createWordScrambleLobby,
  getWordScrambleLobbyView,
  isWordScramblePlayerId,
  joinWordScrambleLobby,
  normalizeWordScrambleGuess,
  readyWordScramblePlayer,
  restartWordScrambleLobby,
  submitWordScrambleGuess,
  type WordScrambleLobby,
  type WordScrambleLobbyView,
  type WordScramblePlayerId,
} from "@/lib/word-scramble";
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

export async function createWordScrambleLobbyForPlayer(
  playerName: string,
  rejoinToken: string,
): Promise<{
  lobby: WordScrambleLobbyView;
  playerId: WordScramblePlayerId;
}> {
  const now = Date.now();
  await cleanupExpiredLobbyRecords(now);

  const code = await generateUniqueArcadeLobbyCode();
  const privateLobby = createWordScrambleLobby(
    code,
    playerName,
    now,
    undefined,
    undefined,
    createRejoinTokenHash(rejoinToken) ?? undefined,
  );
  const lobby = getWordScrambleLobbyView(privateLobby, "player-1");

  await saveStoredLobby("word-scramble", privateLobby);
  await registerArcadeLobbyCode(code, "word-scramble");

  if (!lobby) {
    throw new Error("Failed to create lobby.");
  }

  return {
    lobby,
    playerId: "player-1",
  };
}

export async function createWordScrambleLobbyForHostCode(
  code: string,
  playerName: string,
  rejoinToken: string,
): Promise<{
  lobby: WordScrambleLobbyView;
  playerId: WordScramblePlayerId;
}> {
  const now = Date.now();
  await cleanupExpiredLobbyRecords(now);

  const normalizedCode = normalizeLobbyCode(code);
  const privateLobby = createWordScrambleLobby(
    normalizedCode,
    playerName,
    now,
    undefined,
    undefined,
    createRejoinTokenHash(rejoinToken) ?? undefined,
  );
  const lobby = getWordScrambleLobbyView(privateLobby, "player-1");

  await saveStoredLobby("word-scramble", privateLobby);
  await registerArcadeLobbyCode(normalizedCode, "word-scramble");

  if (!lobby) {
    throw new Error("Failed to create lobby.");
  }

  return {
    lobby,
    playerId: "player-1",
  };
}

export async function getWordScrambleLobbyByCode(
  code: string,
  playerId: string,
): Promise<LobbyResult<{
  lobby: WordScrambleLobbyView;
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

export async function joinWordScrambleLobbyByCode(
  code: string,
  playerName: string,
  rejoinToken: string,
): Promise<LobbyResult<{
  lobby: WordScrambleLobbyView;
  playerId: WordScramblePlayerId;
}>> {
  const now = Date.now();
  const normalizedCode = normalizeLobbyCode(code);
  const lobby = await getStoredLobby<WordScrambleLobby>(
    normalizedCode,
    "word-scramble",
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
    const lobbyView = getWordScrambleLobbyView(nextLobby, rejoiningPlayer.id);

    if (!lobbyView) {
      return lobbyError(403, "Player is not in this lobby.");
    }

    await saveStoredLobby("word-scramble", nextLobby);

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

  const nextLobby = joinWordScrambleLobby(
    lobby,
    playerName,
    now,
    rejoinTokenHash,
  );
  const playerId = nextLobby.players.at(-1)?.id;

  if (!playerId) {
    return lobbyError(409, "Lobby is full.");
  }

  const lobbyView = getWordScrambleLobbyView(nextLobby, playerId);

  if (!lobbyView) {
    return lobbyError(403, "Player is not in this lobby.");
  }

  await saveStoredLobby("word-scramble", nextLobby);

  return {
    ok: true,
    data: {
      lobby: lobbyView,
      playerId,
    },
  };
}

export async function readyWordScrambleLobbyPlayer(
  code: string,
  playerId: string,
): Promise<LobbyResult<{
  lobby: WordScrambleLobbyView;
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

  const nextLobby = readyWordScramblePlayer(
    authResult.data.lobby,
    authResult.data.playerId,
  );
  await saveStoredLobby("word-scramble", nextLobby);

  return getLobbyViewResult(nextLobby, authResult.data.playerId);
}

export async function submitWordScrambleLobbyGuess(
  code: string,
  playerId: string,
  guess: string,
): Promise<LobbyResult<{
  lobby: WordScrambleLobbyView;
}>> {
  const authResult = await getAuthorizedLobby(code, playerId);

  if (!authResult.ok) {
    return authResult;
  }

  const normalizedGuess = normalizeWordScrambleGuess(guess);

  if (!normalizedGuess) {
    return lobbyError(400, "Invalid guess.");
  }

  if (authResult.data.lobby.status !== "playing") {
    return lobbyError(409, "Round has not started.");
  }

  const nextLobby = submitWordScrambleGuess(
    authResult.data.lobby,
    authResult.data.playerId,
    normalizedGuess,
  );
  await saveStoredLobby("word-scramble", nextLobby);

  return getLobbyViewResult(nextLobby, authResult.data.playerId);
}

export async function restartWordScrambleLobbyRound(
  code: string,
  playerId: string,
): Promise<LobbyResult<{
  lobby: WordScrambleLobbyView;
}>> {
  const authResult = await getAuthorizedLobby(code, playerId);

  if (!authResult.ok) {
    return authResult;
  }

  const nextLobby = restartWordScrambleLobby(authResult.data.lobby);
  await saveStoredLobby("word-scramble", nextLobby);

  return getLobbyViewResult(nextLobby, authResult.data.playerId);
}

export async function deleteWordScrambleLobbyByCode(
  code: string,
): Promise<void> {
  await deleteStoredLobby(normalizeLobbyCode(code), "word-scramble");
}

export async function leaveWordScrambleLobbyByCode(
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
    await deleteWordScrambleLobbyByCode(code);

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

export async function hasWordScrambleLobbyByCode(
  code: string,
): Promise<boolean> {
  return hasStoredLobbyByCode(normalizeLobbyCode(code), "word-scramble");
}

export async function isWordScrambleLobbyHost(
  code: string,
  rejoinToken: string,
): Promise<boolean> {
  const lobby = await getStoredLobby<WordScrambleLobby>(
    normalizeLobbyCode(code),
    "word-scramble",
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
  lobby: WordScrambleLobby;
  lobbyView: WordScrambleLobbyView;
  playerId: WordScramblePlayerId;
}>> {
  const normalizedCode = normalizeLobbyCode(code);
  const lobby = await getStoredLobby<WordScrambleLobby>(
    normalizedCode,
    "word-scramble",
  );

  if (!lobby) {
    return lobbyError(404, "Lobby not found.");
  }

  if (!isWordScramblePlayerId(playerId)) {
    return lobbyError(400, "Invalid player.");
  }

  if (!lobby.players.some((player) => player.id === playerId)) {
    return lobbyError(403, "Player is not in this lobby.");
  }

  const lobbyView = getWordScrambleLobbyView(lobby, playerId);

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
  lobby: WordScrambleLobby,
  playerId: WordScramblePlayerId,
): LobbyResult<{
  lobby: WordScrambleLobbyView;
}> {
  const lobbyView = getWordScrambleLobbyView(lobby, playerId);

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
  lobby: WordScrambleLobby,
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
