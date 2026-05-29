import { getWaitingLobbyExpiresAt, sanitizePlayerName } from "@/lib/lobby-utils";

export type WordSearchCellPosition = {
  row: number;
  col: number;
};

export type WordSearchWordPath = {
  word: string;
  path: WordSearchCellPosition[];
};

export type WordSearchPuzzle = {
  category: string;
  words: string[];
  grid: string[][];
  placements: WordSearchWordPath[];
};

export type WordSearchPlayerId = "player-1" | "player-2";
export type WordSearchLobbyStatus =
  | "waiting"
  | "readying"
  | "playing"
  | "finished";
export type WordSearchSoloStatus = "playing" | "won";

export type WordSearchPlayer = {
  id: WordSearchPlayerId;
  name: string;
  isReady: boolean;
  rejoinTokenHash?: string;
  foundWords: string[];
  attemptCount: number;
  lastFoundWord: string | null;
  solvedAt: number | null;
  elapsedMs: number | null;
};

export type WordSearchLobby = {
  code: string;
  puzzle: WordSearchPuzzle;
  players: WordSearchPlayer[];
  status: WordSearchLobbyStatus;
  winnerId: WordSearchPlayerId | null;
  startedAt: number | null;
  createdAt: number;
  updatedAt: number;
  waitingExpiresAt: number | null;
};

export type WordSearchPublicPlayer = {
  id: WordSearchPlayerId;
  name: string;
  isReady: boolean;
  foundCount: number;
  attemptCount: number;
  isSolved: boolean;
  elapsedMs: number | null;
  lastFoundWord: string | null;
};

export type WordSearchLobbyView = {
  code: string;
  category: string | null;
  words: string[];
  grid: string[][] | null;
  players: WordSearchPublicPlayer[];
  localPlayerId: WordSearchPlayerId;
  localFoundWords: string[];
  localFoundWordPaths: WordSearchWordPath[];
  localAttemptCount: number;
  localLastFoundWord: string | null;
  status: WordSearchLobbyStatus;
  winnerId: WordSearchPlayerId | null;
  startedAt: number | null;
  updatedAt: number;
  waitingExpiresAt: number | null;
};

export type WordSearchSoloGame = {
  puzzle: WordSearchPuzzle;
  foundWords: string[];
  foundWordPaths: WordSearchWordPath[];
  attemptCount: number;
  lastFoundWord: string | null;
  status: WordSearchSoloStatus;
};

export const WORD_SEARCH_SIZE = 10;

export const WORD_SEARCH_WORD_BANKS: Array<{
  category: string;
  words: string[];
}> = [
  {
    category: "Arcade",
    words: [
      "ARCADE",
      "PUZZLE",
      "TOKEN",
      "BONUS",
      "LEVEL",
      "PIXEL",
      "SCORE",
      "QUEST",
      "COMBO",
      "GAMING",
    ],
  },
  {
    category: "Space",
    words: [
      "PLANET",
      "ROCKET",
      "COMET",
      "ORBIT",
      "GALAXY",
      "ASTRO",
      "LUNAR",
      "SOLAR",
      "METEOR",
      "SATURN",
    ],
  },
  {
    category: "Nature",
    words: [
      "FOREST",
      "RIVER",
      "CLOUD",
      "STONE",
      "BLOOM",
      "LEAF",
      "MOSS",
      "CREEK",
      "MEADOW",
      "BREEZE",
    ],
  },
  {
    category: "Food",
    words: [
      "PIZZA",
      "NOODLE",
      "MELON",
      "BREAD",
      "HONEY",
      "PASTA",
      "APPLE",
      "SALAD",
      "COOKIE",
      "CHEESE",
    ],
  },
  {
    category: "Sports",
    words: [
      "SOCCER",
      "TENNIS",
      "SKATE",
      "TRACK",
      "SWIM",
      "HOOPS",
      "RUGBY",
      "BOXING",
      "RACING",
      "GOLF",
    ],
  },
  {
    category: "Travel",
    words: [
      "TRAIN",
      "HOTEL",
      "BEACH",
      "TICKET",
      "MAPS",
      "PLANE",
      "FERRY",
      "PASSPORT",
      "LUGGAGE",
      "CRUISE",
    ],
  },
  {
    category: "Technology",
    words: [
      "PIXEL",
      "ROBOT",
      "CIRCUIT",
      "LAPTOP",
      "SCREEN",
      "MOUSE",
      "SERVER",
      "CODING",
      "MODEM",
      "TABLET",
    ],
  },
  {
    category: "Adventure",
    words: [
      "QUEST",
      "CAMP",
      "TRAIL",
      "CAVE",
      "TREASURE",
      "JOURNEY",
      "SUMMIT",
      "RAFT",
      "COMPASS",
      "EXPLORE",
    ],
  },
  {
    category: "Music",
    words: [
      "GUITAR",
      "PIANO",
      "DRUM",
      "MELODY",
      "RHYTHM",
      "CHORD",
      "SONG",
      "BAND",
      "VOCAL",
      "ALBUM",
    ],
  },
  {
    category: "Animals",
    words: [
      "TIGER",
      "LION",
      "PANDA",
      "WOLF",
      "EAGLE",
      "HORSE",
      "SHARK",
      "RABBIT",
      "MONKEY",
      "ZEBRA",
    ],
  },
  {
    category: "Movies",
    words: [
      "ACTOR",
      "SCENE",
      "SCRIPT",
      "CAMERA",
      "DRAMA",
      "COMEDY",
      "THRILLER",
      "DIRECTOR",
      "CINEMA",
      "MOVIE",
    ],
  },
  {
    category: "Weather",
    words: [
      "RAIN",
      "SNOW",
      "STORM",
      "WIND",
      "SUNNY",
      "CLOUDY",
      "THUNDER",
      "LIGHTNING",
      "FOG",
      "BREEZE",
    ],
  },
];

