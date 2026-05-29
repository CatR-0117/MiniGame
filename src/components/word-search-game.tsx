"use client";

import {
  Bot,
  Copy,
  Grid3X3,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  createWordSearchSoloGame,
  isWordSearchPlayerId,
  submitWordSearchSoloSelection,
  type WordSearchCellPosition,
  type WordSearchLobbyView,
  type WordSearchPlayerId,
  type WordSearchPublicPlayer,
  type WordSearchSoloGame,
  type WordSearchSoloStatus,
  type WordSearchWordPath,
} from "@/lib/word-search";
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

type WordSearchPlayMode = "solo" | "lobby";

type LobbyResponse = {
  lobby: WordSearchLobbyView;
};

type LobbyWithPlayerResponse = LobbyResponse & {
  playerId: WordSearchPlayerId;
};

type SavedWordSearchSession = StoredLobbySession<WordSearchPlayerId>;

const SESSION_STORAGE_KEY = "mini-arcade-word-search-session";
const LOBBY_POLL_MS = 700;

const MODE_OPTIONS: Array<{
  mode: WordSearchPlayMode;
  label: string;
  icon: typeof Bot;
}> = [
  { mode: "solo", label: "Solo", icon: Bot },
  { mode: "lobby", label: "Lobby", icon: Users },
];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function WordSearchGame({
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
  initialPlayMode?: WordSearchPlayMode;
  onLobbyGameChange?: (game: ArcadeLobbyGame) => void;
  onLobbyLeave?: () => void;
  onLobbySessionChange?: (session: {
    code: string;
    game: "word-search";
    isHost: boolean;
    playerId: WordSearchPlayerId;
    rejoinToken: string;
  }) => void;
  playerName?: string;
  rejoinToken?: string;
  showLobbyJoinForm?: boolean;
  showModeControls?: boolean;
}) {
  const [playMode, setPlayMode] = useState<WordSearchPlayMode>(initialPlayMode);
  const [soloGame, setSoloGame] = useState<WordSearchSoloGame>(() =>
    createWordSearchSoloGame(),
  );
  const [soloStart, setSoloStart] = useState<WordSearchCellPosition | null>(
    null,
  );
  const [lobby, setLobby] = useState<WordSearchLobbyView | null>(null);
  const [playerId, setPlayerId] = useState<WordSearchPlayerId | null>(null);
  const [lobbyStart, setLobbyStart] = useState<WordSearchCellPosition | null>(
    null,
  );
  const [localPlayerName, setLocalPlayerName] = useState("Player");
  const [localRejoinToken] = useState(() => createRejoinToken());
  const autoJoinedCodeRef = useRef<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [isSubmittingSelection, setIsSubmittingSelection] = useState(false);
  const [isRestoring, setIsRestoring] = useState(initialPlayMode === "lobby");
  const [hasCopiedCode, setHasCopiedCode] = useState(false);
  const playerName = externalPlayerName ?? localPlayerName;
  const sessionRejoinToken = externalRejoinToken ?? localRejoinToken;

  const soloFoundCellKeys = useMemo(
    () => getFoundCellKeys(soloGame.foundWordPaths),
    [soloGame.foundWordPaths],
  );
  const lobbyFoundCellKeys = useMemo(
    () => getFoundCellKeys(lobby?.localFoundWordPaths ?? []),
    [lobby?.localFoundWordPaths],
  );

  const refreshLobby = useCallback(
    async (code: string, nextPlayerId: WordSearchPlayerId) => {
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
        `/api/word-search/lobbies/${encodeURIComponent(code)}/join`,
        { playerName, rejoinToken: sessionRejoinToken },
      );

      setLobby(response.lobby);
      setPlayerId(response.playerId);
      setPlayMode("lobby");
      setLobbyStart(null);
      rememberSession(
        response.lobby.code,
        response.playerId,
        sessionRejoinToken,
      );
      onLobbySessionChange?.({
        code: response.lobby.code,
        game: "word-search",
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
      setLobbyStart(null);
      setJoinCode("");
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

          if (activeGame !== "word-search") {
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

  function handleModeChange(nextMode: WordSearchPlayMode) {
    setPlayMode(nextMode);
    setError("");
  }

  function handleSoloCellClick(position: WordSearchCellPosition) {
    if (soloGame.status !== "playing") {
      return;
    }

    if (!soloStart) {
      setSoloStart(position);
      return;
    }

    setSoloGame((currentGame) =>
      submitWordSearchSoloSelection(currentGame, soloStart, position),
    );
    setSoloStart(null);
  }

  function handleSoloNewBoard() {
    setSoloGame((currentGame) =>
      createWordSearchSoloGame(currentGame.puzzle.category),
    );
    setSoloStart(null);
    setError("");
  }

  async function handleCreateLobby() {
    setIsBusy(true);
    setError("");

    try {
      const response = await postJson<LobbyWithPlayerResponse>(
        "/api/word-search/lobbies",
        { playerName, rejoinToken: sessionRejoinToken },
      );

      setLobby(response.lobby);
      setPlayerId(response.playerId);
      setPlayMode("lobby");
      setJoinCode("");
      setLobbyStart(null);
      rememberSession(
        response.lobby.code,
        response.playerId,
        sessionRejoinToken,
      );
      onLobbySessionChange?.({
        code: response.lobby.code,
        game: "word-search",
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
        `/api/word-search/lobbies/${encodeURIComponent(lobby.code)}/ready`,
        { playerId },
      );

      setLobby(response.lobby);
      setLobbyStart(null);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleLobbyCellClick(position: WordSearchCellPosition) {
    if (
      !lobby ||
      !playerId ||
      lobby.status !== "playing" ||
      isSubmittingSelection ||
      isLocalPlayerDone(lobby)
    ) {
      return;
    }

    if (!lobbyStart) {
      setLobbyStart(position);
      return;
    }

    setIsSubmittingSelection(true);
    setError("");

    try {
      const response = await postJson<LobbyResponse>(
        `/api/word-search/lobbies/${encodeURIComponent(lobby.code)}/select`,
        {
          playerId,
          startRow: lobbyStart.row,
          startCol: lobbyStart.col,
          endRow: position.row,
          endCol: position.col,
        },
      );

      setLobby(response.lobby);
      setLobbyStart(null);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsSubmittingSelection(false);
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
        `/api/word-search/lobbies/${encodeURIComponent(lobby.code)}/restart`,
        { playerId },
      );

      setLobby(response.lobby);
      setLobbyStart(null);
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
        `/api/word-search/lobbies/${encodeURIComponent(currentLobby.code)}`,
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
    setLobbyStart(null);
    setJoinCode("");
    setError("");
  }

  if (playMode === "solo") {
    return (
      <section
        aria-labelledby="word-search-title"
        className="grid gap-4 sm:gap-5"
      >
        <WordSearchHeader
          actions={
            <button
              type="button"
              onClick={handleSoloNewBoard}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-teal-300 px-4 text-sm font-black text-slate-950 transition hover:bg-teal-200 sm:w-auto"
            >
              <RefreshCw aria-hidden="true" className="size-4" />
              New Board
            </button>
          }
          onModeChange={handleModeChange}
          playMode={playMode}
          showModeControls={showModeControls}
        />

        <WordSearchPlaySurface
          category={soloGame.puzzle.category}
          foundCellKeys={soloFoundCellKeys}
          foundWords={soloGame.foundWords}
          grid={soloGame.puzzle.grid}
          isBoardDisabled={soloGame.status !== "playing"}
          onCellClick={handleSoloCellClick}
          selectedStart={soloStart}
          sidePanel={
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatPanel
                  label="Found"
                  value={`${soloGame.foundWords.length}/${soloGame.puzzle.words.length}`}
                />
                <StatPanel
                  label="Tries"
                  value={soloGame.attemptCount.toString()}
                />
              </div>
              <WordListPanel
                foundWords={soloGame.foundWords}
                words={soloGame.puzzle.words}
              />
              <ResultPanel text={getSoloResultText(soloGame.status)} />
            </>
          }
          statusText={getSoloStatusText(soloGame, soloStart)}
          statusTone={soloGame.status}
          words={soloGame.puzzle.words}
        />
      </section>
    );
  }

  if (!lobby) {
    return (
      <section
        aria-labelledby="word-search-title"
        className="grid gap-4 sm:gap-5"
      >
        <WordSearchHeader
          onModeChange={handleModeChange}
          playMode={playMode}
          showModeControls={showModeControls}
        />

        <WordSearchLobbySetup
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
      aria-labelledby="word-search-title"
      className="grid gap-4 sm:gap-5"
    >
      <WordSearchHeader
        actions={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <button
              type="button"
              onClick={handleRestartLobby}
              disabled={isBusy || !playerId}
              className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-teal-300 px-4 text-sm font-black text-slate-950 transition hover:bg-teal-200 disabled:cursor-wait disabled:opacity-70"
            >
              <RefreshCw aria-hidden="true" className="size-4" />
              New Board
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

      {shouldShowPlaySurface && lobby.grid ? (
        <WordSearchPlaySurface
          category={lobby.category ?? "Race"}
          foundCellKeys={lobbyFoundCellKeys}
          foundWords={lobby.localFoundWords}
          grid={lobby.grid}
          isBoardDisabled={
            lobby.status !== "playing" ||
            isSubmittingSelection ||
            isLocalPlayerDone(lobby)
          }
          onCellClick={(position) => void handleLobbyCellClick(position)}
          selectedStart={lobbyStart}
          sidePanel={
            <WordSearchLobbySidePanel
              copied={hasCopiedCode}
              lobby={lobby}
              onCopy={handleCopyLobbyCode}
            />
          }
          statusText={getLobbyStatusText(lobby, lobbyStart)}
          statusTone={getLobbyStatusTone(lobby)}
          words={lobby.words}
        />
      ) : (
        <WordSearchReadyRoom
          copied={hasCopiedCode}
          isBusy={isBusy}
          lobby={lobby}
          localPlayer={localPlayer}
          onCopy={handleCopyLobbyCode}
          onReady={handleReady}
          statusText={getLobbyStatusText(lobby, lobbyStart)}
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

function WordSearchHeader({
  actions,
  onModeChange,
  playMode,
  showModeControls = true,
}: {
  actions?: ReactNode;
  onModeChange: (mode: WordSearchPlayMode) => void;
  playMode: WordSearchPlayMode;
  showModeControls?: boolean;
}) {
  return (
    <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-teal-200/80 sm:tracking-[0.28em]">
          Find Words
        </p>
        <h2
          id="word-search-title"
          className="mt-1 text-2xl font-black text-white sm:mt-2 sm:text-5xl"
        >
          Word Search
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

function WordSearchLobbySetup({
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
              aria-label="Word Search lobby code"
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

function WordSearchReadyRoom({
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
  lobby: WordSearchLobbyView;
  localPlayer: WordSearchPublicPlayer | null;
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
          totalWords={Math.max(1, lobby.words.length)}
        />
      </aside>
    </section>
  );
}

function WordSearchPlaySurface({
  category,
  foundCellKeys,
  foundWords,
  grid,
  isBoardDisabled,
  onCellClick,
  selectedStart,
  sidePanel,
  statusText,
  statusTone = "playing",
  words,
}: {
  category: string;
  foundCellKeys: Set<string>;
  foundWords: string[];
  grid: string[][];
  isBoardDisabled: boolean;
  onCellClick: (position: WordSearchCellPosition) => void;
  selectedStart: WordSearchCellPosition | null;
  sidePanel: ReactNode;
  statusText: string;
  statusTone?: WordSearchSoloStatus;
  words: string[];
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-5">
      <div className="grid gap-4">
        <div className="grid gap-4 rounded-lg border border-white/10 bg-slate-950/75 p-3 shadow-2xl shadow-black/30 sm:p-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.7fr)]">
          <WordSearchBoard
            disabled={isBoardDisabled}
            foundCellKeys={foundCellKeys}
            grid={grid}
            onCellClick={onCellClick}
            selectedStart={selectedStart}
          />

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
                <Search aria-hidden="true" className="size-4 text-sky-200" />
                <p className="text-xs font-bold uppercase tracking-[0.2em]">
                  Words
                </p>
              </div>
              <p className="mt-3 text-4xl font-black text-white">
                {foundWords.length}/{words.length}
              </p>
            </div>
          </div>
        </div>
      </div>

      <aside className="grid content-start gap-3">{sidePanel}</aside>
    </section>
  );
}

function WordSearchBoard({
  disabled,
  foundCellKeys,
  grid,
  onCellClick,
  selectedStart,
}: {
  disabled: boolean;
  foundCellKeys: Set<string>;
  grid: string[][];
  onCellClick: (position: WordSearchCellPosition) => void;
  selectedStart: WordSearchCellPosition | null;
}) {
  return (
    <div
      aria-label="Word search grid"
      className="grid w-full max-w-[560px] grid-cols-10 gap-1 justify-self-center rounded-lg border border-white/10 bg-white/[0.04] p-2 sm:gap-1.5 sm:p-3"
    >
      {grid.flatMap((row, rowIndex) =>
        row.map((letter, colIndex) => {
          const position = { row: rowIndex, col: colIndex };
          const isSelected =
            selectedStart?.row === rowIndex && selectedStart.col === colIndex;
          const isFound = foundCellKeys.has(getCellKey(position));

          return (
            <button
              key={`${rowIndex}-${colIndex}`}
              type="button"
              aria-label={`Word search row ${rowIndex + 1}, column ${colIndex + 1}, ${letter}`}
              disabled={disabled && !isSelected}
              onClick={() => onCellClick(position)}
              className={cn(
                "flex aspect-square min-h-0 min-w-0 items-center justify-center rounded-md border text-xs font-black transition sm:text-base",
                isSelected
                  ? "border-cyan-200 bg-cyan-300/25 text-cyan-100 ring-2 ring-cyan-200/60"
                  : isFound
                    ? "border-emerald-200/60 bg-emerald-300/20 text-emerald-100"
                    : "border-white/10 bg-slate-950/55 text-slate-100 hover:border-teal-200/60 hover:bg-teal-200/10",
                disabled && "cursor-default hover:border-white/10",
              )}
            >
              {letter}
            </button>
          );
        }),
      )}
    </div>
  );
}

function WordSearchLobbySidePanel({
  copied,
  lobby,
  onCopy,
}: {
  copied: boolean;
  lobby: WordSearchLobbyView;
  onCopy: () => void;
}) {
  return (
    <>
      <LobbyCodePanel copied={copied} code={lobby.code} onCopy={onCopy} />
      <div className="grid grid-cols-2 gap-3">
        <StatPanel
          label="Found"
          value={`${lobby.localFoundWords.length}/${lobby.words.length}`}
        />
        <StatPanel
          label="Tries"
          value={lobby.localAttemptCount.toString()}
        />
      </div>
      <PlayersPanel
        localPlayerId={lobby.localPlayerId}
        players={lobby.players}
        status={lobby.status}
        totalWords={lobby.words.length}
      />
      <WordListPanel foundWords={lobby.localFoundWords} words={lobby.words} />
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
          aria-label="Word Search lobby code"
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
  totalWords,
}: {
  localPlayerId: WordSearchPlayerId;
  players: WordSearchPublicPlayer[];
  status: WordSearchLobbyView["status"];
  totalWords: number;
}) {
  return (
    <div className="grid gap-3">
      {players.map((player) => (
        <RacePlayerPanel
          key={player.id}
          isLocal={player.id === localPlayerId}
          player={player}
          status={status}
          totalWords={totalWords}
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
  totalWords,
}: {
  isLocal: boolean;
  player: WordSearchPublicPlayer;
  status: WordSearchLobbyView["status"];
  totalWords: number;
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
            ? `${player.foundCount}/${totalWords}`
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

function WordListPanel({
  foundWords,
  words,
}: {
  foundWords: string[];
  words: string[];
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.07] p-3 sm:p-4">
      <div className="flex items-center gap-2 text-slate-300">
        <Grid3X3 aria-hidden="true" className="size-4 text-teal-200" />
        <p className="text-xs font-bold uppercase tracking-[0.2em]">
          Word List
        </p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {words.map((word) => {
          const isFound = foundWords.includes(word);

          return (
            <span
              key={word}
              className={cn(
                "rounded-md border px-2 py-1 text-center text-xs font-black uppercase tracking-[0.12em]",
                isFound
                  ? "border-emerald-200/50 bg-emerald-300/15 text-emerald-100 line-through"
                  : "border-white/10 bg-slate-950/45 text-slate-200",
              )}
            >
              {word}
            </span>
          );
        })}
      </div>
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

function getSoloStatusText(
  game: WordSearchSoloGame,
  selectedStart: WordSearchCellPosition | null,
): string {
  if (game.status === "won") {
    return "All words found";
  }

  if (selectedStart) {
    return "Choose the last letter";
  }

  if (game.attemptCount === 0) {
    return "Select a word";
  }

  return game.lastFoundWord ? `Found ${game.lastFoundWord}` : "Keep searching";
}

function getSoloResultText(status: WordSearchSoloStatus): string {
  return status === "won" ? "Board cleared" : "In progress";
}

function getLobbyStatusText(
  lobby: WordSearchLobbyView,
  selectedStart: WordSearchCellPosition | null,
): string {
  const localPlayer = getLocalPlayer(lobby);

  if (lobby.status === "waiting") {
    return localPlayer?.isReady ? "Waiting for Player 2" : "Ready to search";
  }

  if (lobby.status === "readying") {
    return localPlayer?.isReady ? "Waiting for opponent" : "Ready to search";
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
    return "You found them all";
  }

  if (selectedStart) {
    return "Choose the last letter";
  }

  if (lobby.localAttemptCount === 0) {
    return "Race is live";
  }

  return lobby.localLastFoundWord
    ? `Found ${lobby.localLastFoundWord}`
    : "Keep searching";
}

function getLobbyStatusTone(lobby: WordSearchLobbyView): WordSearchSoloStatus {
  if (lobby.status !== "finished") {
    return "playing";
  }

  return lobby.winnerId === lobby.localPlayerId ? "won" : "playing";
}

function getLobbyResultText(lobby: WordSearchLobbyView): string {
  if (lobby.status !== "finished") {
    return "In progress";
  }

  if (!lobby.winnerId) {
    return "No winner";
  }

  const winnerName = getLobbyPlayerName(lobby, lobby.winnerId);
  const winner = lobby.players.find((player) => player.id === lobby.winnerId);
  const timeText =
    winner?.elapsedMs === null ? "" : ` in ${formatElapsed(winner?.elapsedMs ?? 0)}`;

  return `${winnerName} wins${timeText}`;
}

function getPlayerStateText(
  player: WordSearchPublicPlayer,
  isLocal: boolean,
  status: WordSearchLobbyView["status"],
): string {
  if (player.isSolved) {
    return isLocal ? "You solved" : "Solved";
  }

  if (status === "playing") {
    return isLocal ? "You" : "Searching";
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
  lobby: WordSearchLobbyView,
): WordSearchPublicPlayer | null {
  return (
    lobby.players.find((player) => player.id === lobby.localPlayerId) ?? null
  );
}

function getLobbyPlayerName(
  lobby: WordSearchLobbyView,
  nextPlayerId: WordSearchPlayerId,
): string {
  return (
    lobby.players.find((player) => player.id === nextPlayerId)?.name ??
    nextPlayerId
  );
}

function isLocalPlayerDone(lobby: WordSearchLobbyView): boolean {
  return Boolean(getLocalPlayer(lobby)?.isSolved);
}

function getFoundCellKeys(paths: WordSearchWordPath[]): Set<string> {
  return new Set(
    paths.flatMap((wordPath) => wordPath.path.map((position) => getCellKey(position))),
  );
}

function getCellKey(position: WordSearchCellPosition): string {
  return `${position.row}-${position.col}`;
}

function formatElapsed(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

function getLobbyUrl(code: string, playerId: WordSearchPlayerId): string {
  const params = new URLSearchParams({ playerId });

  return `/api/word-search/lobbies/${encodeURIComponent(code)}?${params.toString()}`;
}

function cleanLobbyCode(value: string): string {
  return normalizeLobbyCode(value).slice(0, 6);
}

function rememberSession(
  code: string,
  playerId: WordSearchPlayerId,
  rejoinToken: string,
) {
  rememberLobbySession(SESSION_STORAGE_KEY, { code, playerId, rejoinToken });
}

function readSavedSession(): SavedWordSearchSession | null {
  return readLobbySession(
    SESSION_STORAGE_KEY,
    cleanLobbyCode,
    isWordSearchPlayerId,
  );
}
