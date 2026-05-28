"use client";

import {
  Anchor,
  Bolt,
  Bot,
  Compass,
  Copy,
  Diamond,
  Flame,
  Heart,
  Layers,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Star,
  Trophy,
  Users,
  Waves,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  createMemorySoloGame,
  flipMemorySoloCard,
  isMemoryPlayerId,
  restartMemorySoloGame,
  settleMemorySoloGame,
  type MemoryCard,
  type MemoryCardValue,
  type MemoryLobby,
  type MemoryPlayer,
  type MemoryPlayerId,
  type MemorySoloGame,
} from "@/lib/memory";
import { getErrorMessage, getJson, postJson } from "@/lib/http-client";
import { normalizeLobbyCode } from "@/lib/lobby-utils";

type LobbyResponse = {
  lobby: MemoryLobby;
};

type LobbyWithPlayerResponse = LobbyResponse & {
  playerId: MemoryPlayerId;
};

type SavedMemorySession = {
  code: string;
  playerId: MemoryPlayerId;
};

type MemoryPlayMode = "solo" | "lobby";

type CardFace = {
  label: string;
  icon: typeof Star;
  className: string;
  iconClassName: string;
};

const CARD_FACES: Record<MemoryCardValue, CardFace> = {
  anchor: {
    label: "Anchor",
    icon: Anchor,
    className: "border-sky-200/60 bg-sky-300/15 text-sky-100",
    iconClassName: "text-sky-200",
  },
  bolt: {
    label: "Bolt",
    icon: Bolt,
    className: "border-yellow-200/60 bg-yellow-300/15 text-yellow-100",
    iconClassName: "text-yellow-200",
  },
  compass: {
    label: "Compass",
    icon: Compass,
    className: "border-lime-200/60 bg-lime-300/15 text-lime-100",
    iconClassName: "text-lime-200",
  },
  diamond: {
    label: "Diamond",
    icon: Diamond,
    className: "border-violet-200/60 bg-violet-300/15 text-violet-100",
    iconClassName: "text-violet-200",
  },
  flame: {
    label: "Flame",
    icon: Flame,
    className: "border-orange-200/60 bg-orange-300/15 text-orange-100",
    iconClassName: "text-orange-200",
  },
  heart: {
    label: "Heart",
    icon: Heart,
    className: "border-rose-200/60 bg-rose-300/15 text-rose-100",
    iconClassName: "text-rose-200",
  },
  star: {
    label: "Star",
    icon: Star,
    className: "border-teal-200/60 bg-teal-300/15 text-teal-100",
    iconClassName: "text-teal-200",
  },
  waves: {
    label: "Waves",
    icon: Waves,
    className: "border-cyan-200/60 bg-cyan-300/15 text-cyan-100",
    iconClassName: "text-cyan-200",
  },
};

const SESSION_STORAGE_KEY = "mini-arcade-memory-session";

