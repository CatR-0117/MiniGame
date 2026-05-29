import { getWaitingLobbyExpiresAt, sanitizePlayerName } from "@/lib/lobby-utils";

export type WordScramblePuzzle = {
  word: string;
  category: string;
};

export type WordScramblePlayerId = "player-1" | "player-2";
export type WordScrambleLobbyStatus =
  | "waiting"
  | "readying"
  | "playing"
  | "finished";
export type WordScrambleSoloStatus = "playing" | "won" | "lost";

export type WordScramblePlayer = {
  id: WordScramblePlayerId;
  name: string;
  isReady: boolean;
  rejoinTokenHash?: string;
  guesses: string[];
  solvedAt: number | null;
  elapsedMs: number | null;
};

export type WordScrambleLobby = {
  code: string;
  puzzle: WordScramblePuzzle;
  scrambledWord: string;
  players: WordScramblePlayer[];
  status: WordScrambleLobbyStatus;
  winnerId: WordScramblePlayerId | null;
  startedAt: number | null;
  createdAt: number;
  updatedAt: number;
  waitingExpiresAt: number | null;
};

export type WordScramblePublicPlayer = {
  id: WordScramblePlayerId;
  name: string;
  isReady: boolean;
  guessCount: number;
  isSolved: boolean;
  isOut: boolean;
  elapsedMs: number | null;
  lastGuess: string | null;
};

export type WordScrambleLobbyView = {
  code: string;
  category: string | null;
  wordLength: number;
  scrambledWord: string | null;
  revealedWord: string | null;
  players: WordScramblePublicPlayer[];
  localPlayerId: WordScramblePlayerId;
  localGuesses: string[];
  localLastGuess: string | null;
  status: WordScrambleLobbyStatus;
  winnerId: WordScramblePlayerId | null;
  startedAt: number | null;
  updatedAt: number;
  waitingExpiresAt: number | null;
};

export type WordScrambleSoloGame = {
  puzzle: WordScramblePuzzle;
  scrambledWord: string;
  guesses: string[];
  status: WordScrambleSoloStatus;
};

export const WORD_SCRAMBLE_MAX_GUESSES = 6;

export const WORD_SCRAMBLE_PUZZLES: WordScramblePuzzle[] = [
  { word: "ARCADE", category: "Games" },
  { word: "PUZZLE", category: "Games" },
  { word: "CHESS", category: "Games" },
  { word: "QUEST", category: "Games" },
  { word: "CONTROLLER", category: "Games" },

  { word: "PIZZA", category: "Food" },
  { word: "NOODLES", category: "Food" },
  { word: "PANCAKE", category: "Food" },
  { word: "POPCORN", category: "Food" },
  { word: "MUFFIN", category: "Food" },

  { word: "GALAXY", category: "Space" },
  { word: "PLANET", category: "Space" },
  { word: "ROCKET", category: "Space" },
  { word: "ORBIT", category: "Space" },
  { word: "COMET", category: "Space" },

  { word: "LONDON", category: "Cities" },
  { word: "TOKYO", category: "Cities" },
  { word: "PARIS", category: "Cities" },
  { word: "SYDNEY", category: "Cities" },
  { word: "BERLIN", category: "Cities" },

  { word: "VOLCANO", category: "Nature" },
  { word: "THUNDER", category: "Nature" },
  { word: "RAINBOW", category: "Nature" },
  { word: "CANYON", category: "Nature" },
  { word: "ISLAND", category: "Nature" },

  { word: "AIRPLANE", category: "Transport" },
  { word: "SUBWAY", category: "Transport" },
  { word: "BICYCLE", category: "Transport" },
  { word: "SCOOTER", category: "Transport" },
  { word: "TRAIN", category: "Transport" },

  { word: "BASKETBALL", category: "Sports" },
  { word: "TENNIS", category: "Sports" },
  { word: "SOCCER", category: "Sports" },
  { word: "SWIMMING", category: "Sports" },
  { word: "VOLLEYBALL", category: "Sports" },

  { word: "KEYBOARD", category: "Technology" },
  { word: "ROBOTICS", category: "Technology" },
  { word: "LAPTOP", category: "Technology" },
  { word: "PIXEL", category: "Technology" },
  { word: "CIRCUIT", category: "Technology" },

  { word: "TREASURE", category: "Adventure" },
  { word: "EXPEDITION", category: "Adventure" },
  { word: "SURVIVAL", category: "Adventure" },
  { word: "DISCOVERY", category: "Adventure" },
  { word: "JOURNEY", category: "Adventure" },

  { word: "DOCTOR", category: "Jobs" },
  { word: "ENGINEER", category: "Jobs" },
  { word: "ARCHITECT", category: "Jobs" },
  { word: "SCIENTIST", category: "Jobs" },
  { word: "DESIGNER", category: "Jobs" },
];

const WORD_SCRAMBLE_PLAYER_IDS: WordScramblePlayerId[] = [
  "player-1",
  "player-2",
];

