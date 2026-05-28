"use client";

import {
  Bot,
  Copy,
  Keyboard,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  HANGMAN_ALPHABET,
  HANGMAN_MAX_MISSES,
  getHangmanUniqueLetters,
  isHangmanPlayerId,
  normalizeHangmanLetter,
  pickHangmanPuzzle,
  type HangmanLobbyView,
  type HangmanPlayerId,
  type HangmanPublicPlayer,
  type HangmanPuzzle,
} from "@/lib/hangman";
import { getErrorMessage, getJson, postJson } from "@/lib/http-client";
import {
  createRejoinToken,
  forgetLobbySession,
  readLobbySession,
  rememberLobbySession,
  type StoredLobbySession,
} from "@/lib/lobby-client";
import { normalizeLobbyCode } from "@/lib/lobby-utils";
import { WaitingLobbyCountdown } from "@/components/waiting-lobby-countdown";

type HangmanPlayMode = "solo" | "lobby";
type SoloStatus = "playing" | "won" | "lost";

type LobbyResponse = {
  lobby: HangmanLobbyView;
};

type LobbyWithPlayerResponse = LobbyResponse & {
  playerId: HangmanPlayerId;
};

type SavedHangmanSession = StoredLobbySession<HangmanPlayerId>;

const SESSION_STORAGE_KEY = "mini-arcade-hangman-session";