const WORD_SEARCH_PLAYER_IDS: WordSearchPlayerId[] = ["player-1", "player-2"];
const FILLER_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIRECTIONS: WordSearchCellPosition[] = [
  { row: -1, col: -1 },
  { row: -1, col: 0 },
  { row: -1, col: 1 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
  { row: 1, col: -1 },
  { row: 1, col: 0 },
  { row: 1, col: 1 },
];

export function createWordSearchLobby(
  code: string,
  playerName = "Player 1",
  now = Date.now(),
  puzzle = createWordSearchPuzzle(),
  rejoinTokenHash?: string,
): WordSearchLobby {
  return {
    code,
    puzzle,
    players: [
      createWordSearchPlayer("player-1", playerName, "Player 1", rejoinTokenHash),
    ],
    status: "waiting",
    winnerId: null,
    startedAt: null,
    createdAt: now,
    updatedAt: now,
    waitingExpiresAt: getWaitingLobbyExpiresAt(now),
  };
}

export function createWordSearchSoloGame(
  previousCategory?: string,
): WordSearchSoloGame {
  return {
    puzzle: createWordSearchPuzzle(previousCategory),
    foundWords: [],
    foundWordPaths: [],
    attemptCount: 0,
    lastFoundWord: null,
    status: "playing",
  };
}

export function joinWordSearchLobby(
  lobby: WordSearchLobby,
  playerName = "Player 2",
  now = Date.now(),
  rejoinTokenHash?: string,
): WordSearchLobby {
  if (lobby.players.length >= WORD_SEARCH_PLAYER_IDS.length) {
    return lobby;
  }

  const nextPlayerId = WORD_SEARCH_PLAYER_IDS[lobby.players.length];

  return {
    ...lobby,
    players: [
      ...lobby.players,
      createWordSearchPlayer(
        nextPlayerId,
        playerName,
        `Player ${lobby.players.length + 1}`,
        rejoinTokenHash,
      ),
    ],
    status: "readying",
    updatedAt: now,
    waitingExpiresAt: null,
  };
}

export function readyWordSearchPlayer(
  lobby: WordSearchLobby,
  playerId: WordSearchPlayerId,
  now = Date.now(),
): WordSearchLobby {
  if (lobby.status !== "waiting" && lobby.status !== "readying") {
    return lobby;
  }

  const players = lobby.players.map((player) =>
    player.id === playerId ? { ...player, isReady: true } : player,
  );
  const shouldStart =
    players.length === WORD_SEARCH_PLAYER_IDS.length &&
    players.every((player) => player.isReady);

  return {
    ...lobby,
    players: shouldStart
      ? players.map((player) => resetWordSearchPlayerRound(player))
      : players,
    status:
      players.length < WORD_SEARCH_PLAYER_IDS.length
        ? "waiting"
        : shouldStart
          ? "playing"
          : "readying",
    startedAt: shouldStart ? now : lobby.startedAt,
    updatedAt: now,
    waitingExpiresAt:
      players.length < WORD_SEARCH_PLAYER_IDS.length
        ? (lobby.waitingExpiresAt ?? getWaitingLobbyExpiresAt(now))
        : null,
  };
}

export function restartWordSearchLobby(
  lobby: WordSearchLobby,
  now = Date.now(),
): WordSearchLobby {
  return {
    ...lobby,
    puzzle: createWordSearchPuzzle(lobby.puzzle.category),
    players: lobby.players.map((player) => ({
      ...resetWordSearchPlayerRound(player),
      isReady: false,
    })),
    status:
      lobby.players.length < WORD_SEARCH_PLAYER_IDS.length
        ? "waiting"
        : "readying",
    winnerId: null,
    startedAt: null,
    updatedAt: now,
    waitingExpiresAt:
      lobby.players.length < WORD_SEARCH_PLAYER_IDS.length
        ? (lobby.waitingExpiresAt ?? getWaitingLobbyExpiresAt(now))
        : null,
  };
}

export function submitWordSearchSoloSelection(
  game: WordSearchSoloGame,
  start: WordSearchCellPosition,
  end: WordSearchCellPosition,
): WordSearchSoloGame {
  if (game.status !== "playing") {
    return game;
  }

  const foundPath = findWordSearchSelection(
    game.puzzle,
    start,
    end,
    game.foundWords,
  );
  const foundWords = foundPath
    ? [...game.foundWords, foundPath.word]
    : game.foundWords;
  const foundWordPaths = foundPath
    ? [...game.foundWordPaths, foundPath]
    : game.foundWordPaths;
  const isSolved = foundWords.length === game.puzzle.words.length;

  return {
    ...game,
    foundWords,
    foundWordPaths,
    attemptCount: game.attemptCount + 1,
    lastFoundWord: foundPath?.word ?? null,
    status: isSolved ? "won" : "playing",
  };
}

export function submitWordSearchSelection(
  lobby: WordSearchLobby,
  playerId: WordSearchPlayerId,
  start: WordSearchCellPosition,
  end: WordSearchCellPosition,
  now = Date.now(),
): WordSearchLobby {
  if (lobby.status !== "playing" || !lobby.startedAt) {
    return lobby;
  }

  const player = lobby.players.find(({ id }) => id === playerId);

  if (!player || player.solvedAt !== null) {
    return lobby;
  }

  const foundPath = findWordSearchSelection(
    lobby.puzzle,
    start,
    end,
    player.foundWords,
  );
  const nextFoundWords = foundPath
    ? [...player.foundWords, foundPath.word]
    : player.foundWords;
  const isSolved = nextFoundWords.length === lobby.puzzle.words.length;
  const elapsedMs = now - lobby.startedAt;
  const players = lobby.players.map((currentPlayer) =>
    currentPlayer.id === playerId
      ? {
          ...currentPlayer,
          foundWords: nextFoundWords,
          attemptCount: currentPlayer.attemptCount + 1,
          lastFoundWord: foundPath?.word ?? null,
          solvedAt: isSolved ? now : currentPlayer.solvedAt,
          elapsedMs: isSolved ? elapsedMs : currentPlayer.elapsedMs,
        }
      : currentPlayer,
  );
  const winnerId = isSolved ? playerId : lobby.winnerId;

  return {
    ...lobby,
    players,
    winnerId,
    status: winnerId ? "finished" : "playing",
    updatedAt: now,
  };
}

export function getWordSearchLobbyView(
  lobby: WordSearchLobby,
  playerId: WordSearchPlayerId,
): WordSearchLobbyView | null {
  const localPlayer = lobby.players.find((player) => player.id === playerId);

  if (!localPlayer) {
    return null;
  }

  const shouldShowPuzzle =
    lobby.status === "playing" || lobby.status === "finished";

  return {
    code: lobby.code,
    category: shouldShowPuzzle ? lobby.puzzle.category : null,
    words: shouldShowPuzzle ? lobby.puzzle.words : [],
    grid: shouldShowPuzzle ? lobby.puzzle.grid : null,
    players: lobby.players.map((player) => ({
      id: player.id,
      name: player.name,
      isReady: player.isReady,
      foundCount: player.foundWords.length,
      attemptCount: player.attemptCount,
      isSolved: player.solvedAt !== null,
      elapsedMs: player.elapsedMs,
      lastFoundWord: player.lastFoundWord,
    })),
    localPlayerId: playerId,
    localFoundWords: localPlayer.foundWords,
    localFoundWordPaths: getFoundWordPaths(
      lobby.puzzle,
      localPlayer.foundWords,
    ),
    localAttemptCount: localPlayer.attemptCount,
    localLastFoundWord: localPlayer.lastFoundWord,
    status: lobby.status,
    winnerId: lobby.winnerId,
    startedAt: lobby.startedAt,
    updatedAt: lobby.updatedAt,
    waitingExpiresAt: lobby.waitingExpiresAt,
  };
}

export function createWordSearchPuzzle(
  previousCategory?: string,
): WordSearchPuzzle {
  const bank = pickWordSearchBank(previousCategory);

  return createWordSearchPuzzleFromWords(bank.category, bank.words);
}

export function createWordSearchPuzzleFromWords(
  category: string,
  words: string[],
): WordSearchPuzzle {
  const normalizedWords = words
    .map(normalizeWordSearchWord)
    .filter((word) => word.length > 0 && word.length <= WORD_SEARCH_SIZE);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const placedPuzzle = tryCreateWordSearchPuzzle(category, normalizedWords);

    if (placedPuzzle) {
      return placedPuzzle;
    }
  }

  return createFallbackWordSearchPuzzle(category, normalizedWords);
}

