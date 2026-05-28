import {
  createHangmanLobby,
  getHangmanLobbyView,
  guessHangmanLetter,
  isHangmanPlayerId,
  joinHangmanLobby,
  normalizeHangmanLetter,
  readyHangmanPlayer,
  restartHangmanLobby,
  type HangmanLobby,
  type HangmanLobbyView,
  type HangmanPlayerId,
} from "@/lib/hangman";
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

export async function createHangmanLobbyForPlayer(
  playerName: string,
  rejoinToken: string,
): Promise<{
  lobby: HangmanLobbyView;
  playerId: HangmanPlayerId;
}> {
  const now = Date.now();
  await cleanupExpiredLobbyRecords(now);

  const code = await generateUniqueArcadeLobbyCode();
  const privateLobby = createHangmanLobby(
    code,
    playerName,
    now,
    undefined,
    createRejoinTokenHash(rejoinToken) ?? undefined,
  );
  const lobby = getHangmanLobbyView(privateLobby, "player-1");

  await saveStoredLobby("hangman", privateLobby);
  await registerArcadeLobbyCode(code, "hangman");

  if (!lobby) {
    throw new Error("Failed to create lobby.");
  }

  return {
    lobby,
    playerId: "player-1",
  };
}

export async function createHangmanLobbyForHostCode(
  code: string,
  playerName: string,
  rejoinToken: string,
): Promise<{
  lobby: HangmanLobbyView;
  playerId: HangmanPlayerId;
}> {
  const now = Date.now();
  await cleanupExpiredLobbyRecords(now);

  const normalizedCode = normalizeLobbyCode(code);
  const privateLobby = createHangmanLobby(
    normalizedCode,
    playerName,
    now,
    undefined,
    createRejoinTokenHash(rejoinToken) ?? undefined,
  );
  const lobby = getHangmanLobbyView(privateLobby, "player-1");

  await saveStoredLobby("hangman", privateLobby);
  await registerArcadeLobbyCode(normalizedCode, "hangman");

  if (!lobby) {
    throw new Error("Failed to create lobby.");
  }

  return {
    lobby,
    playerId: "player-1",
  };
}

export async function getHangmanLobbyByCode(
  code: string,
  playerId: string,
): Promise<LobbyResult<{
  lobby: HangmanLobbyView;
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

export async function joinHangmanLobbyByCode(
  code: string,
  playerName: string,
  rejoinToken: string,
): Promise<LobbyResult<{
  lobby: HangmanLobbyView;
  playerId: HangmanPlayerId;
}>> {
  const now = Date.now();

  const normalizedCode = normalizeLobbyCode(code);
  const lobby = await getStoredLobby<HangmanLobby>(normalizedCode, "hangman");

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
    const lobbyView = getHangmanLobbyView(nextLobby, rejoiningPlayer.id);

    if (!lobbyView) {
      return lobbyError(403, "Player is not in this lobby.");
    }

    await saveStoredLobby("hangman", nextLobby);

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

  const nextLobby = joinHangmanLobby(
    lobby,
    playerName,
    now,
    rejoinTokenHash,
  );
  const playerId = nextLobby.players.at(-1)?.id;

  if (!playerId) {
    return lobbyError(409, "Lobby is full.");
  }

  const lobbyView = getHangmanLobbyView(nextLobby, playerId);

  if (!lobbyView) {
    return lobbyError(403, "Player is not in this lobby.");
  }

  await saveStoredLobby("hangman", nextLobby);

  return {
    ok: true,
    data: {
      lobby: lobbyView,
      playerId,
    },
  };
}

export async function readyHangmanLobbyPlayer(
  code: string,
  playerId: string,
): Promise<LobbyResult<{
  lobby: HangmanLobbyView;
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

  const nextLobby = readyHangmanPlayer(
    authResult.data.lobby,
    authResult.data.playerId,
  );
  await saveStoredLobby("hangman", nextLobby);

  return getLobbyViewResult(nextLobby, authResult.data.playerId);
}

export async function guessHangmanLobbyLetter(
  code: string,
  playerId: string,
  letter: string,
): Promise<LobbyResult<{
  lobby: HangmanLobbyView;
}>> {
  const authResult = await getAuthorizedLobby(code, playerId);

  if (!authResult.ok) {
    return authResult;
  }

  const normalizedLetter = normalizeHangmanLetter(letter);

  if (!normalizedLetter) {
    return lobbyError(400, "Invalid letter.");
  }

  if (authResult.data.lobby.status !== "playing") {
    return lobbyError(409, "Round has not started.");
  }

  const nextLobby = guessHangmanLetter(
    authResult.data.lobby,
    authResult.data.playerId,
    normalizedLetter,
  );
  await saveStoredLobby("hangman", nextLobby);

  return getLobbyViewResult(nextLobby, authResult.data.playerId);
}

export async function restartHangmanLobbyRound(
  code: string,
  playerId: string,
): Promise<LobbyResult<{
  lobby: HangmanLobbyView;
}>> {
  const authResult = await getAuthorizedLobby(code, playerId);

  if (!authResult.ok) {
    return authResult;
  }

  const nextLobby = restartHangmanLobby(authResult.data.lobby);
  await saveStoredLobby("hangman", nextLobby);

  return getLobbyViewResult(nextLobby, authResult.data.playerId);
}

export async function deleteHangmanLobbyByCode(code: string): Promise<void> {
  await deleteStoredLobby(normalizeLobbyCode(code), "hangman");
}

export async function hasHangmanLobbyByCode(code: string): Promise<boolean> {
  return hasStoredLobbyByCode(normalizeLobbyCode(code), "hangman");
}

export async function isHangmanLobbyHost(
  code: string,
  rejoinToken: string,
): Promise<boolean> {
  const lobby = await getStoredLobby<HangmanLobby>(
    normalizeLobbyCode(code),
    "hangman",
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
  lobby: HangmanLobby;
  lobbyView: HangmanLobbyView;
  playerId: HangmanPlayerId;
}>> {
  const normalizedCode = normalizeLobbyCode(code);
  const lobby = await getStoredLobby<HangmanLobby>(normalizedCode, "hangman");

  if (!lobby) {
    return lobbyError(404, "Lobby not found.");
  }

  if (!isHangmanPlayerId(playerId)) {
    return lobbyError(400, "Invalid player.");
  }

  if (!lobby.players.some((player) => player.id === playerId)) {
    return lobbyError(403, "Player is not in this lobby.");
  }

  const lobbyView = getHangmanLobbyView(lobby, playerId);

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
  lobby: HangmanLobby,
  playerId: HangmanPlayerId,
): LobbyResult<{
  lobby: HangmanLobbyView;
}> {
  const lobbyView = getHangmanLobbyView(lobby, playerId);

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
