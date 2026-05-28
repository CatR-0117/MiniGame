import type { HangmanLobbyView, HangmanPlayerId } from "@/lib/hangman";
import {
  createHangmanLobbyForHostCode,
  deleteHangmanLobbyByCode,
  isHangmanLobbyHost,
  joinHangmanLobbyByCode,
} from "@/lib/hangman-lobbies";
import type { MemoryLobby, MemoryPlayerId } from "@/lib/memory";
import {
  createLobbyForHostCode as createMemoryLobbyForHostCode,
  deleteLobbyByCode as deleteMemoryLobbyByCode,
  isMemoryLobbyHost,
  joinLobbyByCode as joinMemoryLobbyByCode,
} from "@/lib/memory-lobbies";
import {
  createTicTacToeLobbyForHostCode,
  deleteTicTacToeLobbyByCode,
  isTicTacToeLobbyHost,
  joinTicTacToeLobbyByCode,
  type TicTacToeLobby,
} from "@/lib/tic-tac-toe-lobbies";
import type { Player } from "@/lib/game";
import {
  getArcadeLobbyGame,
  type ArcadeLobbyGame,
} from "@/lib/arcade-lobby-directory";
import { lobbyError, type LobbyResult } from "@/lib/lobby-utils";

export type ArcadeLobbyJoinData =
  | {
      game: "tic-tac-toe";
      lobby: TicTacToeLobby;
      playerId: Player;
    }
  | {
      game: "memory";
      lobby: MemoryLobby;
      playerId: MemoryPlayerId;
    }
  | {
      game: "hangman";
      lobby: HangmanLobbyView;
      playerId: HangmanPlayerId;
    };

export type ArcadeLobbyStatusData = {
  game: ArcadeLobbyGame;
};

export function joinArcadeLobbyByCode(
  code: string,
  playerName: string,
  rejoinToken: string,
): LobbyResult<ArcadeLobbyJoinData> {
  const knownGame = getArcadeLobbyGame(code);

  if (knownGame) {
    return joinKnownArcadeLobby(knownGame, code, playerName, rejoinToken);
  }

  const fallbackGames: ArcadeLobbyGame[] = ["tic-tac-toe", "memory", "hangman"];

  for (const game of fallbackGames) {
    const result = joinKnownArcadeLobby(game, code, playerName, rejoinToken);

    if (result.ok) {
      return result;
    }

    if (result.status !== 404) {
      return result;
    }
  }

  return lobbyError(404, "Lobby not found.");
}

export function getArcadeLobbyStatusByCode(
  code: string,
): LobbyResult<ArcadeLobbyStatusData> {
  const game = getArcadeLobbyGame(code) ?? findArcadeLobbyGameByHost(code, "");

  if (!game) {
    return lobbyError(404, "Lobby not found.");
  }

  return {
    ok: true,
    data: {
      game,
    },
  };
}

export function switchArcadeLobbyGame(
  code: string,
  playerName: string,
  rejoinToken: string,
  nextGame: string,
): LobbyResult<ArcadeLobbyJoinData> {
  if (!isArcadeLobbyGame(nextGame)) {
    return lobbyError(400, "Invalid game.");
  }

  const currentGame =
    getArcadeLobbyGame(code) ?? findArcadeLobbyGameByHost(code, rejoinToken);

  if (!currentGame) {
    return lobbyError(404, "Lobby not found.");
  }

  if (!isLobbyHost(currentGame, code, rejoinToken)) {
    return lobbyError(403, "Only the lobby host can change games.");
  }

  if (currentGame !== nextGame) {
    deleteKnownArcadeLobby(currentGame, code);
  }

  const result = createKnownArcadeLobby(
    nextGame,
    code,
    playerName,
    rejoinToken,
  );

  return {
    ok: true,
    data: {
      game: nextGame,
      ...result,
    } as ArcadeLobbyJoinData,
  };
}

function joinKnownArcadeLobby(
  game: ArcadeLobbyGame,
  code: string,
  playerName: string,
  rejoinToken: string,
): LobbyResult<ArcadeLobbyJoinData> {
  if (game === "tic-tac-toe") {
    const result = joinTicTacToeLobbyByCode(code, playerName, rejoinToken);

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        game,
        ...result.data,
      },
    };
  }

  if (game === "memory") {
    const result = joinMemoryLobbyByCode(code, playerName, rejoinToken);

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        game,
        ...result.data,
      },
    };
  }

  const result = joinHangmanLobbyByCode(code, playerName, rejoinToken);

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    data: {
      game,
      ...result.data,
    },
  };
}

function createKnownArcadeLobby(
  game: ArcadeLobbyGame,
  code: string,
  playerName: string,
  rejoinToken: string,
): Omit<ArcadeLobbyJoinData, "game"> {
  if (game === "tic-tac-toe") {
    return createTicTacToeLobbyForHostCode(code, playerName, rejoinToken);
  }

  if (game === "memory") {
    return createMemoryLobbyForHostCode(code, playerName, rejoinToken);
  }

  return createHangmanLobbyForHostCode(code, playerName, rejoinToken);
}

function deleteKnownArcadeLobby(game: ArcadeLobbyGame, code: string): void {
  if (game === "tic-tac-toe") {
    deleteTicTacToeLobbyByCode(code);
    return;
  }

  if (game === "memory") {
    deleteMemoryLobbyByCode(code);
    return;
  }

  deleteHangmanLobbyByCode(code);
}

function findArcadeLobbyGameByHost(
  code: string,
  rejoinToken: string,
): ArcadeLobbyGame | null {
  const games: ArcadeLobbyGame[] = ["tic-tac-toe", "memory", "hangman"];

  return (
    games.find((game) =>
      rejoinToken ? isLobbyHost(game, code, rejoinToken) : false,
    ) ?? null
  );
}

function isLobbyHost(
  game: ArcadeLobbyGame,
  code: string,
  rejoinToken: string,
): boolean {
  if (game === "tic-tac-toe") {
    return isTicTacToeLobbyHost(code, rejoinToken);
  }

  if (game === "memory") {
    return isMemoryLobbyHost(code, rejoinToken);
  }

  return isHangmanLobbyHost(code, rejoinToken);
}

function isArcadeLobbyGame(value: string): value is ArcadeLobbyGame {
  return value === "tic-tac-toe" || value === "memory" || value === "hangman";
}
