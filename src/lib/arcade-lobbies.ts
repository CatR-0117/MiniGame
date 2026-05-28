import type { HangmanLobbyView, HangmanPlayerId } from "@/lib/hangman";
import { joinHangmanLobbyByCode } from "@/lib/hangman-lobbies";
import type { MemoryLobby, MemoryPlayerId } from "@/lib/memory";
import { joinLobbyByCode as joinMemoryLobbyByCode } from "@/lib/memory-lobbies";
import {
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

export function joinArcadeLobbyByCode(
  code: string,
  playerName: string,
): LobbyResult<ArcadeLobbyJoinData> {
  const knownGame = getArcadeLobbyGame(code);

  if (knownGame) {
    return joinKnownArcadeLobby(knownGame, code, playerName);
  }

  const fallbackGames: ArcadeLobbyGame[] = ["tic-tac-toe", "memory", "hangman"];

  for (const game of fallbackGames) {
    const result = joinKnownArcadeLobby(game, code, playerName);

    if (result.ok) {
      return result;
    }

    if (result.status !== 404) {
      return result;
    }
  }

  return lobbyError(404, "Lobby not found.");
}

function joinKnownArcadeLobby(
  game: ArcadeLobbyGame,
  code: string,
  playerName: string,
): LobbyResult<ArcadeLobbyJoinData> {
  if (game === "tic-tac-toe") {
    const result = joinTicTacToeLobbyByCode(code, playerName);

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
    const result = joinMemoryLobbyByCode(code, playerName);

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

  const result = joinHangmanLobbyByCode(code, playerName);

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
