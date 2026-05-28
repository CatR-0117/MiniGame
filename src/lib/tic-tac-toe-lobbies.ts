import {
  createGameState,
  gameReducer,
  type GameState,
  type Player,
} from "@/lib/game";
import {
  cleanupExpiredLobbies,
  lobbyError,
  normalizeLobbyCode,
  sanitizePlayerName,
  type LobbyResult,
} from "@/lib/lobby-utils";
import {
  generateUniqueArcadeLobbyCode,
  registerArcadeLobbyCode,
} from "@/lib/arcade-lobby-directory";

export type TicTacToeLobbyStatus =
  | "waiting"
  | "readying"
  | "playing"
  | "finished";

export type TicTacToeLobbyPlayer = {
  id: Player;
  name: string;
  isReady: boolean;
};

export type TicTacToeLobby = {
  code: string;
  players: TicTacToeLobbyPlayer[];
  game: GameState;
  status: TicTacToeLobbyStatus;
  createdAt: number;
  updatedAt: number;
};

const globalForTicTacToe = globalThis as typeof globalThis & {
  __miniArcadeTicTacToeLobbies?: Map<string, TicTacToeLobby>;
};

export function createTicTacToeLobbyForPlayer(playerName: string): {
  lobby: TicTacToeLobby;
  playerId: Player;
} {
  const lobbies = getLobbyStore();
  const now = Date.now();
  cleanupExpiredLobbies(lobbies, now);

  const code = generateUniqueArcadeLobbyCode();
  const lobby = createTicTacToeLobby(code, playerName, now);
  lobbies.set(code, lobby);
  registerArcadeLobbyCode(code, "tic-tac-toe");

  return {
    lobby,
    playerId: "X",
  };
}

export function getTicTacToeLobbyByCode(code: string): LobbyResult<{
  lobby: TicTacToeLobby;
}> {
  const lobbies = getLobbyStore();
  const normalizedCode = normalizeLobbyCode(code);
  const lobby = lobbies.get(normalizedCode);

  if (!lobby) {
    return lobbyError(404, "Lobby not found.");
  }

  return {
    ok: true,
    data: {
      lobby,
    },
  };
}

export function joinTicTacToeLobbyByCode(
  code: string,
  playerName: string,
): LobbyResult<{
  lobby: TicTacToeLobby;
  playerId: Player;
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

  const nextLobby: TicTacToeLobby = {
    ...lobby,
    players: [
      ...lobby.players,
      {
        id: "O",
        name: sanitizePlayerName(playerName, "Player O"),
        isReady: false,
      },
    ],
    status: "readying",
    updatedAt: Date.now(),
  };

  lobbies.set(normalizedCode, nextLobby);

  return {
    ok: true,
    data: {
      lobby: nextLobby,
      playerId: "O",
    },
  };
}

export function placeTicTacToeLobbyMark(
  code: string,
  playerId: string,
  index: number,
): LobbyResult<{
  lobby: TicTacToeLobby;
}> {
  const lobbyResult = getTicTacToeLobbyByCode(code);

  if (!lobbyResult.ok) {
    return lobbyResult;
  }

  if (!isTicTacToePlayerId(playerId)) {
    return lobbyError(400, "Invalid player.");
  }

  if (!Number.isInteger(index) || index < 0 || index > 8) {
    return lobbyError(400, "Invalid board cell.");
  }

  const { lobby } = lobbyResult.data;

  if (!lobby.players.some((player) => player.id === playerId)) {
    return lobbyError(403, "Player is not in this lobby.");
  }

  if (lobby.status !== "playing") {
    return lobbyError(409, "Game is not ready.");
  }

  if (lobby.game.round.currentPlayer !== playerId) {
    return lobbyError(409, "It is not your turn.");
  }

  if (lobby.game.round.board[index] !== null) {
    return lobbyError(409, "That cell is already taken.");
  }

  const game = gameReducer(lobby.game, {
    type: "PLACE_MARK",
    player: playerId,
    index,
  });
  const nextLobby = updateLobbyGame(lobby, game);
  getLobbyStore().set(lobby.code, nextLobby);

  return {
    ok: true,
    data: {
      lobby: nextLobby,
    },
  };
}