export function createWordScrambleLobby(
  code: string,
  playerName = "Player 1",
  now = Date.now(),
  puzzle = pickWordScramblePuzzle(),
  scrambledWord = createScrambledWord(puzzle.word),
  rejoinTokenHash?: string,
): WordScrambleLobby {
  return {
    code,
    puzzle,
    scrambledWord,
    players: [
      createWordScramblePlayer(
        "player-1",
        playerName,
        "Player 1",
        rejoinTokenHash,
      ),
    ],
    status: "waiting",
    winnerId: null,
    startedAt: null,
    createdAt: now,
    updatedAt: now,
    waitingExpiresAt: getWaitingLobbyExpiresAt(now),
  };
}

export function createWordScrambleSoloGame(
  previousWord?: string,
): WordScrambleSoloGame {
  const puzzle = pickWordScramblePuzzle(previousWord);

  return {
    puzzle,
    scrambledWord: createScrambledWord(puzzle.word),
    guesses: [],
    status: "playing",
  };
}

export function joinWordScrambleLobby(
  lobby: WordScrambleLobby,
  playerName = "Player 2",
  now = Date.now(),
  rejoinTokenHash?: string,
): WordScrambleLobby {
  if (lobby.players.length >= WORD_SCRAMBLE_PLAYER_IDS.length) {
    return lobby;
  }

  const nextPlayerId = WORD_SCRAMBLE_PLAYER_IDS[lobby.players.length];

  return {
    ...lobby,
    players: [
      ...lobby.players,
      createWordScramblePlayer(
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

export function readyWordScramblePlayer(
  lobby: WordScrambleLobby,
  playerId: WordScramblePlayerId,
  now = Date.now(),
): WordScrambleLobby {
  if (lobby.status !== "waiting" && lobby.status !== "readying") {
    return lobby;
  }

  const players = lobby.players.map((player) =>
    player.id === playerId ? { ...player, isReady: true } : player,
  );
  const shouldStart =
    players.length === WORD_SCRAMBLE_PLAYER_IDS.length &&
    players.every((player) => player.isReady);

  return {
    ...lobby,
    players: shouldStart
      ? players.map((player) => ({
          ...player,
          guesses: [],
          solvedAt: null,
          elapsedMs: null,
        }))
      : players,
    status:
      players.length < WORD_SCRAMBLE_PLAYER_IDS.length
        ? "waiting"
        : shouldStart
          ? "playing"
          : "readying",
    startedAt: shouldStart ? now : lobby.startedAt,
    updatedAt: now,
    waitingExpiresAt:
      players.length < WORD_SCRAMBLE_PLAYER_IDS.length
        ? (lobby.waitingExpiresAt ?? getWaitingLobbyExpiresAt(now))
        : null,
  };
}

export function restartWordScrambleLobby(
  lobby: WordScrambleLobby,
  now = Date.now(),
  puzzle = pickWordScramblePuzzle(lobby.puzzle.word),
): WordScrambleLobby {
  return {
    ...lobby,
    puzzle,
    scrambledWord: createScrambledWord(puzzle.word),
    players: lobby.players.map((player) => ({
      ...player,
      isReady: false,
      guesses: [],
      solvedAt: null,
      elapsedMs: null,
    })),
    status:
      lobby.players.length < WORD_SCRAMBLE_PLAYER_IDS.length
        ? "waiting"
        : "readying",
    winnerId: null,
    startedAt: null,
    updatedAt: now,
    waitingExpiresAt:
      lobby.players.length < WORD_SCRAMBLE_PLAYER_IDS.length
        ? (lobby.waitingExpiresAt ?? getWaitingLobbyExpiresAt(now))
        : null,
  };
}

export function submitWordScrambleSoloGuess(
  game: WordScrambleSoloGame,
  guess: string,
): WordScrambleSoloGame {
  const normalizedGuess = normalizeWordScrambleGuess(guess);

  if (
    !normalizedGuess ||
    game.status !== "playing" ||
    game.guesses.includes(normalizedGuess)
  ) {
    return game;
  }

  const guesses = [...game.guesses, normalizedGuess];
  const isSolved = normalizedGuess === game.puzzle.word;
  const isLost = !isSolved && guesses.length >= WORD_SCRAMBLE_MAX_GUESSES;

  return {
    ...game,
    guesses,
    status: isSolved ? "won" : isLost ? "lost" : "playing",
  };
}

export function submitWordScrambleGuess(
  lobby: WordScrambleLobby,
  playerId: WordScramblePlayerId,
  guess: string,
  now = Date.now(),
): WordScrambleLobby {
  const normalizedGuess = normalizeWordScrambleGuess(guess);

  if (!normalizedGuess || lobby.status !== "playing" || !lobby.startedAt) {
    return lobby;
  }

  const player = lobby.players.find(({ id }) => id === playerId);

  if (
    !player ||
    player.solvedAt !== null ||
    isWordScramblePlayerOut(player) ||
    player.guesses.includes(normalizedGuess)
  ) {
    return lobby;
  }

  const guesses = [...player.guesses, normalizedGuess];
  const isSolved = normalizedGuess === lobby.puzzle.word;
  const elapsedMs = now - lobby.startedAt;
  const players = lobby.players.map((currentPlayer) =>
    currentPlayer.id === playerId
      ? {
          ...currentPlayer,
          guesses,
          solvedAt: isSolved ? now : currentPlayer.solvedAt,
          elapsedMs: isSolved ? elapsedMs : currentPlayer.elapsedMs,
        }
      : currentPlayer,
  );
  const winnerId = isSolved ? playerId : lobby.winnerId;
  const didEveryoneRunOut =
    !winnerId &&
    players.every(
      (currentPlayer) =>
        currentPlayer.solvedAt !== null ||
        currentPlayer.guesses.length >= WORD_SCRAMBLE_MAX_GUESSES,
    );

  return {
    ...lobby,
    players,
    winnerId,
    status: winnerId || didEveryoneRunOut ? "finished" : "playing",
    updatedAt: now,
  };
}

export function getWordScrambleLobbyView(
  lobby: WordScrambleLobby,
  playerId: WordScramblePlayerId,
): WordScrambleLobbyView | null {
  const localPlayer = lobby.players.find((player) => player.id === playerId);

  if (!localPlayer) {
    return null;
  }

  const shouldRevealPuzzle =
    lobby.status === "playing" || lobby.status === "finished";

  return {
    code: lobby.code,
    category: shouldRevealPuzzle ? lobby.puzzle.category : null,
    wordLength: lobby.puzzle.word.length,
    scrambledWord: shouldRevealPuzzle ? lobby.scrambledWord : null,
    revealedWord: lobby.status === "finished" ? lobby.puzzle.word : null,
    players: lobby.players.map((player) => ({
      id: player.id,
      name: player.name,
      isReady: player.isReady,
      guessCount: player.guesses.length,
      isSolved: player.solvedAt !== null,
      isOut: isWordScramblePlayerOut(player),
      elapsedMs: player.elapsedMs,
      lastGuess: player.guesses[player.guesses.length - 1] ?? null,
    })),
    localPlayerId: playerId,
    localGuesses: localPlayer.guesses,
    localLastGuess: localPlayer.guesses[localPlayer.guesses.length - 1] ?? null,
    status: lobby.status,
    winnerId: lobby.winnerId,
    startedAt: lobby.startedAt,
    updatedAt: lobby.updatedAt,
    waitingExpiresAt: lobby.waitingExpiresAt,
  };
}

export function pickWordScramblePuzzle(
  previousWord?: string,
): WordScramblePuzzle {
  const choices = previousWord
    ? WORD_SCRAMBLE_PUZZLES.filter((puzzle) => puzzle.word !== previousWord)
    : WORD_SCRAMBLE_PUZZLES;

  return (
    choices[Math.floor(Math.random() * choices.length)] ??
    WORD_SCRAMBLE_PUZZLES[0]
  );
}

export function createScrambledWord(word: string): string {
  const letters = word.split("");

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const scrambledWord = shuffle(letters).join("");

    if (scrambledWord !== word) {
      return scrambledWord;
    }
  }

  return forceDifferentArrangement(word);
}

export function normalizeWordScrambleGuess(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z]/g, "");
}

export function isWordScramblePlayerId(
  value: string,
): value is WordScramblePlayerId {
  return WORD_SCRAMBLE_PLAYER_IDS.includes(value as WordScramblePlayerId);
}

function createWordScramblePlayer(
  id: WordScramblePlayerId,
  name: string,
  fallback: string,
  rejoinTokenHash?: string,
): WordScramblePlayer {
  return {
    id,
    name: sanitizePlayerName(name, fallback),
    isReady: false,
    ...(rejoinTokenHash ? { rejoinTokenHash } : {}),
    guesses: [],
    solvedAt: null,
    elapsedMs: null,
  };
}

function isWordScramblePlayerOut(player: WordScramblePlayer): boolean {
  return (
    player.solvedAt === null &&
    player.guesses.length >= WORD_SCRAMBLE_MAX_GUESSES
  );
}

function shuffle<T>(items: T[]): T[] {
  const shuffledItems = [...items];

  for (let index = shuffledItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const item = shuffledItems[index];
    shuffledItems[index] = shuffledItems[swapIndex];
    shuffledItems[swapIndex] = item;
  }

  return shuffledItems;
}

function forceDifferentArrangement(word: string): string {
  const letters = word.split("");

  for (let index = 1; index < letters.length; index += 1) {
    if (letters[index] !== letters[0]) {
      const firstLetter = letters[0];
      letters[0] = letters[index];
      letters[index] = firstLetter;

      return letters.join("");
    }
  }

  return word;
}