const MODE_OPTIONS: Array<{
  mode: HangmanPlayMode;
  label: string;
  icon: typeof Bot;
}> = [
  { mode: "solo", label: "Solo", icon: Bot },
  { mode: "lobby", label: "Lobby", icon: Users },
];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function HangmanGame({
  autoJoinCode = null,
  initialPlayMode = "solo",
  onLobbyLeave,
  onLobbySessionChange,
  playerName: externalPlayerName,
  rejoinToken: externalRejoinToken,
  showLobbyJoinForm = true,
  showModeControls = true,
}: {
  autoJoinCode?: string | null;
  initialPlayMode?: HangmanPlayMode;
  onLobbyLeave?: () => void;
  onLobbySessionChange?: (session: {
    code: string;
    game: "hangman";
    isHost: boolean;
    playerId: HangmanPlayerId;
    rejoinToken: string;
  }) => void;
  playerName?: string;
  rejoinToken?: string;
  showLobbyJoinForm?: boolean;
  showModeControls?: boolean;
}) {
  const [playMode, setPlayMode] = useState<HangmanPlayMode>(initialPlayMode);
  const [soloPuzzle, setSoloPuzzle] = useState<HangmanPuzzle>(() =>
    pickHangmanPuzzle(),
  );
  const [soloGuessedLetters, setSoloGuessedLetters] = useState<string[]>([]);
  const [lobby, setLobby] = useState<HangmanLobbyView | null>(null);
  const [playerId, setPlayerId] = useState<HangmanPlayerId | null>(null);
  const [localPlayerName, setLocalPlayerName] = useState("Player");
  const [localRejoinToken] = useState(() => createRejoinToken());
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [pendingLetter, setPendingLetter] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(initialPlayMode === "lobby");
  const [hasCopiedCode, setHasCopiedCode] = useState(false);
  const playerName = externalPlayerName ?? localPlayerName;
  const sessionRejoinToken = externalRejoinToken ?? localRejoinToken;

  const soloWordLetters = useMemo(
    () => getHangmanUniqueLetters(soloPuzzle.word),
    [soloPuzzle.word],
  );
  const soloMissedLetters = soloGuessedLetters.filter(
    (letter) => !soloWordLetters.includes(letter),
  );
  const soloMissedCount = soloMissedLetters.length;
  const soloLastGuess = soloGuessedLetters[soloGuessedLetters.length - 1] ?? null;
  const soloIsWon = soloWordLetters.every((letter) =>
    soloGuessedLetters.includes(letter),
  );
  const soloIsLost = soloMissedCount >= HANGMAN_MAX_MISSES;
  const soloStatus: SoloStatus = soloIsWon
    ? "won"
    : soloIsLost
      ? "lost"
      : "playing";

  const refreshLobby = useCallback(
    async (code: string, nextPlayerId: HangmanPlayerId) => {
      const response = await getJson<LobbyResponse>(
        getLobbyUrl(code, nextPlayerId),
      );

      setLobby(response.lobby);
    },
    [],
  );

  const joinLobbyByCode = useCallback(
    async (code: string) => {
      const response = await postJson<LobbyWithPlayerResponse>(
        `/api/hangman/lobbies/${encodeURIComponent(code)}/join`,
        { playerName, rejoinToken: sessionRejoinToken },
      );

      setLobby(response.lobby);
      setPlayerId(response.playerId);
      setPlayMode("lobby");
      rememberSession(
        response.lobby.code,
        response.playerId,
        sessionRejoinToken,
      );
      onLobbySessionChange?.({
        code: response.lobby.code,
        game: "hangman",
        isHost: response.playerId === "player-1",
        playerId: response.playerId,
        rejoinToken: sessionRejoinToken,
      });

      return response;
    },
    [onLobbySessionChange, playerName, sessionRejoinToken],
  );

  useEffect(() => {
    if (initialPlayMode !== "lobby") {
      return;
    }

    const savedSession = readSavedSession();
    let isActive = true;

    const restoreTimeoutId = window.setTimeout(() => {
      if (!isActive) {
        return;
      }

      if (autoJoinCode) {
        setPlayMode("lobby");

        joinLobbyByCode(autoJoinCode)
          .catch(() => {
            if (isActive) {
              setPlayerId(null);
            }
          })
          .finally(() => {
            if (isActive) {
              setIsRestoring(false);
            }
          });
        return;
      }

      if (!savedSession) {
        setIsRestoring(false);
        return;
      }

      setPlayMode("lobby");
      setPlayerId(savedSession.playerId);

      refreshLobby(savedSession.code, savedSession.playerId)
        .catch(() => {
          forgetLobbySession(SESSION_STORAGE_KEY);

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
  }, [autoJoinCode, initialPlayMode, joinLobbyByCode, refreshLobby]);

  useEffect(() => {
    if (!lobby?.code || !playerId || playMode !== "lobby") {
      return;
    }

    let isActive = true;

    const pollLobby = async () => {
      try {
        const response = await getJson<LobbyResponse>(
          getLobbyUrl(lobby.code, playerId),
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

    const intervalId = window.setInterval(pollLobby, 850);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [lobby?.code, playerId, playMode]);

  const handleSoloGuess = useCallback(
    (letter: string) => {
      if (soloStatus !== "playing") {
        return;
      }

      setSoloGuessedLetters((currentLetters) =>
        currentLetters.includes(letter)
          ? currentLetters
          : [...currentLetters, letter],
      );
    },
    [soloStatus],
  );

  const handleSoloNewWord = useCallback(() => {
    setSoloPuzzle((currentPuzzle) => pickHangmanPuzzle(currentPuzzle.word));
    setSoloGuessedLetters([]);
    setError("");
  }, []);

  const handleLobbyGuess = useCallback(
    async (letter: string) => {
      if (
        !lobby ||
        !playerId ||
        lobby.status !== "playing" ||
        pendingLetter !== null ||
        isLocalPlayerDone(lobby)
      ) {
        return;
      }

      setPendingLetter(letter);
      setError("");

      try {
        const response = await postJson<LobbyResponse>(
          `/api/hangman/lobbies/${encodeURIComponent(lobby.code)}/guess`,
          {
            playerId,
            letter,
          },
        );

        setLobby(response.lobby);
      } catch (requestError) {
        setError(getErrorMessage(requestError));
      } finally {
        setPendingLetter(null);
      }
    },
    [lobby, pendingLetter, playerId],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTextInputTarget(event.target)) {
        return;
      }

      const letter = normalizeHangmanLetter(event.key);

      if (letter) {
        if (playMode === "solo") {
          event.preventDefault();
          handleSoloGuess(letter);
          return;
        }

        if (playMode === "lobby" && lobby?.status === "playing") {
          event.preventDefault();
          void handleLobbyGuess(letter);
        }

        return;
      }

      if (event.key === "Enter" && playMode === "solo" && soloStatus !== "playing") {
        event.preventDefault();
        handleSoloNewWord();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    handleSoloGuess,
    handleSoloNewWord,
    handleLobbyGuess,
    lobby?.status,
    pendingLetter,
    playMode,
    playerId,
    soloStatus,
  ]);

  function handleModeChange(nextMode: HangmanPlayMode) {
    setPlayMode(nextMode);
    setError("");
  }

  async function handleCreateLobby() {
    setIsBusy(true);
    setError("");

    try {
      const response = await postJson<LobbyWithPlayerResponse>(
        "/api/hangman/lobbies",
        { playerName, rejoinToken: sessionRejoinToken },
      );

      setLobby(response.lobby);
      setPlayerId(response.playerId);
      setPlayMode("lobby");
      setJoinCode("");
      rememberSession(response.lobby.code, response.playerId, sessionRejoinToken);
      onLobbySessionChange?.({
        code: response.lobby.code,
        game: "hangman",
        isHost: response.playerId === "player-1",
        playerId: response.playerId,
        rejoinToken: sessionRejoinToken,
      });
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
      await joinLobbyByCode(code);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleReady() {
    if (!lobby || !playerId) {
      return;
    }

    setIsBusy(true);
    setError("");

    try {
      const response = await postJson<LobbyResponse>(
        `/api/hangman/lobbies/${encodeURIComponent(lobby.code)}/ready`,
        { playerId },
      );

      setLobby(response.lobby);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsBusy(false);
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
        `/api/hangman/lobbies/${encodeURIComponent(lobby.code)}/restart`,
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
    forgetLobbySession(SESSION_STORAGE_KEY);
    onLobbyLeave?.();
    setLobby(null);
    setPlayerId(null);
    setJoinCode("");
    setError("");
  }

  if (playMode === "solo") {
    return (
      <section aria-labelledby="hangman-title" className="grid gap-4 sm:gap-5">
        <HangmanHeader
          actions={
            <button
              type="button"
              onClick={handleSoloNewWord}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-teal-300 px-4 text-sm font-black text-slate-950 transition hover:bg-teal-200 sm:w-auto"
            >
              <RefreshCw aria-hidden="true" className="size-4" />
              New Word
            </button>
          }
          onModeChange={handleModeChange}
          playMode={playMode}
          showModeControls={showModeControls}
        />

        <HangmanPlaySurface
          category={soloPuzzle.category}
          isLetterCorrect={(letter) =>
            soloGuessedLetters.includes(letter) && soloWordLetters.includes(letter)
          }
          isLetterDisabled={(letter) =>
            soloStatus !== "playing" || soloGuessedLetters.includes(letter)
          }
          isLetterMiss={(letter) => soloMissedLetters.includes(letter)}
          missedCount={soloMissedCount}
          onGuess={handleSoloGuess}
          sidePanel={
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatPanel
                  label="Misses"
                  value={`${soloMissedCount}/${HANGMAN_MAX_MISSES}`}
                />
                <StatPanel
                  label="Tries Left"
                  value={Math.max(
                    0,
                    HANGMAN_MAX_MISSES - soloMissedCount,
                  ).toString()}
                />
              </div>
              <UsedLettersPanel guessedLetters={soloGuessedLetters} />
              <ResultPanel text={getSoloResultText(soloStatus)} />
            </>
          }
          statusText={getSoloStatusText(
            soloStatus,
            soloLastGuess,
            soloWordLetters,
            soloPuzzle.word,
          )}
          wordSlots={getSoloWordSlots(
            soloPuzzle.word,
            soloGuessedLetters,
            soloStatus,
          )}
        />
      </section>
    );
  }

  if (!lobby) {
    return (
      <section aria-labelledby="hangman-title" className="grid gap-4 sm:gap-5">
        <HangmanHeader
          onModeChange={handleModeChange}
          playMode={playMode}
          showModeControls={showModeControls}
        />

        <HangmanLobbySetup
          error={error}
          isBusy={isBusy || isRestoring}
          joinCode={joinCode}
          onCreateLobby={handleCreateLobby}
          onJoinCodeChange={(value) => setJoinCode(cleanLobbyCode(value))}
          onJoinLobby={handleJoinLobby}
          onPlayerNameChange={setLocalPlayerName}
          playerName={playerName}
          showJoinForm={showLobbyJoinForm}
          showPlayerNameInput={externalPlayerName === undefined}
        />
      </section>
    );
  }

  const localPlayer = getLocalPlayer(lobby);
  const lobbyStatusText = getLobbyStatusText(lobby);
  const shouldShowPlaySurface =
    lobby.status === "playing" || lobby.status === "finished";

  return (
    <section aria-labelledby="hangman-title" className="grid gap-4 sm:gap-5">
      <HangmanHeader
        actions={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <button
              type="button"
              onClick={handleRestartLobby}
              disabled={isBusy || !playerId}
              className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-teal-300 px-4 text-sm font-black text-slate-950 transition hover:bg-teal-200 disabled:cursor-wait disabled:opacity-70"
            >
              <RefreshCw aria-hidden="true" className="size-4" />
              New Round
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
        showModeControls={showModeControls}
      />

      {shouldShowPlaySurface ? (
        <HangmanPlaySurface
          category={lobby.category ?? "Race"}
          isLetterCorrect={(letter) =>
            lobby.localGuessedLetters.includes(letter) &&
            !lobby.localMissedLetters.includes(letter)
          }
          isLetterDisabled={(letter) =>
            lobby.status !== "playing" ||
            lobby.localGuessedLetters.includes(letter) ||
            pendingLetter !== null ||
            isLocalPlayerDone(lobby)
          }
          isLetterMiss={(letter) => lobby.localMissedLetters.includes(letter)}
          missedCount={lobby.localMissedLetters.length}
          onGuess={(letter) => void handleLobbyGuess(letter)}
          pendingLetter={pendingLetter}
          sidePanel={
            <HangmanLobbySidePanel
              copied={hasCopiedCode}
              lobby={lobby}
              onCopy={handleCopyLobbyCode}
            />
          }
          statusTone={getLobbyStatusTone(lobby)}
          statusText={lobbyStatusText}
          wordSlots={lobby.wordSlots}
        />
      ) : (
        <HangmanReadyRoom
          copied={hasCopiedCode}
          isBusy={isBusy}
          lobby={lobby}
          localPlayer={localPlayer}
          onCopy={handleCopyLobbyCode}
          onReady={handleReady}
          statusText={lobbyStatusText}
        />
      )}

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

function HangmanHeader({
  actions,
  onModeChange,
  playMode,
  showModeControls = true,
}: {
  actions?: ReactNode;
  onModeChange: (mode: HangmanPlayMode) => void;
  playMode: HangmanPlayMode;
  showModeControls?: boolean;
}) {
  return (
    <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-teal-200/80 sm:tracking-[0.28em]">
          Word Guess
        </p>
        <h2
          id="hangman-title"
          className="mt-1 text-2xl font-black text-white sm:mt-2 sm:text-5xl"
        >
          Hangman
        </h2>
      </div>

      <div className="grid gap-2 sm:justify-items-end">
        {showModeControls ? (
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
        ) : null}
        {actions}
      </div>
    </header>
  );
}

function HangmanLobbySetup({
  error,
  isBusy,
  joinCode,
  onCreateLobby,
  onJoinCodeChange,
  onJoinLobby,
  onPlayerNameChange,
  playerName,
  showJoinForm,
  showPlayerNameInput,
}: {
  error: string;
  isBusy: boolean;
  joinCode: string;
  onCreateLobby: () => void;
  onJoinCodeChange: (value: string) => void;
  onJoinLobby: (event: FormEvent<HTMLFormElement>) => void;
  onPlayerNameChange: (value: string) => void;
  playerName: string;
  showJoinForm: boolean;
  showPlayerNameInput: boolean;
}) {
  return (
    <section
      className={cn(
        "grid gap-4 rounded-lg border border-white/10 bg-slate-950/70 p-3 shadow-2xl shadow-black/25 sm:p-4",
        showJoinForm && "lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]",
      )}
    >
      <div className="grid content-start gap-4">
        {showPlayerNameInput ? (
          <label className="grid gap-2 text-sm font-bold text-slate-200">
            Player Name
            <input
              value={playerName}
              onChange={(event) => onPlayerNameChange(event.target.value)}
              className="min-h-12 rounded-lg border border-white/10 bg-white/[0.07] px-3 text-base font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-teal-200/80"
              maxLength={24}
              placeholder="Player"
            />
          </label>
        ) : null}

        <button
          type="button"
          onClick={onCreateLobby}
          disabled={isBusy}
          className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-teal-300 px-4 text-sm font-black text-slate-950 transition hover:bg-teal-200 disabled:cursor-wait disabled:opacity-70"
        >
          <Plus aria-hidden="true" className="size-4" />
          Create Lobby
        </button>
      </div>

      {showJoinForm ? (
        <form onSubmit={onJoinLobby} className="grid content-start gap-4">
          <label className="grid gap-2 text-sm font-bold text-slate-200">
            Lobby Code
            <input
              aria-label="Hangman lobby code"
              value={joinCode}
              onChange={(event) => onJoinCodeChange(event.target.value)}
              className="min-h-12 rounded-lg border border-white/10 bg-white/[0.07] px-3 text-base font-black uppercase tracking-[0.2em] text-white outline-none transition placeholder:tracking-normal placeholder:text-slate-500 focus:border-teal-200/80"
              inputMode="text"
              maxLength={6}
              placeholder="ABC123"
            />
          </label>

          <button
            type="submit"
            disabled={isBusy}
            className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.07] px-4 text-sm font-black text-slate-100 transition hover:bg-white/12 disabled:cursor-wait disabled:opacity-70"
          >
            <LogIn aria-hidden="true" className="size-4" />
            Join Lobby
          </button>
        </form>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-rose-300/30 bg-rose-300/10 px-4 py-3 text-sm font-bold text-rose-100 lg:col-span-2"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}

function HangmanReadyRoom({
  copied,
  isBusy,
  lobby,
  localPlayer,
  onCopy,
  onReady,
  statusText,
}: {
  copied: boolean;
  isBusy: boolean;
  lobby: HangmanLobbyView;
  localPlayer: HangmanPublicPlayer | null;
  onCopy: () => void;
  onReady: () => void;
  statusText: string;
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-5">
      <div className="grid content-start gap-4 rounded-lg border border-white/10 bg-slate-950/75 p-3 shadow-2xl shadow-black/30 sm:p-4">
        <div
          aria-live="polite"
          className="rounded-lg border border-white/10 bg-white/[0.06] px-4 py-3"
        >
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
            Status
          </p>
          <p className="mt-2 text-xl font-black text-teal-100">{statusText}</p>
        </div>

        <button
          type="button"
          onClick={onReady}
          disabled={isBusy || localPlayer?.isReady}
          className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-teal-300 px-4 text-sm font-black text-slate-950 transition hover:bg-teal-200 disabled:cursor-default disabled:opacity-70"
        >
          <Sparkles aria-hidden="true" className="size-4" />
          {localPlayer?.isReady ? "Ready" : "Ready"}
        </button>
      </div>

      <aside className="grid content-start gap-3">
        <LobbyCodePanel
          copied={copied}
          code={lobby.code}
          onCopy={onCopy}
        />
        {lobby.status === "waiting" && lobby.players.length < 2 ? (
          <WaitingLobbyCountdown expiresAt={lobby.waitingExpiresAt} />
        ) : null}
        <PlayersPanel
          localPlayerId={lobby.localPlayerId}
          players={lobby.players}
          status={lobby.status}
        />
      </aside>
    </section>
  );
}

function HangmanPlaySurface({
  category,
  isLetterCorrect,
  isLetterDisabled,
  isLetterMiss,
  missedCount,
  onGuess,
  pendingLetter,
  sidePanel,
  statusText,
  statusTone = "playing",
  wordSlots,
}: {
  category: string;
  isLetterCorrect: (letter: string) => boolean;
  isLetterDisabled: (letter: string) => boolean;
  isLetterMiss: (letter: string) => boolean;
  missedCount: number;
  onGuess: (letter: string) => void;
  pendingLetter?: string | null;
  sidePanel: ReactNode;
  statusText: string;
  statusTone?: SoloStatus;
  wordSlots: string[];
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-5">
      <div className="grid gap-4">
        <div className="grid gap-4 rounded-lg border border-white/10 bg-slate-950/75 p-3 shadow-2xl shadow-black/30 sm:p-4 md:grid-cols-[minmax(220px,0.85fr)_minmax(0,1fr)]">
          <div className="flex min-h-52 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] p-3 sm:min-h-64">
            <HangmanDrawing missedCount={missedCount} />
          </div>

          <div className="grid content-center gap-4">
            <div className="rounded-lg border border-white/10 bg-white/[0.06] p-4">
              <div className="flex items-center gap-2 text-slate-300">
                <Sparkles
                  aria-hidden="true"
                  className="size-4 text-teal-200"
                />
                <p className="text-xs font-bold uppercase tracking-[0.2em]">
                  Category
                </p>
              </div>
              <p className="mt-3 text-2xl font-black text-white">{category}</p>
            </div>

            <div
              aria-live="polite"
              className={cn(
                "rounded-lg border px-4 py-3",
                statusTone === "won"
                  ? "border-emerald-300/40 bg-emerald-300/10"
                  : statusTone === "lost"
                    ? "border-rose-300/40 bg-rose-300/10"
                    : "border-white/10 bg-white/[0.06]",
              )}
            >
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                Status
              </p>
              <p className="mt-2 text-xl font-black text-teal-100">
                {statusText}
              </p>
            </div>
          </div>
        </div>

        <div
          aria-label="Word puzzle"
          className="flex min-h-20 flex-wrap items-center justify-center gap-2 rounded-lg border border-white/10 bg-slate-950/65 px-3 py-4"
        >
          {wordSlots.map((character, index) => {
            const isRevealed = character !== "_";

            return (
              <span
                key={`${character}-${index}`}
                className={cn(
                  "flex min-h-12 min-w-9 items-center justify-center rounded-md border px-2 text-2xl font-black sm:min-w-11 sm:text-3xl",
                  isRevealed
                    ? "border-teal-200/50 bg-teal-200/10 text-teal-100"
                    : "border-white/10 bg-white/[0.05] text-slate-500",
                )}
              >
                {character}
              </span>
            );
          })}
        </div>

        <div
          aria-label="Hangman letter keyboard"
          className="grid grid-cols-6 gap-2 sm:grid-cols-9 lg:grid-cols-[repeat(13,minmax(0,1fr))]"
        >
          {HANGMAN_ALPHABET.map((letter) => (
            <button
              key={letter}
              type="button"
              aria-label={`Guess ${letter}`}
              disabled={isLetterDisabled(letter)}
              onClick={() => onGuess(letter)}
              className={cn(
                "flex min-h-11 min-w-0 items-center justify-center rounded-md border text-base font-black transition",
                isLetterCorrect(letter) &&
                  "border-emerald-200/60 bg-emerald-300/20 text-emerald-100",
                isLetterMiss(letter) &&
                  "border-rose-200/60 bg-rose-300/20 text-rose-100",
                !isLetterCorrect(letter) &&
                  !isLetterMiss(letter) &&
                  !isLetterDisabled(letter) &&
                  "border-white/10 bg-white/[0.07] text-slate-100 hover:border-teal-200/60 hover:bg-teal-200/10",
                pendingLetter === letter && "cursor-wait opacity-70",
                isLetterDisabled(letter) && "cursor-default opacity-80",
              )}
            >
              {letter}
            </button>
          ))}
        </div>
      </div>

      <aside className="grid content-start gap-3">{sidePanel}</aside>
    </section>
  );
}

function HangmanLobbySidePanel({
  copied,
  lobby,
  onCopy,
}: {
  copied: boolean;
  lobby: HangmanLobbyView;
  onCopy: () => void;
}) {
  return (
    <>
      <LobbyCodePanel copied={copied} code={lobby.code} onCopy={onCopy} />
      <div className="grid grid-cols-2 gap-3">
        <StatPanel
          label="Misses"
          value={`${lobby.localMissedLetters.length}/${HANGMAN_MAX_MISSES}`}
        />
        <StatPanel
          label="Tries Left"
          value={Math.max(
            0,
            HANGMAN_MAX_MISSES - lobby.localMissedLetters.length,
          ).toString()}
        />
      </div>
      <PlayersPanel
        localPlayerId={lobby.localPlayerId}
        players={lobby.players}
        status={lobby.status}
      />
      <UsedLettersPanel guessedLetters={lobby.localGuessedLetters} />
      <ResultPanel text={getLobbyResultText(lobby)} />
    </>
  );
}

function LobbyCodePanel({
  copied,
  code,
  onCopy,
}: {
  copied: boolean;
  code: string;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.07] p-3 sm:p-4">
      <div className="flex items-center gap-2 text-slate-300">
        <Users aria-hidden="true" className="size-4 text-teal-200" />
        <p className="text-xs font-bold uppercase tracking-[0.2em]">Lobby</p>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <output
          aria-label="Hangman lobby code"
          className="rounded-md border border-teal-200/30 bg-teal-200/10 px-3 py-2 text-lg font-black tracking-[0.2em] text-teal-100 sm:text-xl"
        >
          {code}
        </output>
        <button
          type="button"
          onClick={onCopy}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.07] text-slate-100 transition hover:bg-white/12"
          title={copied ? "Copied" : "Copy lobby code"}
          aria-label={copied ? "Copied lobby code" : "Copy lobby code"}
        >
          <Copy aria-hidden="true" className="size-4" />
        </button>
      </div>
    </div>
  );
}

function PlayersPanel({
  localPlayerId,
  players,
  status,
}: {
  localPlayerId: HangmanPlayerId;
  players: HangmanPublicPlayer[];
  status: HangmanLobbyView["status"];
}) {
  return (
    <div className="grid gap-3">
      {players.map((player) => (
        <RacePlayerPanel
          key={player.id}
          isLocal={player.id === localPlayerId}
          player={player}
          status={status}
        />
      ))}
      {players.length < 2 ? <WaitingPlayerPanel /> : null}
    </div>
  );
}

function RacePlayerPanel({
  isLocal,
  player,
  status,
}: {
  isLocal: boolean;
  player: HangmanPublicPlayer;
  status: HangmanLobbyView["status"];
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.07] p-3 sm:p-4">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
        {player.id === "player-1" ? "Player 1" : "Player 2"}
      </p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-black text-white">
            {player.name}
          </p>
          <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            {getPlayerStateText(player, isLocal, status)}
          </p>
        </div>
        <span className="text-right text-lg font-black text-teal-100">
          {player.elapsedMs === null ? `${player.missedCount}/6` : formatElapsed(player.elapsedMs)}
        </span>
      </div>
    </div>
  );
}

function WaitingPlayerPanel() {
  return (
    <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.04] p-3 sm:p-4">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
        Player 2
      </p>
      <p className="mt-3 text-base font-black text-slate-300">Waiting</p>
    </div>
  );
}

function StatPanel({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-teal-300/30 bg-white/[0.07] p-3 sm:p-4">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
        {label}
      </p>
      <p className="mt-3 text-4xl font-black text-teal-100">{value}</p>
    </div>
  );
}

function UsedLettersPanel({ guessedLetters }: { guessedLetters: string[] }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.07] p-3 sm:p-4">
      <div className="flex items-center gap-2 text-slate-300">
        <Keyboard aria-hidden="true" className="size-4 text-teal-200" />
        <p className="text-xs font-bold uppercase tracking-[0.2em]">
          Used Letters
        </p>
      </div>
      <p className="mt-3 min-h-6 break-words text-sm font-black uppercase tracking-[0.18em] text-slate-200">
        {guessedLetters.length > 0 ? guessedLetters.join(" ") : "None"}
      </p>
    </div>
  );
}

function ResultPanel({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.07] p-3 sm:p-4">
      <div className="flex items-center gap-2 text-slate-300">
        <Trophy aria-hidden="true" className="size-4 text-emerald-200" />
        <p className="text-xs font-bold uppercase tracking-[0.2em]">Result</p>
      </div>
      <p className="mt-3 text-sm font-bold text-slate-200">{text}</p>
    </div>
  );
}

function HangmanDrawing({ missedCount }: { missedCount: number }) {
  return (
    <svg
      aria-hidden="true"
      className="h-full w-full max-w-[320px]"
      viewBox="0 0 220 220"
    >
      <g
        className="stroke-slate-500/70"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="10"
      >
        <path d="M35 200H185" />
        <path d="M62 200V30" />
        <path d="M62 30H150" />
        <path d="M150 30V58" />
      </g>

      <g
        className="stroke-teal-100"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="8"
      >
        {missedCount >= 1 ? <circle cx="150" cy="78" r="20" /> : null}
        {missedCount >= 2 ? <path d="M150 98V145" /> : null}
        {missedCount >= 3 ? <path d="M150 112L122 132" /> : null}
        {missedCount >= 4 ? <path d="M150 112L178 132" /> : null}
        {missedCount >= 5 ? <path d="M150 145L127 178" /> : null}
        {missedCount >= 6 ? <path d="M150 145L173 178" /> : null}
      </g>
    </svg>
  );
}

function getSoloWordSlots(
  word: string,
  guessedLetters: string[],
  status: SoloStatus,
): string[] {
  return word
    .split("")
    .map((letter) =>
      status === "lost" || guessedLetters.includes(letter) ? letter : "_",
    );
}

function getSoloStatusText(
  status: SoloStatus,
  lastGuess: string | null,
  wordLetters: string[],
  word: string,
): string {
  if (status === "won") {
    return "You guessed it";
  }

  if (status === "lost") {
    return `The word was ${word}`;
  }

  if (!lastGuess) {
    return "Pick a letter";
  }

  return wordLetters.includes(lastGuess)
    ? `Good guess: ${lastGuess}`
    : `Missed: ${lastGuess}`;
}

function getSoloResultText(status: SoloStatus): string {
  if (status === "won") {
    return "Word solved";
  }

  if (status === "lost") {
    return "Try a new word";
  }

  return "In progress";
}

function getLobbyStatusText(lobby: HangmanLobbyView): string {
  const localPlayer = getLocalPlayer(lobby);

  if (lobby.status === "waiting") {
    return localPlayer?.isReady ? "Waiting for Player 2" : "Ready to race";
  }

  if (lobby.status === "readying") {
    return localPlayer?.isReady ? "Waiting for opponent" : "Ready to race";
  }

  if (lobby.status === "finished") {
    if (!lobby.winnerId) {
      return "No winner";
    }

    return lobby.winnerId === lobby.localPlayerId
      ? "You win"
      : `${getLobbyPlayerName(lobby, lobby.winnerId)} wins`;
  }

  if (localPlayer?.isSolved) {
    return "You solved it";
  }

  if (localPlayer?.isLost) {
    return "Out of tries";
  }

  if (!lobby.localLastGuess) {
    return "Race is live";
  }

  return lobby.localMissedLetters.includes(lobby.localLastGuess)
    ? `Missed: ${lobby.localLastGuess}`
    : `Good guess: ${lobby.localLastGuess}`;
}

function getLobbyStatusTone(lobby: HangmanLobbyView): SoloStatus {
  if (lobby.status !== "finished") {
    return "playing";
  }

  return lobby.winnerId === lobby.localPlayerId ? "won" : "lost";
}

function getLobbyResultText(lobby: HangmanLobbyView): string {
  if (lobby.status !== "finished") {
    return "In progress";
  }

  if (!lobby.winnerId) {
    return lobby.revealedWord ? `No winner: ${lobby.revealedWord}` : "No winner";
  }

  const winnerName = getLobbyPlayerName(lobby, lobby.winnerId);
  const winner = lobby.players.find((player) => player.id === lobby.winnerId);
  const timeText = winner?.elapsedMs === null ? "" : ` in ${formatElapsed(winner?.elapsedMs ?? 0)}`;

  return `${winnerName} wins${timeText}`;
}

function getPlayerStateText(
  player: HangmanPublicPlayer,
  isLocal: boolean,
  status: HangmanLobbyView["status"],
): string {
  if (player.isSolved) {
    return isLocal ? "You solved" : "Solved";
  }

  if (player.isLost) {
    return isLocal ? "You lost" : "Out";
  }

  if (status === "playing") {
    return isLocal ? "You" : "Racing";
  }

  if (status === "finished") {
    return isLocal ? "You" : "Finished";
  }

  if (player.isReady) {
    return isLocal ? "You" : "Ready";
  }

  return "Not ready";
}

function getLocalPlayer(lobby: HangmanLobbyView): HangmanPublicPlayer | null {
  return (
    lobby.players.find((player) => player.id === lobby.localPlayerId) ?? null
  );
}

function getLobbyPlayerName(
  lobby: HangmanLobbyView,
  nextPlayerId: HangmanPlayerId,
): string {
  return lobby.players.find((player) => player.id === nextPlayerId)?.name ?? nextPlayerId;
}

function isLocalPlayerDone(lobby: HangmanLobbyView): boolean {
  const localPlayer = getLocalPlayer(lobby);

  return Boolean(localPlayer?.isSolved || localPlayer?.isLost);
}

function formatElapsed(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

function getLobbyUrl(code: string, playerId: HangmanPlayerId): string {
  const params = new URLSearchParams({ playerId });

  return `/api/hangman/lobbies/${encodeURIComponent(code)}?${params.toString()}`;
}

function cleanLobbyCode(value: string): string {
  return normalizeLobbyCode(value).slice(0, 6);
}

function rememberSession(
  code: string,
  playerId: HangmanPlayerId,
  rejoinToken: string,
) {
  rememberLobbySession(SESSION_STORAGE_KEY, { code, playerId, rejoinToken });
}

function readSavedSession(): SavedHangmanSession | null {
  return readLobbySession(SESSION_STORAGE_KEY, cleanLobbyCode, isHangmanPlayerId);
}

function isTextInputTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
