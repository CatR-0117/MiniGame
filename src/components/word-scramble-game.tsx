"use client";

import {
  Bot,
  Copy,
  Keyboard,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Send,
  Shuffle,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  WORD_SCRAMBLE_MAX_GUESSES,
  createWordScrambleSoloGame,
  isWordScramblePlayerId,
  normalizeWordScrambleGuess,
  submitWordScrambleSoloGuess,
  type WordScrambleLobbyView,
  type WordScramblePlayerId,
  type WordScramblePublicPlayer,
  type WordScrambleSoloGame,
  type WordScrambleSoloStatus,
} from "@/lib/word-scramble";
import {
  deleteJson,
  getErrorMessage,
  getJson,
  isAbortError,
  postJson,
} from "@/lib/http-client";
import {
  createRejoinToken,
  forgetLobbySession,
  readArcadeLobbyGame,
  readLobbySession,
  rememberLobbySession,
  type ArcadeLobbyGame,
  type StoredLobbySession,
} from "@/lib/lobby-client";
import { normalizeLobbyCode } from "@/lib/lobby-utils";
import { WaitingLobbyCountdown } from "@/components/waiting-lobby-countdown";

type WordScramblePlayMode = "solo" | "lobby";

type LobbyResponse = {
  lobby: WordScrambleLobbyView;
};

type LobbyWithPlayerResponse = LobbyResponse & {
  playerId: WordScramblePlayerId;
};

type SavedWordScrambleSession = StoredLobbySession<WordScramblePlayerId>;

const SESSION_STORAGE_KEY = "mini-arcade-word-scramble-session";
const LOBBY_POLL_MS = 700;