export function normalizeWordSearchWord(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

export function isWordSearchPlayerId(
  value: string,
): value is WordSearchPlayerId {
  return WORD_SEARCH_PLAYER_IDS.includes(value as WordSearchPlayerId);
}

export function isValidWordSearchPosition(
  position: WordSearchCellPosition,
): boolean {
  return (
    Number.isInteger(position.row) &&
    Number.isInteger(position.col) &&
    position.row >= 0 &&
    position.row < WORD_SEARCH_SIZE &&
    position.col >= 0 &&
    position.col < WORD_SEARCH_SIZE
  );
}

function createWordSearchPlayer(
  id: WordSearchPlayerId,
  name: string,
  fallback: string,
  rejoinTokenHash?: string,
): WordSearchPlayer {
  return {
    id,
    name: sanitizePlayerName(name, fallback),
    isReady: false,
    ...(rejoinTokenHash ? { rejoinTokenHash } : {}),
    foundWords: [],
    attemptCount: 0,
    lastFoundWord: null,
    solvedAt: null,
    elapsedMs: null,
  };
}

function resetWordSearchPlayerRound(
  player: WordSearchPlayer,
): WordSearchPlayer {
  return {
    ...player,
    foundWords: [],
    attemptCount: 0,
    lastFoundWord: null,
    solvedAt: null,
    elapsedMs: null,
  };
}

function pickWordSearchBank(previousCategory?: string): {
  category: string;
  words: string[];
} {
  const choices = previousCategory
    ? WORD_SEARCH_WORD_BANKS.filter(
        (bank) => bank.category !== previousCategory,
      )
    : WORD_SEARCH_WORD_BANKS;

  return (
    choices[Math.floor(Math.random() * choices.length)] ??
    WORD_SEARCH_WORD_BANKS[0]
  );
}

function tryCreateWordSearchPuzzle(
  category: string,
  words: string[],
): WordSearchPuzzle | null {
  const grid = createEmptyGrid();
  const placements: WordSearchWordPath[] = [];

  for (const word of words) {
    const placement = placeWordRandomly(grid, word);

    if (!placement) {
      return null;
    }

    placements.push(placement);
  }

  fillEmptyCells(grid);

  return {
    category,
    words,
    grid,
    placements,
  };
}

function createFallbackWordSearchPuzzle(
  category: string,
  words: string[],
): WordSearchPuzzle {
  const grid = createEmptyGrid();
  const placements: WordSearchWordPath[] = [];

  words.forEach((word, row) => {
    const path = word.split("").map((letter, col) => {
      grid[row][col] = letter;

      return { row, col };
    });

    placements.push({ word, path });
  });
  fillEmptyCells(grid);

  return {
    category,
    words,
    grid,
    placements,
  };
}

function createEmptyGrid(): string[][] {
  return Array.from({ length: WORD_SEARCH_SIZE }, () =>
    Array.from({ length: WORD_SEARCH_SIZE }, () => ""),
  );
}

function placeWordRandomly(
  grid: string[][],
  word: string,
): WordSearchWordPath | null {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const direction = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
    const start = {
      row: Math.floor(Math.random() * WORD_SEARCH_SIZE),
      col: Math.floor(Math.random() * WORD_SEARCH_SIZE),
    };
    const path = getPathForWord(start, direction, word.length);

    if (!path || !canPlaceWord(grid, word, path)) {
      continue;
    }

    path.forEach((position, index) => {
      grid[position.row][position.col] = word[index];
    });

    return { word, path };
  }

  return null;
}

