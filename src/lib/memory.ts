import { sanitizePlayerName } from "@/lib/lobby-utils";

export const MEMORY_CARD_VALUES = [
  "anchor",
  "bolt",
  "compass",
  "diamond",
  "flame",
  "heart",
  "star",
  "waves",
] as const;

export type MemoryCardValue = (typeof MEMORY_CARD_VALUES)[number];
export type MemoryPlayerId = "player-1" | "player-2";
export type MemoryStatus = "waiting" | "playing" | "settling" | "finished";
export type MemorySoloStatus = Exclude<MemoryStatus, "waiting">;

export type MemoryPlayer = {
  id: MemoryPlayerId;
  name: string;
  score: number;
};

export type MemoryCard = {
  id: string;
  value: MemoryCardValue;
  isMatched: boolean;
};

export type MemoryLobby = {
  code: string;
  cards: MemoryCard[];
  players: MemoryPlayer[];
  currentPlayerId: MemoryPlayerId;
  flippedCardIds: string[];
  status: MemoryStatus;
  winnerId: MemoryPlayerId | null;
  pendingHideAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type MemorySoloGame = {
  cards: MemoryCard[];
  flippedCardIds: string[];
  status: MemorySoloStatus;
  pendingHideAt: number | null;
  moves: number;
  matches: number;
};

export const MEMORY_MISMATCH_HIDE_DELAY_MS = 1_100;

const PLAYER_IDS: MemoryPlayerId[] = ["player-1", "player-2"];

export function createMemoryLobby(
  code: string,
  playerName = "Player 1",
  now = Date.now(),
): MemoryLobby {
  return {
    code,
    cards: createMemoryDeck(),
    players: [
      {
        id: "player-1",
        name: sanitizePlayerName(playerName, "Player 1"),
        score: 0,
      },
    ],
    currentPlayerId: "player-1",
    flippedCardIds: [],
    status: "waiting",
    winnerId: null,
    pendingHideAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function createMemorySoloGame(): MemorySoloGame {
  return {
    cards: createMemoryDeck(),
    flippedCardIds: [],
    status: "playing",
    pendingHideAt: null,
    moves: 0,
    matches: 0,
  };
}

export function joinMemoryLobby(
  lobby: MemoryLobby,
  playerName = "Player 2",
  now = Date.now(),
): MemoryLobby {
  if (lobby.players.length >= PLAYER_IDS.length) {
    return lobby;
  }

  const nextPlayerId = PLAYER_IDS[lobby.players.length];

  return {
    ...lobby,
    players: [
      ...lobby.players,
      {
        id: nextPlayerId,
        name: sanitizePlayerName(playerName, `Player ${lobby.players.length + 1}`),
        score: 0,
      },
    ],
    status: "playing",
    updatedAt: now,
  };
}

export function restartMemoryLobby(
  lobby: MemoryLobby,
  now = Date.now(),
): MemoryLobby {
  return {
    ...lobby,
    cards: createMemoryDeck(),
    players: lobby.players.map((player) => ({
      ...player,
      score: 0,
    })),
    currentPlayerId: "player-1",
    flippedCardIds: [],
    status: lobby.players.length === PLAYER_IDS.length ? "playing" : "waiting",
    winnerId: null,
    pendingHideAt: null,
    updatedAt: now,
  };
}

export function restartMemorySoloGame(): MemorySoloGame {
  return createMemorySoloGame();
}

export function settleMemoryLobby(
  lobby: MemoryLobby,
  now = Date.now(),
): MemoryLobby {
  if (
    lobby.status !== "settling" ||
    lobby.pendingHideAt === null ||
    lobby.pendingHideAt > now
  ) {
    return lobby;
  }

  return {
    ...lobby,
    flippedCardIds: [],
    status: "playing",
    pendingHideAt: null,
    updatedAt: now,
  };
}

export function settleMemorySoloGame(
  game: MemorySoloGame,
  now = Date.now(),
): MemorySoloGame {
  if (
    game.status !== "settling" ||
    game.pendingHideAt === null ||
    game.pendingHideAt > now
  ) {
    return game;
  }

  return {
    ...game,
    flippedCardIds: [],
    status: "playing",
    pendingHideAt: null,
  };
}

export function flipMemoryCard(
  lobby: MemoryLobby,
  playerId: MemoryPlayerId,
  cardId: string,
  now = Date.now(),
): MemoryLobby {
  const settledLobby = settleMemoryLobby(lobby, now);

  if (
    settledLobby.status !== "playing" ||
    settledLobby.currentPlayerId !== playerId ||
    settledLobby.flippedCardIds.length >= 2
  ) {
    return settledLobby;
  }

  const selectedCard = settledLobby.cards.find((card) => card.id === cardId);

  if (
    !selectedCard ||
    selectedCard.isMatched ||
    settledLobby.flippedCardIds.includes(cardId)
  ) {
    return settledLobby;
  }

  if (settledLobby.flippedCardIds.length === 0) {
    return {
      ...settledLobby,
      flippedCardIds: [cardId],
      updatedAt: now,
    };
  }

  const firstCardId = settledLobby.flippedCardIds[0];
  const firstCard = settledLobby.cards.find((card) => card.id === firstCardId);

  if (!firstCard) {
    return {
      ...settledLobby,
      flippedCardIds: [cardId],
      updatedAt: now,
    };
  }

  if (firstCard.value === selectedCard.value) {
    const cards = settledLobby.cards.map((card) =>
      card.id === firstCard.id || card.id === selectedCard.id
        ? { ...card, isMatched: true }
        : card,
    );
    const players = settledLobby.players.map((player) =>
      player.id === playerId ? { ...player, score: player.score + 1 } : player,
    );
    const isFinished = cards.every((card) => card.isMatched);

    return {
      ...settledLobby,
      cards,
      players,
      flippedCardIds: [],
      status: isFinished ? "finished" : "playing",
      winnerId: isFinished ? getWinningPlayerId(players) : null,
      updatedAt: now,
    };
  }

  return {
    ...settledLobby,
    currentPlayerId: getNextMemoryPlayer(playerId),
    flippedCardIds: [firstCardId, cardId],
    status: "settling",
    pendingHideAt: now + MEMORY_MISMATCH_HIDE_DELAY_MS,
    updatedAt: now,
  };
}

export function flipMemorySoloCard(
  game: MemorySoloGame,
  cardId: string,
  now = Date.now(),
): MemorySoloGame {
  const settledGame = settleMemorySoloGame(game, now);

  if (settledGame.status !== "playing" || settledGame.flippedCardIds.length >= 2) {
    return settledGame;
  }

  const selectedCard = settledGame.cards.find((card) => card.id === cardId);

  if (
    !selectedCard ||
    selectedCard.isMatched ||
    settledGame.flippedCardIds.includes(cardId)
  ) {
    return settledGame;
  }

  if (settledGame.flippedCardIds.length === 0) {
    return {
      ...settledGame,
      flippedCardIds: [cardId],
    };
  }

  const firstCardId = settledGame.flippedCardIds[0];
  const firstCard = settledGame.cards.find((card) => card.id === firstCardId);

  if (!firstCard) {
    return {
      ...settledGame,
      flippedCardIds: [cardId],
    };
  }

  if (firstCard.value === selectedCard.value) {
    const cards = settledGame.cards.map((card) =>
      card.id === firstCard.id || card.id === selectedCard.id
        ? { ...card, isMatched: true }
        : card,
    );
    const matches = settledGame.matches + 1;
    const isFinished = cards.every((card) => card.isMatched);

    return {
      ...settledGame,
      cards,
      flippedCardIds: [],
      status: isFinished ? "finished" : "playing",
      moves: settledGame.moves + 1,
      matches,
    };
  }

  return {
    ...settledGame,
    flippedCardIds: [firstCardId, cardId],
    status: "settling",
    pendingHideAt: now + MEMORY_MISMATCH_HIDE_DELAY_MS,
    moves: settledGame.moves + 1,
  };
}

export function isMemoryPlayerId(value: string): value is MemoryPlayerId {
  return PLAYER_IDS.includes(value as MemoryPlayerId);
}

export function getNextMemoryPlayer(playerId: MemoryPlayerId): MemoryPlayerId {
  return playerId === "player-1" ? "player-2" : "player-1";
}

function createMemoryDeck(): MemoryCard[] {
  const pairs = MEMORY_CARD_VALUES.flatMap((value) => [
    {
      id: `${value}-a`,
      value,
      isMatched: false,
    },
    {
      id: `${value}-b`,
      value,
      isMatched: false,
    },
  ]);

  return shuffle(pairs);
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

function getWinningPlayerId(players: MemoryPlayer[]): MemoryPlayerId | null {
  const [firstPlayer, secondPlayer] = players;

  if (!firstPlayer || !secondPlayer || firstPlayer.score === secondPlayer.score) {
    return null;
  }

  return firstPlayer.score > secondPlayer.score ? firstPlayer.id : secondPlayer.id;
}