const MODE_OPTIONS: Array<{
  mode: WordScramblePlayMode;
  label: string;
  icon: typeof Bot;
}> = [
  { mode: "solo", label: "Solo", icon: Bot },
  { mode: "lobby", label: "Lobby", icon: Users },
];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function WordScrambleGame({
  autoJoinCode = null,
  initialPlayMode = "solo",
  onLobbyGameChange,
  onLobbyLeave,
  onLobbySessionChange,
  playerName: externalPlayerName,
  rejoinToken: externalRejoinToken,
  showLobbyJoinForm = true,
  showModeControls = true,
}: {
  autoJoinCode?: string | null;
  initialPlayMode?: WordScramblePlayMode;
  onLobbyGameChange?: (game: ArcadeLobbyGame) => void;
  onLobbyLeave?: () => void;
  onLobbySessionChange?: (session: {
    code: string;
    game: "word-scramble";
    isHost: boolean;
    playerId: WordScramblePlayerId;
    rejoinToken: string;
  }) => void;
  playerName?: string;
  rejoinToken?: string;
  showLobbyJoinForm?: boolean;
  showModeControls?: boolean;
}) {
  const [playMode, setPlayMode] =
    useState<WordScramblePlayMode>(initialPlayMode);
  const [soloGame, setSoloGame] = useState<WordScrambleSoloGame>(() =>
    createWordScrambleSoloGame(),
  );
  const [soloGuess, setSoloGuess] = useState("");
  const [lobby, setLobby] = useState<WordScrambleLobbyView | null>(null);
  const [playerId, setPlayerId] = useState<WordScramblePlayerId | null>(null);
  const [localPlayerName, setLocalPlayerName] = useState("Player");
  const [localRejoinToken] = useState(() => createRejoinToken());
  const autoJoinedCodeRef = useRef<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [lobbyGuess, setLobbyGuess] = useState("");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [isSubmittingGuess, setIsSubmittingGuess] = useState(false);
  const [isRestoring, setIsRestoring] = useState(initialPlayMode === "lobby");
  const [hasCopiedCode, setHasCopiedCode] = useState(false);
  const playerName = externalPlayerName ?? localPlayerName;
  const sessionRejoinToken = externalRejoinToken ?? localRejoinToken;

  const refreshLobby = useCallback(
    async (code: string, nextPlayerId: WordScramblePlayerId) => {
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
        `/api/word-scramble/lobbies/${encodeURIComponent(code)}/join`,
        { playerName, rejoinToken: sessionRejoinToken },
      );

      setLobby(response.lobby);
      setPlayerId(response.playerId);
      setPlayMode("lobby");
      setLobbyGuess("");
      rememberSession(
        response.lobby.code,
        response.playerId,
        sessionRejoinToken,
      );
      onLobbySessionChange?.({
        code: response.lobby.code,
        game: "word-scramble",
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
        if (autoJoinedCodeRef.current === autoJoinCode) {
          setIsRestoring(false);
          return;
        }

        autoJoinedCodeRef.current = autoJoinCode;
        setPlayMode("lobby");

        joinLobbyByCode(autoJoinCode)
          .catch(() => {
            autoJoinedCodeRef.current = null;

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

    const lobbyCode = lobby.code;
    const currentPlayerId = playerId;
    let isActive = true;
    let timeoutId: number | null = null;
    let activeRequest: AbortController | null = null;

    const closeUnavailableLobby = () => {
      forgetLobbySession(SESSION_STORAGE_KEY);
      setLobby(null);
      setPlayerId(null);
      setJoinCode("");
      setLobbyGuess("");
      setError("Lobby is no longer available.");
      onLobbyLeave?.();
    };

    const scheduleNextPoll = () => {
      timeoutId = window.setTimeout(pollLobby, LOBBY_POLL_MS);
    };

    const pollLobby = async () => {
      const request = new AbortController();
      activeRequest = request;

      try {
        const response = await getJson<LobbyResponse>(
          getLobbyUrl(lobbyCode, currentPlayerId),
          { signal: request.signal },
        );

        if (isActive) {
          setLobby(response.lobby);
        }
      } catch (pollError) {
        if (!isActive || isAbortError(pollError)) {
          return;
        }

        try {
          const activeGame = await readArcadeLobbyGame(
            lobbyCode,
            request.signal,
          );

          if (!isActive) {
            return;
          }

          if (activeGame !== "word-scramble") {
            onLobbyGameChange?.(activeGame);
            return;
          }

          closeUnavailableLobby();
        } catch (statusError) {
          if (!isActive || isAbortError(statusError)) {
            return;
          }

          closeUnavailableLobby();
        }
      } finally {
        activeRequest = null;

        if (isActive) {
          scheduleNextPoll();
        }
      }
    };

    void pollLobby();

    return () => {
      isActive = false;
      activeRequest?.abort();

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [lobby?.code, onLobbyGameChange, onLobbyLeave, playerId, playMode]);

  function handleModeChange(nextMode: WordScramblePlayMode) {
    setPlayMode(nextMode);
    setError("");
  }

  function handleSoloGuess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextGuess = normalizeWordScrambleGuess(soloGuess);

    if (!nextGuess || soloGame.status !== "playing") {
      return;
    }

    setSoloGame((currentGame) => {
      const nextGame = submitWordScrambleSoloGuess(currentGame, nextGuess);

      return nextGame.status === "won"
        ? createWordScrambleSoloGame(currentGame.puzzle.word)
        : nextGame;
    });
    setSoloGuess("");
  }

  function handleSoloNewWord() {
    setSoloGame((currentGame) =>
      createWordScrambleSoloGame(currentGame.puzzle.word),
    );
    setSoloGuess("");
    setError("");
  }

  async function handleCreateLobby() {
    setIsBusy(true);
    setError("");

    try {
      const response = await postJson<LobbyWithPlayerResponse>(
        "/api/word-scramble/lobbies",
        { playerName, rejoinToken: sessionRejoinToken },
      );

      setLobby(response.lobby);
      setPlayerId(response.playerId);
      setPlayMode("lobby");
      setJoinCode("");
      setLobbyGuess("");
      rememberSession(
        response.lobby.code,
        response.playerId,
        sessionRejoinToken,
      );
      onLobbySessionChange?.({
        code: response.lobby.code,
        game: "word-scramble",
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
        `/api/word-scramble/lobbies/${encodeURIComponent(lobby.code)}/ready`,
        { playerId },
      );

      setLobby(response.lobby);
      setLobbyGuess("");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleLobbyGuess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !lobby ||
      !playerId ||
      lobby.status !== "playing" ||
      isSubmittingGuess ||
      isLocalPlayerDone(lobby)
    ) {
      return;
    }

    const nextGuess = normalizeWordScrambleGuess(lobbyGuess);

    if (!nextGuess) {
      setError("Enter a word.");
      return;
    }

    setIsSubmittingGuess(true);
    setError("");

    try {
      const response = await postJson<LobbyResponse>(
        `/api/word-scramble/lobbies/${encodeURIComponent(lobby.code)}/guess`,
        {
          playerId,
          guess: nextGuess,
        },
      );

      setLobby(response.lobby);
      setLobbyGuess("");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsSubmittingGuess(false);
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
        `/api/word-scramble/lobbies/${encodeURIComponent(lobby.code)}/restart`,
        { playerId },
      );

      setLobby(response.lobby);
      setLobbyGuess("");
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

  async function handleLeaveLobby() {
    const currentLobby = lobby;
    const currentPlayerId = playerId;

    if (currentLobby && currentPlayerId) {
      await deleteJson<{ didCloseLobby: boolean }>(
        `/api/word-scramble/lobbies/${encodeURIComponent(currentLobby.code)}`,
        {
          playerId: currentPlayerId,
          rejoinToken: sessionRejoinToken,
        },
      ).catch(() => undefined);
    }

    forgetLobbySession(SESSION_STORAGE_KEY);
    onLobbyLeave?.();
    setLobby(null);
    setPlayerId(null);
    setJoinCode("");
    setLobbyGuess("");
    setError("");
  }

  if (playMode === "solo") {
    return (
      <section
        aria-labelledby="word-scramble-title"
        className="grid gap-4 sm:gap-5"
      >
        <WordScrambleHeader
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

        <WordScramblePlaySurface
          answerValue={soloGuess}
          category={soloGame.puzzle.category}
          isSubmitDisabled={soloGame.status !== "playing"}
          onAnswerChange={(value) =>
            setSoloGuess(cleanGuess(value, soloGame.puzzle.word.length))
          }
          onSubmit={handleSoloGuess}
          scrambledWord={soloGame.scrambledWord}
          sidePanel={
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatPanel
                  label="Guesses"
                  value={`${soloGame.guesses.length}/${WORD_SCRAMBLE_MAX_GUESSES}`}
                />
                <StatPanel
                  label="Left"
                  value={Math.max(
                    0,
                    WORD_SCRAMBLE_MAX_GUESSES - soloGame.guesses.length,
                  ).toString()}
                />
              </div>
              <UsedGuessesPanel guesses={soloGame.guesses} />
              <ResultPanel text={getSoloResultText(soloGame.status)} />
            </>
          }
          statusText={getSoloStatusText(soloGame)}
          statusTone={soloGame.status}
          wordLength={soloGame.puzzle.word.length}
        />
      </section>
    );
  }

  if (!lobby) {
    return (
      <section
        aria-labelledby="word-scramble-title"
        className="grid gap-4 sm:gap-5"
      >
        <WordScrambleHeader
          onModeChange={handleModeChange}
          playMode={playMode}
          showModeControls={showModeControls}
        />

        <WordScrambleLobbySetup
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
  const shouldShowPlaySurface =
    lobby.status === "playing" || lobby.status === "finished";

  return (
    <section
      aria-labelledby="word-scramble-title"
      className="grid gap-4 sm:gap-5"
    >
      <WordScrambleHeader
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
        <WordScramblePlaySurface
          answerValue={lobbyGuess}
          category={lobby.category ?? "Race"}
          isSubmitDisabled={
            lobby.status !== "playing" ||
            isSubmittingGuess ||
            isLocalPlayerDone(lobby)
          }
          onAnswerChange={(value) =>
            setLobbyGuess(cleanGuess(value, lobby.wordLength))
          }
          onSubmit={handleLobbyGuess}
          scrambledWord={lobby.scrambledWord ?? ""}
          sidePanel={
            <WordScrambleLobbySidePanel
              copied={hasCopiedCode}
              lobby={lobby}
              onCopy={handleCopyLobbyCode}
            />
          }
          statusText={getLobbyStatusText(lobby)}
          statusTone={getLobbyStatusTone(lobby)}
          wordLength={lobby.wordLength}
        />
      ) : (
        <WordScrambleReadyRoom
          copied={hasCopiedCode}
          isBusy={isBusy}
          lobby={lobby}
          localPlayer={localPlayer}
          onCopy={handleCopyLobbyCode}
          onReady={handleReady}
          statusText={getLobbyStatusText(lobby)}
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

function WordScrambleHeader({
  actions,
  onModeChange,
  playMode,
  showModeControls = true,
}: {
  actions?: ReactNode;
  onModeChange: (mode: WordScramblePlayMode) => void;
  playMode: WordScramblePlayMode;
  showModeControls?: boolean;
}) {
  return (
    <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-teal-200/80 sm:tracking-[0.28em]">
          Letter Puzzle
        </p>
        <h2
          id="word-scramble-title"
          className="mt-1 text-2xl font-black text-white sm:mt-2 sm:text-5xl"
        >
          Word Scramble
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

function WordScrambleLobbySetup({
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
              aria-label="Word Scramble lobby code"
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

function WordScrambleReadyRoom({
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
  lobby: WordScrambleLobbyView;
  localPlayer: WordScramblePublicPlayer | null;
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
        <LobbyCodePanel copied={copied} code={lobby.code} onCopy={onCopy} />
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

function WordScramblePlaySurface({
  answerValue,
  category,
  isSubmitDisabled,
  onAnswerChange,
  onSubmit,
  scrambledWord,
  sidePanel,
  statusText,
  statusTone = "playing",
  wordLength,
}: {
  answerValue: string;
  category: string;
  isSubmitDisabled: boolean;
  onAnswerChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  scrambledWord: string;
  sidePanel: ReactNode;
  statusText: string;
  statusTone?: WordScrambleSoloStatus;
  wordLength: number;
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-5">
      <div className="grid gap-4">
        <div className="grid gap-4 rounded-lg border border-white/10 bg-slate-950/75 p-3 shadow-2xl shadow-black/30 sm:p-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.75fr)]">
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
              aria-label="Scrambled word"
              className="flex min-h-24 flex-wrap items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-4"
            >
              {scrambledWord.split("").map((letter, index) => (
                <span
                  key={`${letter}-${index}`}
                  className="flex min-h-12 min-w-9 items-center justify-center rounded-md border border-teal-200/50 bg-teal-200/10 px-2 text-2xl font-black text-teal-100 sm:min-w-11 sm:text-3xl"
                >
                  {letter}
                </span>
              ))}
            </div>
          </div>

          <div className="grid content-center gap-4">
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

            <div className="rounded-lg border border-white/10 bg-white/[0.06] p-4">
              <div className="flex items-center gap-2 text-slate-300">
                <Shuffle aria-hidden="true" className="size-4 text-sky-200" />
                <p className="text-xs font-bold uppercase tracking-[0.2em]">
                  Letters
                </p>
              </div>
              <p className="mt-3 text-4xl font-black text-white">
                {wordLength}
              </p>
            </div>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="grid gap-3 rounded-lg border border-white/10 bg-slate-950/65 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:p-4"
        >
          <label className="grid min-w-0 gap-2 text-sm font-bold text-slate-200">
            Answer
            <input
              aria-label="Word scramble answer"
              value={answerValue}
              onChange={(event) => onAnswerChange(event.target.value)}
              className="min-h-12 w-full rounded-lg border border-white/10 bg-white/[0.07] px-3 text-base font-black uppercase tracking-[0.14em] text-white outline-none transition placeholder:tracking-normal placeholder:text-slate-500 focus:border-teal-200/80"
              autoCapitalize="characters"
              autoComplete="off"
              inputMode="text"
              maxLength={wordLength}
              placeholder="WORD"
              spellCheck={false}
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitDisabled || !answerValue}
            className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-teal-300 px-4 text-sm font-black text-slate-950 transition hover:bg-teal-200 disabled:cursor-default disabled:opacity-70 sm:self-end"
          >
            <Send aria-hidden="true" className="size-4" />
            Submit Guess
          </button>
        </form>
      </div>

      <aside className="grid content-start gap-3">{sidePanel}</aside>
    </section>
  );
}

function WordScrambleLobbySidePanel({
  copied,
  lobby,
  onCopy,
}: {
  copied: boolean;
  lobby: WordScrambleLobbyView;
  onCopy: () => void;
}) {
  return (
    <>
      <LobbyCodePanel copied={copied} code={lobby.code} onCopy={onCopy} />
      <div className="grid grid-cols-2 gap-3">
        <StatPanel
          label="Guesses"
          value={`${lobby.localGuesses.length}/${WORD_SCRAMBLE_MAX_GUESSES}`}
        />
        <StatPanel
          label="Left"
          value={Math.max(
            0,
            WORD_SCRAMBLE_MAX_GUESSES - lobby.localGuesses.length,
          ).toString()}
        />
      </div>
      <PlayersPanel
        localPlayerId={lobby.localPlayerId}
        players={lobby.players}
        status={lobby.status}
      />
      <UsedGuessesPanel guesses={lobby.localGuesses} />
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
          aria-label="Word Scramble lobby code"
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
  localPlayerId: WordScramblePlayerId;
  players: WordScramblePublicPlayer[];
  status: WordScrambleLobbyView["status"];
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
  player: WordScramblePublicPlayer;
  status: WordScrambleLobbyView["status"];
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
          {player.elapsedMs === null
            ? `${player.guessCount}/${WORD_SCRAMBLE_MAX_GUESSES}`
            : formatElapsed(player.elapsedMs)}
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

function UsedGuessesPanel({ guesses }: { guesses: string[] }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.07] p-3 sm:p-4">
      <div className="flex items-center gap-2 text-slate-300">
        <Keyboard aria-hidden="true" className="size-4 text-teal-200" />
        <p className="text-xs font-bold uppercase tracking-[0.2em]">
          Guesses
        </p>
      </div>
      <p className="mt-3 min-h-6 break-words text-sm font-black uppercase tracking-[0.12em] text-slate-200">
        {guesses.length > 0 ? guesses.join(" ") : "None"}
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

function getSoloStatusText(game: WordScrambleSoloGame): string {
  if (game.status === "won") {
    return "You solved it";
  }

  if (game.status === "lost") {
    return `The word was ${game.puzzle.word}`;
  }

  if (game.guesses.length === 0) {
    return "Make a guess";
  }

  return "Try another word";
}

function getSoloResultText(status: WordScrambleSoloStatus): string {
  if (status === "won") {
    return "Word solved";
  }

  if (status === "lost") {
    return "Try a new word";
  }

  return "In progress";
}

function getLobbyStatusText(lobby: WordScrambleLobbyView): string {
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

  if (localPlayer?.isOut) {
    return "Out of guesses";
  }

  if (!lobby.localLastGuess) {
    return "Race is live";
  }

  return "Try another word";
}

function getLobbyStatusTone(
  lobby: WordScrambleLobbyView,
): WordScrambleSoloStatus {
  if (lobby.status !== "finished") {
    return "playing";
  }

  return lobby.winnerId === lobby.localPlayerId ? "won" : "lost";
}

function getLobbyResultText(lobby: WordScrambleLobbyView): string {
  if (lobby.status !== "finished") {
    return "In progress";
  }

  if (!lobby.winnerId) {
    return lobby.revealedWord ? `No winner: ${lobby.revealedWord}` : "No winner";
  }

  const winnerName = getLobbyPlayerName(lobby, lobby.winnerId);
  const winner = lobby.players.find((player) => player.id === lobby.winnerId);
  const timeText =
    winner?.elapsedMs === null ? "" : ` in ${formatElapsed(winner?.elapsedMs ?? 0)}`;

  return `${winnerName} wins${timeText}`;
}

function getPlayerStateText(
  player: WordScramblePublicPlayer,
  isLocal: boolean,
  status: WordScrambleLobbyView["status"],
): string {
  if (player.isSolved) {
    return isLocal ? "You solved" : "Solved";
  }

  if (player.isOut) {
    return isLocal ? "You are out" : "Out";
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

function getLocalPlayer(
  lobby: WordScrambleLobbyView,
): WordScramblePublicPlayer | null {
  return (
    lobby.players.find((player) => player.id === lobby.localPlayerId) ?? null
  );
}

function getLobbyPlayerName(
  lobby: WordScrambleLobbyView,
  nextPlayerId: WordScramblePlayerId,
): string {
  return (
    lobby.players.find((player) => player.id === nextPlayerId)?.name ??
    nextPlayerId
  );
}

function isLocalPlayerDone(lobby: WordScrambleLobbyView): boolean {
  const localPlayer = getLocalPlayer(lobby);

  return Boolean(localPlayer?.isSolved || localPlayer?.isOut);
}

function formatElapsed(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

function getLobbyUrl(code: string, playerId: WordScramblePlayerId): string {
  const params = new URLSearchParams({ playerId });

  return `/api/word-scramble/lobbies/${encodeURIComponent(code)}?${params.toString()}`;
}

function cleanGuess(value: string, maxLength: number): string {
  return normalizeWordScrambleGuess(value).slice(0, maxLength);
}

function cleanLobbyCode(value: string): string {
  return normalizeLobbyCode(value).slice(0, 6);
}

function rememberSession(
  code: string,
  playerId: WordScramblePlayerId,
  rejoinToken: string,
) {
  rememberLobbySession(SESSION_STORAGE_KEY, { code, playerId, rejoinToken });
}

function readSavedSession(): SavedWordScrambleSession | null {
  return readLobbySession(
    SESSION_STORAGE_KEY,
    cleanLobbyCode,
    isWordScramblePlayerId,
  );
}