function getPathForWord(
  start: WordSearchCellPosition,
  direction: WordSearchCellPosition,
  length: number,
): WordSearchCellPosition[] | null {
  const path = Array.from({ length }, (_, index) => ({
    row: start.row + direction.row * index,
    col: start.col + direction.col * index,
  }));

  return path.every(isValidWordSearchPosition) ? path : null;
}

function canPlaceWord(
  grid: string[][],
  word: string,
  path: WordSearchCellPosition[],
): boolean {
  return path.every((position, index) => {
    const currentLetter = grid[position.row][position.col];

    return currentLetter === "" || currentLetter === word[index];
  });
}

function fillEmptyCells(grid: string[][]): void {
  for (let row = 0; row < WORD_SEARCH_SIZE; row += 1) {
    for (let col = 0; col < WORD_SEARCH_SIZE; col += 1) {
      if (!grid[row][col]) {
        grid[row][col] =
          FILLER_ALPHABET[Math.floor(Math.random() * FILLER_ALPHABET.length)];
      }
    }
  }
}

function findWordSearchSelection(
  puzzle: WordSearchPuzzle,
  start: WordSearchCellPosition,
  end: WordSearchCellPosition,
  foundWords: string[],
): WordSearchWordPath | null {
  const path = getSelectionPath(start, end);

  if (!path) {
    return null;
  }

  return (
    puzzle.placements.find(
      (placement) =>
        !foundWords.includes(placement.word) &&
        (arePathsEqual(path, placement.path) ||
          arePathsEqual([...path].reverse(), placement.path)),
    ) ?? null
  );
}

