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
  cleanupExpiredLobbies,
  lobbyError,
  normalizeLobbyCode,
  type LobbyResult,
} from "@/lib/lobby-utils";
import {
  generateUniqueArcadeLobbyCode,
  registerArcadeLobbyCode,
} from "@/lib/arcade-lobby-directory";

const globalForHangman = globalThis as typeof globalThis & {
  __miniArcadeHangmanLobbies?: Map<string, HangmanLobby>;
};

export function createHangmanLobbyForPlayer(playerName: string): {
  lobby: HangmanLobbyView;
  playerId: HangmanPlayerId;
} {
  const lobbies = getLobbyStore();
  const now = Date.now();
  cleanupExpiredLobbies(lobbies, now);

  const code = generateUniqueArcadeLobbyCode();
  const privateLobby = createHangmanLobby(code, playerName, now);
  const lobby = getHangmanLobbyView(privateLobby, "player-1");

  lobbies.set(code, privateLobby);
  registerArcadeLobbyCode(code, "hangman");

  if (!lobby) {
    throw new Error("Failed to create lobby.");
  }

  return {
    lobby,
    playerId: "player-1",
  };
}

export function getHangmanLobbyByCode(
  code: string,
  playerId: string,
): LobbyResult<{
  lobby: HangmanLobbyView;
}> {
  const authResult = getAuthorizedLobby(code, playerId);

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

export function joinHangmanLobbyByCode(
  code: string,
  playerName: string,
): LobbyResult<{
  lobby: HangmanLobbyView;
  playerId: HangmanPlayerId;
}> {
  const lobbies = getLobbyStore();
  const normalizedCode = normalizeLobbyCode(code);
  const lobby = lobbies.get(normalizedCode);

  if (!lobby) {
    return lobbyError(404, "Lobby not found.");
  }

  if (lobby.players.length >= 2) {
    return lobbyError(409, "Lobby is full.");
  }

  if (lobby.status !== "waiting" && lobby.status !== "readying") {
    return lobbyError(409, "Game already started.");
  }

  const nextLobby = joinHangmanLobby(lobby, playerName);
  const playerId = nextLobby.players.at(-1)?.id;

  if (!playerId) {
    return lobbyError(409, "Lobby is full.");
  }

  const lobbyView = getHangmanLobbyView(nextLobby, playerId);

  if (!lobbyView) {
    return lobbyError(403, "Player is not in this lobby.");
  }

  lobbies.set(normalizedCode, nextLobby);

  return {
    ok: true,
    data: {
      lobby: lobbyView,
      playerId,
    },
  };
}

export function readyHangmanLobbyPlayer(
  code: string,
  playerId: string,
): LobbyResult<{
  lobby: HangmanLobbyView;
}> {
  const authResult = getAuthorizedLobby(code, playerId);

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
  getLobbyStore().set(nextLobby.code, nextLobby);

  return getLobbyViewResult(nextLobby, authResult.data.playerId);
}

export function guessHangmanLobbyLetter(
  code: string,
  playerId: string,
  letter: string,
): LobbyResult<{
  lobby: HangmanLobbyView;
}> {
  const authResult = getAuthorizedLobby(code, playerId);

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
  getLobbyStore().set(nextLobby.code, nextLobby);

  return getLobbyViewResult(nextLobby, authResult.data.playerId);
}

export function restartHangmanLobbyRound(
  code: string,
  playerId: string,
): LobbyResult<{
  lobby: HangmanLobbyView;
}> {
  const authResult = getAuthorizedLobby(code, playerId);

  if (!authResult.ok) {
    return authResult;
  }

  const nextLobby = restartHangmanLobby(authResult.data.lobby);
  getLobbyStore().set(nextLobby.code, nextLobby);

  return getLobbyViewResult(nextLobby, authResult.data.playerId);
}

function getAuthorizedLobby(
  code: string,
  playerId: string,
): LobbyResult<{
  lobby: HangmanLobby;
  lobbyView: HangmanLobbyView;
  playerId: HangmanPlayerId;
}> {
  const lobbies = getLobbyStore();
  const normalizedCode = normalizeLobbyCode(code);
  const lobby = lobbies.get(normalizedCode);

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

function getLobbyStore(): Map<string, HangmanLobby> {
  globalForHangman.__miniArcadeHangmanLobbies ??= new Map();

  return globalForHangman.__miniArcadeHangmanLobbies;
}
