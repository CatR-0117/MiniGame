import type { HangmanLobbyView, HangmanPlayerId } from "@/lib/hangman";
import {
  createHangmanLobbyForHostCode,
  hasHangmanLobbyByCode,
  isHangmanLobbyHost,
  joinHangmanLobbyByCode,
} from "@/lib/hangman-lobbies";
import type { MemoryLobby, MemoryPlayerId } from "@/lib/memory";
import {
  createLobbyForHostCode as createMemoryLobbyForHostCode,
  hasMemoryLobbyByCode,
  isMemoryLobbyHost,
  joinLobbyByCode as joinMemoryLobbyByCode,
} from "@/lib/memory-lobbies";
import {
  createTicTacToeLobbyForHostCode,
  hasTicTacToeLobbyByCode,
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

export async function joinArcadeLobbyByCode(
  code: string,
  playerName: string,
  rejoinToken: string,
): Promise<LobbyResult<ArcadeLobbyJoinData>> {
  const knownGame = await getArcadeLobbyGame(code);

  if (knownGame) {
    return joinKnownArcadeLobby(knownGame, code, playerName, rejoinToken);
  }

  const fallbackGames: ArcadeLobbyGame[] = ["tic-tac-toe", "memory", "hangman"];

  for (const game of fallbackGames) {
    const result = await joinKnownArcadeLobby(
      game,
      code,
      playerName,
      rejoinToken,
    );

    if (result.ok) {
      return result;
    }

    if (result.status !== 404) {
      return result;
    }
  }

  return lobbyError(404, "Lobby not found.");
}

export async function getArcadeLobbyStatusByCode(
  code: string,
): Promise<LobbyResult<ArcadeLobbyStatusData>> {
  const knownGame = await getArcadeLobbyGame(code);
  const game =
    knownGame && (await hasKnownArcadeLobby(knownGame, code))
      ? knownGame
      : await findArcadeLobbyGameByCode(code);

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

export async function switchArcadeLobbyGame(
  code: string,
  playerName: string,
  rejoinToken: string,
  nextGame: string,
): Promise<LobbyResult<ArcadeLobbyJoinData>> {
  if (!isArcadeLobbyGame(nextGame)) {
    return lobbyError(400, "Invalid game.");
  }

  const currentGame =
    (await getArcadeLobbyGame(code)) ??
    (await findArcadeLobbyGameByHost(code, rejoinToken));

  if (!currentGame) {
    return lobbyError(404, "Lobby not found.");
  }

  if (!(await isLobbyHost(currentGame, code, rejoinToken))) {
    return lobbyError(403, "Only the lobby host can change games.");
  }

  const result = await createKnownArcadeLobby(
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

async function joinKnownArcadeLobby(
  game: ArcadeLobbyGame,
  code: string,
  playerName: string,
  rejoinToken: string,
): Promise<LobbyResult<ArcadeLobbyJoinData>> {
  if (game === "tic-tac-toe") {
    const result = await joinTicTacToeLobbyByCode(
      code,
      playerName,
      rejoinToken,
    );

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
    const result = await joinMemoryLobbyByCode(code, playerName, rejoinToken);

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

  const result = await joinHangmanLobbyByCode(code, playerName, rejoinToken);

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

async function createKnownArcadeLobby(
  game: ArcadeLobbyGame,
  code: string,
  playerName: string,
  rejoinToken: string,
): Promise<Omit<ArcadeLobbyJoinData, "game">> {
  if (game === "tic-tac-toe") {
    return createTicTacToeLobbyForHostCode(code, playerName, rejoinToken);
  }

  if (game === "memory") {
    return createMemoryLobbyForHostCode(code, playerName, rejoinToken);
  }

  return createHangmanLobbyForHostCode(code, playerName, rejoinToken);
}

async function hasKnownArcadeLobby(
  game: ArcadeLobbyGame,
  code: string,
): Promise<boolean> {
  if (game === "tic-tac-toe") {
    return hasTicTacToeLobbyByCode(code);
  }

  if (game === "memory") {
    return hasMemoryLobbyByCode(code);
  }

  return hasHangmanLobbyByCode(code);
}

async function findArcadeLobbyGameByCode(
  code: string,
): Promise<ArcadeLobbyGame | null> {
  const games: ArcadeLobbyGame[] = ["tic-tac-toe", "memory", "hangman"];

  for (const game of games) {
    if (await hasKnownArcadeLobby(game, code)) {
      return game;
    }
  }

  return null;
}

async function findArcadeLobbyGameByHost(
  code: string,
  rejoinToken: string,
): Promise<ArcadeLobbyGame | null> {
  const games: ArcadeLobbyGame[] = ["tic-tac-toe", "memory", "hangman"];

  if (!rejoinToken) {
    return null;
  }

  for (const game of games) {
    if (await isLobbyHost(game, code, rejoinToken)) {
      return game;
    }
  }

  return null;
}

async function isLobbyHost(
  game: ArcadeLobbyGame,
  code: string,
  rejoinToken: string,
): Promise<boolean> {
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