function getSelectionPath(
  start: WordSearchCellPosition,
  end: WordSearchCellPosition,
): WordSearchCellPosition[] | null {
  if (!isValidWordSearchPosition(start) || !isValidWordSearchPosition(end)) {
    return null;
  }

  const rowDelta = Math.sign(end.row - start.row);
  const colDelta = Math.sign(end.col - start.col);
  const rowDistance = Math.abs(end.row - start.row);
  const colDistance = Math.abs(end.col - start.col);
  const isStraight =
    rowDistance === 0 || colDistance === 0 || rowDistance === colDistance;

  if (!isStraight || (rowDistance === 0 && colDistance === 0)) {
    return null;
  }

  const length = Math.max(rowDistance, colDistance) + 1;

  return getPathForWord(start, { row: rowDelta, col: colDelta }, length);
}

function arePathsEqual(
  firstPath: WordSearchCellPosition[],
  secondPath: WordSearchCellPosition[],
): boolean {
  return (
    firstPath.length === secondPath.length &&
    firstPath.every(
      (position, index) =>
        position.row === secondPath[index].row &&
        position.col === secondPath[index].col,
    )
  );
}

function getFoundWordPaths(
  puzzle: WordSearchPuzzle,
  foundWords: string[],
): WordSearchWordPath[] {
  return puzzle.placements.filter((placement) =>
    foundWords.includes(placement.word),
  );
}
