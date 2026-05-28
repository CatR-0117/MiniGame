export type Player = "X" | "O";
export type Cell = Player | null;
export type Board = Cell[];
export type GameMode = "solo" | "duo";
export type RoundStatus = "playing" | "won";

export type RoundState = {
  board: Board;
  activeMoves: Record<Player, number[]>;
  currentPlayer: Player;
  status: RoundStatus;
  winner: Player | null;
  winningLine: number[] | null;
  turnCount: number;
};

export type ScoreState = Record<Player, number>;

export type GameState = {
  mode: GameMode;
  round: RoundState;
  scores: ScoreState;
};

export type GameAction =
  | { type: "PLACE_MARK"; index: number; player: Player }
  | { type: "SET_MODE"; mode: GameMode }
  | { type: "NEW_ROUND" }
  | { type: "RESET_SCORES" };

export const HUMAN_PLAYER: Player = "X";
export const BOT_PLAYER: Player = "O";
export const MAX_ACTIVE_MOVES = 3;

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const;

const CORNERS = new Set([0, 2, 6, 8]);

export function createRound(): RoundState {
  return {
    board: Array<Cell>(9).fill(null),
    activeMoves: { X: [], O: [] },
    currentPlayer: HUMAN_PLAYER,
    status: "playing",
    winner: null,
    winningLine: null,
    turnCount: 0,
  };
}

export function createGameState(mode: GameMode = "solo"): GameState {
  return {
    mode,
    round: createRound(),
    scores: { X: 0, O: 0 },
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "PLACE_MARK": {
      const { round } = state;

      if (
        round.status !== "playing" ||
        round.currentPlayer !== action.player ||
        round.board[action.index] !== null
      ) {
        return state;
      }

      const nextRound = placeMark(round, action.player, action.index);
      const scores = nextRound.winner
        ? {
            ...state.scores,
            [nextRound.winner]: state.scores[nextRound.winner] + 1,
          }
        : state.scores;

      return {
        ...state,
        round: nextRound,
        scores,
      };
    }

    case "SET_MODE":
      return action.mode === state.mode
        ? state
        : {
            mode: action.mode,
            round: createRound(),
            scores: { X: 0, O: 0 },
          };

    case "NEW_ROUND":
      return {
        ...state,
        round: createRound(),
      };

    case "RESET_SCORES":
      return {
        ...state,
        round: createRound(),
        scores: { X: 0, O: 0 },
      };

    default:
      return state;
  }
}

export function getCellLabel(index: number, cell: Cell): string {
  const row = Math.floor(index / 3) + 1;
  const column = (index % 3) + 1;
  const content = cell ? `marked ${cell}` : "empty";

  return `Row ${row}, column ${column}, ${content}`;
}

export function chooseBotMove(round: RoundState): number | null {
  const emptyCells = getEmptyCells(round.board);

  if (emptyCells.length === 0) {
    return null;
  }

  const winningMove = findWinningMove(round, BOT_PLAYER);

  if (winningMove !== null) {
    return winningMove;
  }

  const blockingMove = findWinningMove(round, HUMAN_PLAYER);

  if (blockingMove !== null) {
    return blockingMove;
  }

  const rankedMoves = emptyCells
    .map((index) => ({
      index,
      score: scoreBotMove(round, index),
    }))
    .sort((a, b) => b.score - a.score);

  const bestScore = rankedMoves[0]?.score ?? 0;
  const bestMoves = rankedMoves.filter((move) => move.score === bestScore);

  return bestMoves[Math.floor(Math.random() * bestMoves.length)].index;
}

function placeMark(round: RoundState, player: Player, index: number): RoundState {
  const board = [...round.board];
  const activeMoves = {
    X: [...round.activeMoves.X],
    O: [...round.activeMoves.O],
  };

  board[index] = player;
  activeMoves[player].push(index);

  if (activeMoves[player].length > MAX_ACTIVE_MOVES) {
    const expiredMove = activeMoves[player].shift();

    if (typeof expiredMove === "number") {
      board[expiredMove] = null;
    }
  }

  const winningLine = getWinningLine(board);
  const winner = winningLine ? player : null;

  return {
    board,
    activeMoves,
    currentPlayer: winner ? player : getNextPlayer(player),
    status: winner ? "won" : "playing",
    winner,
    winningLine,
    turnCount: round.turnCount + 1,
  };
}

function findWinningMove(round: RoundState, player: Player): number | null {
  return (
    getEmptyCells(round.board).find((index) => {
      const board = simulateMove(round, player, index);
      const winningLine = getWinningLine(board);

      return Boolean(winningLine && board[winningLine[0]] === player);
    }) ?? null
  );
}

function scoreBotMove(round: RoundState, index: number): number {
  const board = simulateMove(round, BOT_PLAYER, index);
  const nextRound: RoundState = {
    ...round,
    board,
    activeMoves: simulateActiveMoves(round, BOT_PLAYER, index),
    currentPlayer: HUMAN_PLAYER,
  };

  let score = index === 4 ? 6 : 0;

  if (CORNERS.has(index)) {
    score += 3;
  }

  for (const line of WIN_LINES) {
    const cells = line.map((cellIndex) => board[cellIndex]);
    const botCount = cells.filter((cell) => cell === BOT_PLAYER).length;
    const humanCount = cells.filter((cell) => cell === HUMAN_PLAYER).length;

    if (botCount > 0 && humanCount === 0) {
      score += botCount * botCount * 4;
    }

    if (humanCount > 0 && botCount === 0) {
      score += humanCount * humanCount * 2;
    }
  }

  if (findWinningMove(nextRound, HUMAN_PLAYER) !== null) {
    score -= 20;
  }

  return score;
}

function simulateMove(round: RoundState, player: Player, index: number): Board {
  const board = [...round.board];
  const activeMoves = simulateActiveMoves(round, player, index);

  board[index] = player;

  for (const boardIndex of round.activeMoves[player]) {
    if (!activeMoves[player].includes(boardIndex)) {
      board[boardIndex] = null;
    }
  }

  return board;
}

function simulateActiveMoves(
  round: RoundState,
  player: Player,
  index: number,
): Record<Player, number[]> {
  const activeMoves = {
    X: [...round.activeMoves.X],
    O: [...round.activeMoves.O],
  };

  activeMoves[player].push(index);

  if (activeMoves[player].length > MAX_ACTIVE_MOVES) {
    activeMoves[player].shift();
  }

  return activeMoves;
}

function getWinningLine(board: Board): number[] | null {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return [a, b, c];
    }
  }

  return null;
}

function getEmptyCells(board: Board): number[] {
  return board.reduce<number[]>((cells, cell, index) => {
    if (cell === null) {
      cells.push(index);
    }

    return cells;
  }, []);
}

function getNextPlayer(player: Player): Player {
  return player === "X" ? "O" : "X";
}
