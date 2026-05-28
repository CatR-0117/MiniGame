import { getWaitingLobbyExpiresAt, sanitizePlayerName } from "@/lib/lobby-utils";

export type HangmanPuzzle = {
  word: string;
  category: string;
};

export type HangmanPlayerId = "player-1" | "player-2";
export type HangmanLobbyStatus = "waiting" | "readying" | "playing" | "finished";

export type HangmanPlayer = {
  id: HangmanPlayerId;
  name: string;
  isReady: boolean;
  rejoinTokenHash?: string;
  guessedLetters: string[];
  solvedAt: number | null;
  lostAt: number | null;
  elapsedMs: number | null;
};

export type HangmanLobby = {
  code: string;
  puzzle: HangmanPuzzle;
  players: HangmanPlayer[];
  status: HangmanLobbyStatus;
  winnerId: HangmanPlayerId | null;
  startedAt: number | null;
  createdAt: number;
  updatedAt: number;
  waitingExpiresAt: number | null;
};

export type HangmanPublicPlayer = {
  id: HangmanPlayerId;
  name: string;
  isReady: boolean;
  missedCount: number;
  guessedCount: number;
  isSolved: boolean;
  isLost: boolean;
  elapsedMs: number | null;
};

export type HangmanLobbyView = {
  code: string;
  category: string | null;
  wordLength: number;
  wordSlots: string[];
  revealedWord: string | null;
  players: HangmanPublicPlayer[];
  localPlayerId: HangmanPlayerId;
  localGuessedLetters: string[];
  localMissedLetters: string[];
  localLastGuess: string | null;
  status: HangmanLobbyStatus;
  winnerId: HangmanPlayerId | null;
  startedAt: number | null;
  updatedAt: number;
  waitingExpiresAt: number | null;
};

export const HANGMAN_MAX_MISSES = 6;
export const HANGMAN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export const HANGMAN_PUZZLES: HangmanPuzzle[] = [
  { word: "ARCADE", category: "Games" },
  { word: "MINECRAFT", category: "Games" },
  { word: "FORTNITE", category: "Games" },
  { word: "CHESS", category: "Games" },
  { word: "PUZZLE", category: "Games" },

  { word: "ELEPHANT", category: "Animals" },
  { word: "KANGAROO", category: "Animals" },
  { word: "DOLPHIN", category: "Animals" },
  { word: "CROCODILE", category: "Animals" },
  { word: "PENGUIN", category: "Animals" },

  { word: "PIZZA", category: "Food" },
  { word: "HAMBURGER", category: "Food" },
  { word: "SPAGHETTI", category: "Food" },
  { word: "CHOCOLATE", category: "Food" },
  { word: "SANDWICH", category: "Food" },

  { word: "GALAXY", category: "Space" },
  { word: "ASTRONAUT", category: "Space" },
  { word: "SATELLITE", category: "Space" },
  { word: "TELESCOPE", category: "Space" },
  { word: "METEORITE", category: "Space" },

  { word: "LONDON", category: "Cities" },
  { word: "TOKYO", category: "Cities" },
  { word: "PARIS", category: "Cities" },
  { word: "SYDNEY", category: "Cities" },
  { word: "DUBAI", category: "Cities" },

  { word: "VOLCANO", category: "Nature" },
  { word: "THUNDER", category: "Nature" },
  { word: "HURRICANE", category: "Nature" },
  { word: "WATERFALL", category: "Nature" },
  { word: "RAINBOW", category: "Nature" },

  { word: "AIRPLANE", category: "Transport" },
  { word: "SUBMARINE", category: "Transport" },
  { word: "MOTORCYCLE", category: "Transport" },
  { word: "HELICOPTER", category: "Transport" },
  { word: "BICYCLE", category: "Transport" },

  { word: "VAMPIRE", category: "Fantasy" },
  { word: "DRAGON", category: "Fantasy" },
  { word: "WIZARD", category: "Fantasy" },
  { word: "UNICORN", category: "Fantasy" },
  { word: "PHOENIX", category: "Fantasy" },

  { word: "BASKETBALL", category: "Sports" },
  { word: "BADMINTON", category: "Sports" },
  { word: "SKATEBOARD", category: "Sports" },
  { word: "SWIMMING", category: "Sports" },
  { word: "VOLLEYBALL", category: "Sports" },

  { word: "SMARTPHONE", category: "Technology" },
  { word: "KEYBOARD", category: "Technology" },
  { word: "HEADPHONES", category: "Technology" },
  { word: "ROBOTICS", category: "Technology" },
  { word: "ARTIFICIAL", category: "Technology" },

  { word: "TREASURE", category: "Adventure" },
  { word: "EXPEDITION", category: "Adventure" },
  { word: "MOUNTAINEER", category: "Adventure" },
  { word: "SURVIVAL", category: "Adventure" },
  { word: "DISCOVERY", category: "Adventure" },

  { word: "DOCTOR", category: "Jobs" },
  { word: "ENGINEER", category: "Jobs" },
  { word: "ARCHITECT", category: "Jobs" },
  { word: "SCIENTIST", category: "Jobs" },
  { word: "FIREFIGHTER", category: "Jobs" },
];