export function startNewTicTacToeLobbyRound(
  code: string,
  playerId: string,
): LobbyResult<{
  lobby: TicTacToeLobby;
}> {
  const lobbyResult = getTicTacToeLobbyByCode(code);

  if (!lobbyResult.ok) {
    return lobbyResult;
  }

  const authResult = authorizeLobbyPlayer(lobbyResult.data.lobby, playerId);

  if (!authResult.ok) {
    return authResult;
  }

  const game = gameReducer(lobbyResult.data.lobby.game, { type: "NEW_ROUND" });
  const nextLobby = resetLobbyReadiness(lobbyResult.data.lobby, game);
  getLobbyStore().set(nextLobby.code, nextLobby);

  return {
    ok: true,
    data: {
      lobby: nextLobby,
    },
  };
}

export function resetTicTacToeLobbyMatch(
  code: string,
  playerId: string,
): LobbyResult<{
  lobby: TicTacToeLobby;
}> {
  const lobbyResult = getTicTacToeLobbyByCode(code);

  if (!lobbyResult.ok) {
    return lobbyResult;
  }

  const authResult = authorizeLobbyPlayer(lobbyResult.data.lobby, playerId);

  if (!authResult.ok) {
    return authResult;
  }

  const game = gameReducer(lobbyResult.data.lobby.game, {
    type: "RESET_SCORES",
  });
  const nextLobby = resetLobbyReadiness(lobbyResult.data.lobby, game);
  getLobbyStore().set(nextLobby.code, nextLobby);

  return {
    ok: true,
    data: {
      lobby: nextLobby,
    },
  };
}

export function readyTicTacToeLobbyPlayer(
  code: string,
  playerId: string,
): LobbyResult<{
  lobby: TicTacToeLobby;
}> {
  const lobbyResult = getTicTacToeLobbyByCode(code);

  if (!lobbyResult.ok) {
    return lobbyResult;
  }

  const authResult = authorizeLobbyPlayer(lobbyResult.data.lobby, playerId);

  if (!authResult.ok) {
    return authResult;
  }

  const { lobby } = lobbyResult.data;

  if (lobby.status !== "waiting" && lobby.status !== "readying") {
    return lobbyError(409, "Round already started.");
  }

  const players = lobby.players.map((player) =>
    player.id === playerId ? { ...player, isReady: true } : player,
  );
  const shouldStart =
    players.length === 2 && players.every((player) => player.isReady);
  const nextLobby: TicTacToeLobby = {
    ...lobby,
    players,
    status:
      players.length < 2 ? "waiting" : shouldStart ? "playing" : "readying",
    updatedAt: Date.now(),
  };

  getLobbyStore().set(nextLobby.code, nextLobby);

  return {
    ok: true,
    data: {
      lobby: nextLobby,
    },
  };
}

export function isTicTacToePlayerId(value: string): value is Player {
  return value === "X" || value === "O";
}

function createTicTacToeLobby(
  code: string,
  playerName: string,
  now: number,
): TicTacToeLobby {
  return {
    code,
    players: [
      {
        id: "X",
        name: sanitizePlayerName(playerName, "Player X"),
        isReady: false,
      },
    ],
    game: createGameState("duo"),
    status: "waiting",
    createdAt: now,
    updatedAt: now,
  };
}

function resetLobbyReadiness(
  lobby: TicTacToeLobby,
  game: GameState,
): TicTacToeLobby {
  return {
    ...lobby,
    game,
    players: lobby.players.map((player) => ({
      ...player,
      isReady: false,
    })),
    status: lobby.players.length < 2 ? "waiting" : "readying",
    updatedAt: Date.now(),
  };
}

function authorizeLobbyPlayer(
  lobby: TicTacToeLobby,
  playerId: string,
): LobbyResult<Record<string, never>> {
  if (!isTicTacToePlayerId(playerId)) {
    return lobbyError(400, "Invalid player.");
  }

  if (!lobby.players.some((player) => player.id === playerId)) {
    return lobbyError(403, "Player is not in this lobby.");
  }

  return {
    ok: true,
    data: {},
  };
}

function updateLobbyGame(
  lobby: TicTacToeLobby,
  game: GameState,
): TicTacToeLobby {
  return {
    ...lobby,
    game,
    status:
      lobby.players.length < 2
        ? "waiting"
        : game.round.status === "won"
          ? "finished"
          : "playing",
    updatedAt: Date.now(),
  };
}

function getLobbyStore(): Map<string, TicTacToeLobby> {
  globalForTicTacToe.__miniArcadeTicTacToeLobbies ??= new Map();

  return globalForTicTacToe.__miniArcadeTicTacToeLobbies;
}
