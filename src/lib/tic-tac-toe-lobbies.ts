import {
  createGameState,
  gameReducer,
  type GameState,
  type Player,
} from "@/lib/game";
import {
  cleanupExpiredLobbies,
  generateUniqueLobbyCode,
  lobbyError,
  normalizeLobbyCode,
  sanitizePlayerName,
  type LobbyResult,
} from "@/lib/lobby-utils";

export type TicTacToeLobbyStatus = "waiting" | "playing" | "finished";

export type TicTacToeLobbyPlayer = {
  id: Player;
  name: string;
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

  const code = generateUniqueLobbyCode(lobbies);
  const lobby = createTicTacToeLobby(code, playerName, now);
  lobbies.set(code, lobby);

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
      },
    ],
    status: lobby.game.round.status === "won" ? "finished" : "playing",
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
  const nextLobby = updateLobbyGame(lobbyResult.data.lobby, game);
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
  const nextLobby = updateLobbyGame(lobbyResult.data.lobby, game);
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
      },
    ],
    game: createGameState("duo"),
    status: "waiting",
    createdAt: now,
    updatedAt: now,
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