const HANGMAN_PLAYER_IDS: HangmanPlayerId[] = ["player-1", "player-2"];

export function createHangmanLobby(
  code: string,
  playerName = "Player 1",
  now = Date.now(),
  puzzle = pickHangmanPuzzle(),
  rejoinTokenHash?: string,
): HangmanLobby {
  return {
    code,
    puzzle,
    players: [
      createHangmanPlayer("player-1", playerName, "Player 1", rejoinTokenHash),
    ],
    status: "waiting",
    winnerId: null,
    startedAt: null,
    createdAt: now,
    updatedAt: now,
    waitingExpiresAt: getWaitingLobbyExpiresAt(now),
  };
}

export function joinHangmanLobby(
  lobby: HangmanLobby,
  playerName = "Player 2",
  now = Date.now(),
  rejoinTokenHash?: string,
): HangmanLobby {
  if (lobby.players.length >= HANGMAN_PLAYER_IDS.length) {
    return lobby;
  }

  const nextPlayerId = HANGMAN_PLAYER_IDS[lobby.players.length];

  return {
    ...lobby,
    players: [
      ...lobby.players,
      createHangmanPlayer(
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

export function readyHangmanPlayer(
  lobby: HangmanLobby,
  playerId: HangmanPlayerId,
  now = Date.now(),
): HangmanLobby {
  if (lobby.status !== "waiting" && lobby.status !== "readying") {
    return lobby;
  }

  const players = lobby.players.map((player) =>
    player.id === playerId ? { ...player, isReady: true } : player,
  );
  const shouldStart =
    players.length === HANGMAN_PLAYER_IDS.length &&
    players.every((player) => player.isReady);

  return {
    ...lobby,
    players: shouldStart
      ? players.map((player) => ({
          ...player,
          guessedLetters: [],
          solvedAt: null,
          lostAt: null,
          elapsedMs: null,
        }))
      : players,
    status:
      players.length < HANGMAN_PLAYER_IDS.length
        ? "waiting"
        : shouldStart
          ? "playing"
          : "readying",
    startedAt: shouldStart ? now : lobby.startedAt,
    updatedAt: now,
    waitingExpiresAt:
      players.length < HANGMAN_PLAYER_IDS.length
        ? (lobby.waitingExpiresAt ?? getWaitingLobbyExpiresAt(now))
        : null,
  };
}

export function restartHangmanLobby(
  lobby: HangmanLobby,
  now = Date.now(),
  puzzle = pickHangmanPuzzle(lobby.puzzle.word),
): HangmanLobby {
  return {
    ...lobby,
    puzzle,
    players: lobby.players.map((player) => ({
      ...player,
      isReady: false,
      guessedLetters: [],
      solvedAt: null,
      lostAt: null,
      elapsedMs: null,
    })),
    status:
      lobby.players.length < HANGMAN_PLAYER_IDS.length ? "waiting" : "readying",
    winnerId: null,
    startedAt: null,
    updatedAt: now,
    waitingExpiresAt:
      lobby.players.length < HANGMAN_PLAYER_IDS.length
        ? (lobby.waitingExpiresAt ?? getWaitingLobbyExpiresAt(now))
        : null,
  };
}

export function guessHangmanLetter(
  lobby: HangmanLobby,
  playerId: HangmanPlayerId,
  letter: string,
  now = Date.now(),
): HangmanLobby {
  const normalizedLetter = normalizeHangmanLetter(letter);

  if (!normalizedLetter || lobby.status !== "playing" || !lobby.startedAt) {
    return lobby;
  }

  const player = lobby.players.find(({ id }) => id === playerId);

  if (
    !player ||
    player.solvedAt !== null ||
    player.lostAt !== null ||
    player.guessedLetters.includes(normalizedLetter)
  ) {
    return lobby;
  }

  const wordLetters = getHangmanUniqueLetters(lobby.puzzle.word);
  const guessedLetters = [...player.guessedLetters, normalizedLetter];
  const missedCount = getMissedLetters(guessedLetters, wordLetters).length;
  const isSolved = wordLetters.every((wordLetter) =>
    guessedLetters.includes(wordLetter),
  );
  const isLost = missedCount >= HANGMAN_MAX_MISSES;
  const elapsedMs = now - lobby.startedAt;

  const players = lobby.players.map((currentPlayer) =>
    currentPlayer.id === playerId
      ? {
          ...currentPlayer,
          guessedLetters,
          solvedAt: isSolved ? now : currentPlayer.solvedAt,
          lostAt: isLost ? now : currentPlayer.lostAt,
          elapsedMs: isSolved || isLost ? elapsedMs : currentPlayer.elapsedMs,
        }
      : currentPlayer,
  );
  const winnerId = isSolved ? playerId : lobby.winnerId;
  const didEveryoneLose =
    !winnerId && players.every((currentPlayer) => currentPlayer.lostAt !== null);

  return {
    ...lobby,
    players,
    winnerId,
    status: winnerId || didEveryoneLose ? "finished" : "playing",
    updatedAt: now,
  };
}

export function getHangmanLobbyView(
  lobby: HangmanLobby,
  playerId: HangmanPlayerId,
): HangmanLobbyView | null {
  const localPlayer = lobby.players.find((player) => player.id === playerId);

  if (!localPlayer) {
    return null;
  }

  const wordLetters = getHangmanUniqueLetters(lobby.puzzle.word);
  const localMissedLetters = getMissedLetters(
    localPlayer.guessedLetters,
    wordLetters,
  );
  const shouldRevealWord = lobby.status === "finished";

  return {
    code: lobby.code,
    category:
      lobby.status === "playing" || lobby.status === "finished"
        ? lobby.puzzle.category
        : null,
    wordLength: lobby.puzzle.word.length,
    wordSlots: lobby.puzzle.word
      .split("")
      .map((letter) =>
        shouldRevealWord || localPlayer.guessedLetters.includes(letter)
          ? letter
          : "_",
      ),
    revealedWord: shouldRevealWord ? lobby.puzzle.word : null,
    players: lobby.players.map((player) => {
      const missedLetters = getMissedLetters(player.guessedLetters, wordLetters);

      return {
        id: player.id,
        name: player.name,
        isReady: player.isReady,
        missedCount: missedLetters.length,
        guessedCount: player.guessedLetters.length,
        isSolved: player.solvedAt !== null,
        isLost: player.lostAt !== null,
        elapsedMs: player.elapsedMs,
      };
    }),
    localPlayerId: playerId,
    localGuessedLetters: localPlayer.guessedLetters,
    localMissedLetters,
    localLastGuess:
      localPlayer.guessedLetters[localPlayer.guessedLetters.length - 1] ?? null,
    status: lobby.status,
    winnerId: lobby.winnerId,
    startedAt: lobby.startedAt,
    updatedAt: lobby.updatedAt,
    waitingExpiresAt: lobby.waitingExpiresAt,
  };
}

export function pickHangmanPuzzle(previousWord?: string): HangmanPuzzle {
  const choices = previousWord
    ? HANGMAN_PUZZLES.filter((puzzle) => puzzle.word !== previousWord)
    : HANGMAN_PUZZLES;

  return (
    choices[Math.floor(Math.random() * choices.length)] ?? HANGMAN_PUZZLES[0]
  );
}

export function getHangmanUniqueLetters(word: string): string[] {
  return Array.from(new Set(word.replace(/[^A-Z]/g, "").split("")));
}

export function normalizeHangmanLetter(value: string): string | null {
  return /^[a-z]$/i.test(value) ? value.toUpperCase() : null;
}

export function isHangmanPlayerId(value: string): value is HangmanPlayerId {
  return HANGMAN_PLAYER_IDS.includes(value as HangmanPlayerId);
}

function createHangmanPlayer(
  id: HangmanPlayerId,
  name: string,
  fallback: string,
  rejoinTokenHash?: string,
): HangmanPlayer {
  return {
    id,
    name: sanitizePlayerName(name, fallback),
    isReady: false,
    ...(rejoinTokenHash ? { rejoinTokenHash } : {}),
    guessedLetters: [],
    solvedAt: null,
    lostAt: null,
    elapsedMs: null,
  };
}

function getMissedLetters(
  guessedLetters: string[],
  wordLetters: string[],
): string[] {
  return guessedLetters.filter((letter) => !wordLetters.includes(letter));
}