const MODE_OPTIONS: Array<{
  mode: MemoryPlayMode;
  label: string;
  icon: typeof Bot;
}> = [
  { mode: "solo", label: "Solo", icon: Bot },
  { mode: "lobby", label: "Lobby", icon: Users },
];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function MemoryCardGame() {
  const [playMode, setPlayMode] = useState<MemoryPlayMode>("solo");
  const [soloGame, setSoloGame] = useState<MemorySoloGame>(() =>
    createMemorySoloGame(),
  );
  const [lobby, setLobby] = useState<MemoryLobby | null>(null);
  const [playerId, setPlayerId] = useState<MemoryPlayerId | null>(null);
  const [playerName, setPlayerName] = useState("Player");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [pendingCardId, setPendingCardId] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [hasCopiedCode, setHasCopiedCode] = useState(false);

  const refreshLobby = useCallback(async (code: string) => {
    const response = await getJson<LobbyResponse>(
      `/api/memory/lobbies/${encodeURIComponent(code)}`,
    );

    setLobby(response.lobby);
  }, []);

  useEffect(() => {
    const savedSession = readSavedSession();
    let isActive = true;

    const restoreTimeoutId = window.setTimeout(() => {
      if (!isActive) {
        return;
      }

      if (!savedSession) {
        setIsRestoring(false);
        return;
      }

      setPlayMode("lobby");
      setPlayerId(savedSession.playerId);

      refreshLobby(savedSession.code)
        .catch(() => {
          window.sessionStorage.removeItem(SESSION_STORAGE_KEY);

          if (isActive) {
            setPlayerId(null);
          }
        })
        .finally(() => {
          if (isActive) {
            setIsRestoring(false);
          }
        });
    }, 0);

    return () => {
      isActive = false;
      window.clearTimeout(restoreTimeoutId);
    };
  }, [refreshLobby]);

  useEffect(() => {
    if (!lobby?.code || playMode !== "lobby") {
      return;
    }

    let isActive = true;

    const pollLobby = async () => {
      try {
        const response = await getJson<LobbyResponse>(
          `/api/memory/lobbies/${encodeURIComponent(lobby.code)}`,
        );

        if (isActive) {
          setLobby(response.lobby);
        }
      } catch {
        if (isActive) {
          setError("Lobby is no longer available.");
        }
      }
    };

    const intervalId = window.setInterval(pollLobby, 900);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [lobby?.code, playMode]);

  useEffect(() => {
    if (soloGame.status !== "settling" || soloGame.pendingHideAt === null) {
      return;
    }

    const delay = Math.max(0, soloGame.pendingHideAt - Date.now());
    const timeoutId = window.setTimeout(() => {
      setSoloGame((currentGame) => settleMemorySoloGame(currentGame));
    }, delay);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [soloGame.pendingHideAt, soloGame.status]);

  const currentPlayer = useMemo(
    () =>
      lobby?.players.find((player) => player.id === lobby.currentPlayerId) ??
      null,
    [lobby],
  );
  const localPlayer = useMemo(
    () => lobby?.players.find((player) => player.id === playerId) ?? null,
    [lobby, playerId],
  );
  const statusText = useMemo(
    () => getStatusText(lobby, playerId, currentPlayer),
    [currentPlayer, lobby, playerId],
  );
  const isMyTurn =
    lobby !== null &&
    playerId !== null &&
    lobby.status === "playing" &&
    lobby.currentPlayerId === playerId;
  const soloStatusText = getSoloStatusText(soloGame);

  function handleModeChange(nextMode: MemoryPlayMode) {
    setPlayMode(nextMode);
    setError("");
  }

  function handleSoloFlipCard(card: MemoryCard) {
    setSoloGame((currentGame) => flipMemorySoloCard(currentGame, card.id));
  }

  function handleSoloRestart() {
    setSoloGame(restartMemorySoloGame());
    setError("");
  }

  async function handleCreateLobby() {
    setIsBusy(true);
    setError("");

    try {
      const response = await postJson<LobbyWithPlayerResponse>(
        "/api/memory/lobbies",
        { playerName },
      );

      setLobby(response.lobby);
      setPlayerId(response.playerId);
      setPlayMode("lobby");
      setJoinCode("");
      rememberSession(response.lobby.code, response.playerId);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleJoinLobby(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const code = cleanLobbyCode(joinCode);

    if (!code) {
      setError("Enter a lobby code.");
      return;
    }

    setIsBusy(true);
    setError("");

    try {
      const response = await postJson<LobbyWithPlayerResponse>(
        `/api/memory/lobbies/${encodeURIComponent(code)}/join`,
        { playerName },
      );

      setLobby(response.lobby);
      setPlayerId(response.playerId);
      setPlayMode("lobby");
      rememberSession(response.lobby.code, response.playerId);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleFlipCard(card: MemoryCard) {
    if (!lobby || !playerId || pendingCardId) {
      return;
    }

    setPendingCardId(card.id);
    setError("");

    try {
      const response = await postJson<LobbyResponse>(
        `/api/memory/lobbies/${encodeURIComponent(lobby.code)}/flip`,
        {
          playerId,
          cardId: card.id,
        },
      );

      setLobby(response.lobby);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setPendingCardId(null);
    }
  }

  async function handleRestartLobby() {
    if (!lobby || !playerId) {
      return;
    }

    setIsBusy(true);
    setError("");

    try {
      const response = await postJson<LobbyResponse>(
        `/api/memory/lobbies/${encodeURIComponent(lobby.code)}/restart`,
        { playerId },
      );

      setLobby(response.lobby);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCopyLobbyCode() {
    if (!lobby) {
      return;
    }

    await navigator.clipboard.writeText(lobby.code);
    setHasCopiedCode(true);
    window.setTimeout(() => setHasCopiedCode(false), 1_500);
  }

  function handleLeaveLobby() {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    setLobby(null);
    setPlayerId(null);
    setJoinCode("");
    setError("");
  }

  if (playMode === "solo") {
    return (
      <section aria-labelledby="memory-title" className="grid gap-4 sm:gap-5">
        <MemoryHeader
          onModeChange={handleModeChange}
          playMode={playMode}
        />

        <MemoryPlaySurface
          actionButtons={
            <button
              type="button"
              onClick={handleSoloRestart}
              className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-teal-300 px-4 text-sm font-black text-slate-950 transition hover:bg-teal-200"
            >
              <RefreshCw aria-hidden="true" className="size-4" />
              New Deck
            </button>
          }
          cards={soloGame.cards}
          flippedCardIds={soloGame.flippedCardIds}
          isCardDisabled={(card) =>
            soloGame.status !== "playing" ||
            card.isMatched ||
            soloGame.flippedCardIds.includes(card.id)
          }
          onFlipCard={handleSoloFlipCard}
          sidePanel={
            <SoloStatsPanel
              matches={soloGame.matches}
              moves={soloGame.moves}
              totalPairs={soloGame.cards.length / 2}
            />
          }
          statusText={soloStatusText}
        />
      </section>
    );
  }

  if (!lobby) {
    return (
      <section aria-labelledby="memory-title" className="grid gap-4 sm:gap-5">
        <MemoryHeader
          onModeChange={handleModeChange}
          playMode={playMode}
        />

        <section className="grid gap-4 rounded-lg border border-white/10 bg-slate-950/70 p-3 shadow-2xl shadow-black/25 sm:p-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <div className="grid content-start gap-4">
            <label className="grid gap-2 text-sm font-bold text-slate-200">
              Player Name
              <input
                value={playerName}
                onChange={(event) => setPlayerName(event.target.value)}
                className="min-h-12 rounded-lg border border-white/10 bg-white/[0.07] px-3 text-base font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-teal-200/80"
                maxLength={24}
                placeholder="Player"
              />
            </label>

            <button
              type="button"
              onClick={handleCreateLobby}
              disabled={isBusy || isRestoring}
              className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-teal-300 px-4 text-sm font-black text-slate-950 transition hover:bg-teal-200 disabled:cursor-wait disabled:opacity-70"
            >
              <Plus aria-hidden="true" className="size-4" />
              Create Lobby
            </button>
          </div>

          <form onSubmit={handleJoinLobby} className="grid content-start gap-4">
            <label className="grid gap-2 text-sm font-bold text-slate-200">
              Lobby Code
              <input
                aria-label="Lobby code"
                value={joinCode}
                onChange={(event) =>
                  setJoinCode(cleanLobbyCode(event.target.value))
                }
                className="min-h-12 rounded-lg border border-white/10 bg-white/[0.07] px-3 text-base font-black uppercase tracking-[0.2em] text-white outline-none transition placeholder:tracking-normal placeholder:text-slate-500 focus:border-teal-200/80"
                inputMode="text"
                maxLength={6}
                placeholder="ABC123"
              />
            </label>

            <button
              type="submit"
              disabled={isBusy || isRestoring}
              className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.07] px-4 text-sm font-black text-slate-100 transition hover:bg-white/12 disabled:cursor-wait disabled:opacity-70"
            >
              <LogIn aria-hidden="true" className="size-4" />
              Join Lobby
            </button>
          </form>
        </section>

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-rose-300/30 bg-rose-300/10 px-4 py-3 text-sm font-bold text-rose-100"
          >
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section aria-labelledby="memory-title" className="grid gap-4 sm:gap-5">
      <MemoryHeader
        actions={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <button
              type="button"
              onClick={handleRestartLobby}
              disabled={isBusy || !playerId}
              className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-teal-300 px-4 text-sm font-black text-slate-950 transition hover:bg-teal-200 disabled:cursor-wait disabled:opacity-70"
            >
              <RefreshCw aria-hidden="true" className="size-4" />
              New Deck
            </button>
            <button
              type="button"
              onClick={handleLeaveLobby}
              className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.07] px-4 text-sm font-black text-slate-100 transition hover:bg-white/12"
            >
              <LogOut aria-hidden="true" className="size-4" />
              Leave
            </button>
          </div>
        }
        onModeChange={handleModeChange}
        playMode={playMode}
      />

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-5">
        <div className="flex flex-col items-center gap-4">
          <div
            aria-label="Memory card board"
            className="grid w-full max-w-[560px] grid-cols-4 gap-2 rounded-lg border border-white/10 bg-slate-950/75 p-2 shadow-2xl shadow-black/30 sm:gap-3 sm:p-3"
          >
            {lobby.cards.map((card, index) => {
              const isVisible =
                card.isMatched || lobby.flippedCardIds.includes(card.id);
              const canFlip =
                isMyTurn &&
                !pendingCardId &&
                !isVisible &&
                lobby.status === "playing";

              return (
                <MemoryCardButton
                  key={card.id}
                  card={card}
                  index={index}
                  isVisible={isVisible}
                  disabled={!canFlip}
                  onClick={() => handleFlipCard(card)}
                />
              );
            })}
          </div>

          <div
            aria-live="polite"
            className="flex min-h-16 w-full max-w-[560px] flex-col items-stretch justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/65 px-3 py-3 min-[420px]:flex-row min-[420px]:items-center sm:px-4"
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                Status
              </p>
              <p className="mt-1 text-lg font-black text-teal-100 sm:text-xl">
                {statusText}
              </p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-right">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                Pairs
              </p>
              <p className="text-lg font-black text-white">
                {lobby.cards.filter((card) => card.isMatched).length / 2}/
                {lobby.cards.length / 2}
              </p>
            </div>
          </div>
        </div>

        <aside className="grid content-start gap-3">
          <div className="rounded-lg border border-white/10 bg-white/[0.07] p-3 sm:p-4">
            <div className="flex items-center gap-2 text-slate-300">
              <Users aria-hidden="true" className="size-4 text-teal-200" />
              <p className="text-xs font-bold uppercase tracking-[0.22em]">
                Lobby
              </p>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <output
                aria-label="Lobby code"
                className="rounded-md border border-teal-200/30 bg-teal-200/10 px-3 py-2 text-lg font-black tracking-[0.2em] text-teal-100 sm:text-xl"
              >
                {lobby.code}
              </output>
              <button
                type="button"
                onClick={handleCopyLobbyCode}
                className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.07] text-slate-100 transition hover:bg-white/12"
                title={hasCopiedCode ? "Copied" : "Copy lobby code"}
                aria-label={hasCopiedCode ? "Copied lobby code" : "Copy lobby code"}
              >
                <Copy aria-hidden="true" className="size-4" />
              </button>
            </div>
          </div>

          <div className="grid gap-3">
            {lobby.players.map((player) => (
              <PlayerScorePanel
                key={player.id}
                player={player}
                isCurrent={player.id === lobby.currentPlayerId}
                isLocal={player.id === localPlayer?.id}
              />
            ))}
            {lobby.players.length < 2 ? <WaitingPlayerPanel /> : null}
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.07] p-3 sm:p-4">
            <div className="flex items-center gap-2 text-slate-300">
              <Trophy aria-hidden="true" className="size-4 text-emerald-200" />
              <p className="text-xs font-bold uppercase tracking-[0.22em]">
                Result
              </p>
            </div>
            <p className="mt-3 text-sm font-bold text-slate-200">
              {getResultText(lobby)}
            </p>
          </div>
        </aside>
      </section>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-rose-300/30 bg-rose-300/10 px-4 py-3 text-sm font-bold text-rose-100"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}

function MemoryHeader({
  actions,
  onModeChange,
  playMode,
}: {
  actions?: ReactNode;
  onModeChange: (mode: MemoryPlayMode) => void;
  playMode: MemoryPlayMode;
}) {
  return (
    <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-teal-200/80 sm:tracking-[0.28em]">
          Match Pairs
        </p>
        <h2 id="memory-title" className="mt-1 text-2xl font-black text-white sm:mt-2 sm:text-5xl">
          Memory Cards
        </h2>
      </div>

      <div className="grid gap-2 sm:justify-items-end">
        <div className="grid w-full grid-cols-2 rounded-lg border border-white/10 bg-white/5 p-1 sm:w-auto">
          {MODE_OPTIONS.map(({ mode, label, icon: Icon }) => (
            <button
              key={mode}
              type="button"
              aria-pressed={playMode === mode}
              onClick={() => onModeChange(mode)}
              className={cn(
                "flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-md px-3 text-sm font-bold transition sm:px-4",
                playMode === mode
                  ? "bg-teal-300 text-slate-950 shadow-lg shadow-teal-950/40"
                  : "text-slate-300 hover:bg-white/10 hover:text-white",
              )}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              <span>{label}</span>
            </button>
          ))}
        </div>
        {actions}
      </div>
    </header>
  );
}

function MemoryPlaySurface({
  actionButtons,
  cards,
  flippedCardIds,
  isCardDisabled,
  onFlipCard,
  sidePanel,
  statusText,
}: {
  actionButtons: ReactNode;
  cards: MemoryCard[];
  flippedCardIds: string[];
  isCardDisabled: (card: MemoryCard) => boolean;
  onFlipCard: (card: MemoryCard) => void;
  sidePanel: ReactNode;
  statusText: string;
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-5">
      <div className="flex flex-col items-center gap-4">
        <div
          aria-label="Memory card board"
          className="grid w-full max-w-[560px] grid-cols-4 gap-2 rounded-lg border border-white/10 bg-slate-950/75 p-2 shadow-2xl shadow-black/30 sm:gap-3 sm:p-3"
        >
          {cards.map((card, index) => {
            const isVisible = card.isMatched || flippedCardIds.includes(card.id);

            return (
              <MemoryCardButton
                key={card.id}
                card={card}
                index={index}
                isVisible={isVisible}
                disabled={isCardDisabled(card)}
                onClick={() => onFlipCard(card)}
              />
            );
          })}
        </div>

        <div
          aria-live="polite"
          className="flex min-h-16 w-full max-w-[560px] flex-col items-stretch justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/65 px-3 py-3 min-[420px]:flex-row min-[420px]:items-center sm:px-4"
        >
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
              Status
            </p>
            <p className="mt-1 text-lg font-black text-teal-100 sm:text-xl">
              {statusText}
            </p>
          </div>
          <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-right">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
              Pairs
            </p>
            <p className="text-lg font-black text-white">
              {cards.filter((card) => card.isMatched).length / 2}/
              {cards.length / 2}
            </p>
          </div>
        </div>
      </div>

      <aside className="grid content-start gap-3">
        {sidePanel}
        {actionButtons}
      </aside>
    </section>
  );
}

function SoloStatsPanel({
  matches,
  moves,
  totalPairs,
}: {
  matches: number;
  moves: number;
  totalPairs: number;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-teal-300/30 bg-white/[0.07] p-3 sm:p-4">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
            Matches
          </p>
          <p className="mt-3 text-4xl font-black text-teal-100">
            {matches}
          </p>
        </div>
        <div className="rounded-lg border border-sky-300/30 bg-white/[0.07] p-3 sm:p-4">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
            Moves
          </p>
          <p className="mt-3 text-4xl font-black text-sky-100">{moves}</p>
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.07] p-3 sm:p-4">
        <div className="flex items-center gap-2 text-slate-300">
          <Trophy aria-hidden="true" className="size-4 text-emerald-200" />
          <p className="text-xs font-bold uppercase tracking-[0.22em]">
            Result
          </p>
        </div>
        <p className="mt-3 text-sm font-bold text-slate-200">
          {matches === totalPairs ? "Deck cleared" : "In progress"}
        </p>
      </div>
    </>
  );
}

function MemoryCardButton({
  card,
  index,
  isVisible,
  disabled,
  onClick,
}: {
  card: MemoryCard;
  index: number;
  isVisible: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const face = CARD_FACES[card.value];
  const Icon = face.icon;

  return (
    <button
      type="button"
      aria-label={
        isVisible
          ? `${face.label} card ${index + 1}${card.isMatched ? ", matched" : ""}`
          : `Hidden memory card ${index + 1}`
      }
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex aspect-[3/4] min-h-0 flex-col items-center justify-center gap-1 rounded-lg border p-1.5 text-center transition duration-200 sm:gap-2 sm:p-2",
        isVisible
          ? cn(face.className, card.isMatched && "ring-2 ring-emerald-200/70")
          : "border-white/10 bg-white/[0.06] text-slate-400 hover:border-teal-200/60 hover:bg-teal-200/10 hover:text-teal-100",
        disabled && !isVisible && "cursor-default hover:border-white/10 hover:bg-white/[0.06] hover:text-slate-400",
      )}
    >
      {isVisible ? (
        <>
          <Icon aria-hidden="true" className={cn("size-7 sm:size-9", face.iconClassName)} />
          <span className="text-[11px] font-black uppercase tracking-[0.12em] sm:text-xs">
            {face.label}
          </span>
        </>
      ) : (
        <Layers aria-hidden="true" className="size-6 sm:size-8" />
      )}
    </button>
  );
}

function PlayerScorePanel({
  player,
  isCurrent,
  isLocal,
}: {
  player: MemoryPlayer;
  isCurrent: boolean;
  isLocal: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-white/[0.07] p-3 sm:p-4",
        isCurrent ? "border-teal-200/60" : "border-white/10",
      )}
    >
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
        {player.id === "player-1" ? "Player 1" : "Player 2"}
      </p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-black text-white">
            {player.name}
          </p>
          <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            {isLocal ? "You" : isCurrent ? "Turn" : "Ready"}
          </p>
        </div>
        <span className="text-4xl font-black text-teal-100">{player.score}</span>
      </div>
    </div>
  );
}

function WaitingPlayerPanel() {
  return (
    <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.04] p-3 sm:p-4">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
        Player 2
      </p>
      <p className="mt-3 text-base font-black text-slate-300">
        Waiting
      </p>
    </div>
  );
}

function rememberSession(code: string, playerId: MemoryPlayerId) {
  window.sessionStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({ code, playerId }),
  );
}

function readSavedSession(): SavedMemorySession | null {
  const storedValue = window.sessionStorage.getItem(SESSION_STORAGE_KEY);

  if (!storedValue) {
    return null;
  }

  try {
    const parsedValue: unknown = JSON.parse(storedValue);

    if (
      parsedValue &&
      typeof parsedValue === "object" &&
      !Array.isArray(parsedValue)
    ) {
      const { code, playerId } = parsedValue as Record<string, unknown>;

      if (typeof code === "string" && typeof playerId === "string") {
        const normalizedCode = cleanLobbyCode(code);

        if (normalizedCode && isMemoryPlayerId(playerId)) {
          return {
            code: normalizedCode,
            playerId,
          };
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}

function getStatusText(
  lobby: MemoryLobby | null,
  playerId: MemoryPlayerId | null,
  currentPlayer: MemoryPlayer | null,
): string {
  if (!lobby) {
    return "";
  }

  if (lobby.status === "waiting") {
    return "Waiting for Player 2";
  }

  if (lobby.status === "settling") {
    return "No match";
  }

  if (lobby.status === "finished") {
    if (!lobby.winnerId) {
      return "Draw";
    }

    return lobby.winnerId === playerId ? "You win" : `${getPlayerName(lobby, lobby.winnerId)} wins`;
  }

  if (lobby.currentPlayerId === playerId) {
    return "Your turn";
  }

  return `${currentPlayer?.name ?? "Opponent"}'s turn`;
}

function getSoloStatusText(game: MemorySoloGame): string {
  if (game.status === "finished") {
    return "Deck cleared";
  }

  if (game.status === "settling") {
    return "No match";
  }

  if (game.flippedCardIds.length === 1) {
    return "Pick one more";
  }

  return "Find a pair";
}

function getResultText(lobby: MemoryLobby): string {
  if (lobby.status !== "finished") {
    return "In progress";
  }

  if (!lobby.winnerId) {
    return "Draw";
  }

  return `${getPlayerName(lobby, lobby.winnerId)} wins`;
}

function getPlayerName(lobby: MemoryLobby, playerId: MemoryPlayerId): string {
  return lobby.players.find((player) => player.id === playerId)?.name ?? playerId;
}

function cleanLobbyCode(value: string): string {
  return normalizeLobbyCode(value).slice(0, 6);
}
