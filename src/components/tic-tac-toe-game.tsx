"use client";

import {
  Bot,
  Copy,
  LogIn,
  LogOut,
  Plus,
  RotateCcw,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from "react";
import type { FormEvent, ReactNode } from "react";
import {
  BOT_PLAYER,
  MAX_ACTIVE_MOVES,
  chooseBotMove,
  createGameState,
  gameReducer,
  getCellLabel,
  type GameMode,
  type Player,
  type RoundState,
  type ScoreState,
} from "@/lib/game";
import { getErrorMessage, getJson, postJson } from "@/lib/http-client";
import { normalizeLobbyCode } from "@/lib/lobby-utils";
import type { TicTacToeLobby } from "@/lib/tic-tac-toe-lobbies";

type TicTacToePlayMode = GameMode | "online";

type LobbyResponse = {
  lobby: TicTacToeLobby;
};

type LobbyWithPlayerResponse = LobbyResponse & {
  playerId: Player;
};

type SavedTicTacToeSession = {
  code: string;
  playerId: Player;
};

const PLAYER_THEME: Record<
  Player,
  {
    label: string;
    mark: string;
    cell: string;
    glow: string;
    text: string;
  }
> = {
  X: {
    label: "X",
    mark: "X",
    cell: "border-cyan-300/70 bg-cyan-300/15 text-cyan-100",
    glow: "shadow-[0_0_36px_rgba(34,211,238,0.24)]",
    text: "text-cyan-200",
  },
  O: {
    label: "O",
    mark: "O",
    cell: "border-amber-300/70 bg-amber-300/15 text-amber-100",
    glow: "shadow-[0_0_36px_rgba(251,191,36,0.24)]",
    text: "text-amber-200",
  },
};

const MODE_OPTIONS: Array<{
  mode: TicTacToePlayMode;
  label: string;
  icon: typeof Bot;
}> = [
  { mode: "solo", label: "Solo", icon: Bot },
  { mode: "duo", label: "Same Device", icon: Users },
  { mode: "online", label: "Lobby", icon: Users },
];

const SESSION_STORAGE_KEY = "mini-arcade-tic-tac-toe-session";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function TicTacToeGame() {
  const [playMode, setPlayMode] = useState<TicTacToePlayMode>("solo");
  const [game, dispatch] = useReducer(gameReducer, undefined, () =>
    createGameState("solo"),
  );
  const [lobby, setLobby] = useState<TicTacToeLobby | null>(null);
  const [playerId, setPlayerId] = useState<Player | null>(null);
  const [playerName, setPlayerName] = useState("Player");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [pendingMoveIndex, setPendingMoveIndex] = useState<number | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [hasCopiedCode, setHasCopiedCode] = useState(false);

  const { mode, round, scores } = game;
  const isBotTurn =
    playMode === "solo" &&
    mode === "solo" &&
    round.status === "playing" &&
    round.currentPlayer === BOT_PLAYER;

  const refreshLobby = useCallback(async (code: string) => {
    const response = await getJson<LobbyResponse>(
      `/api/tic-tac-toe/lobbies/${encodeURIComponent(code)}`,
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

      setPlayMode("online");
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
    if (!isBotTurn) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const move = chooseBotMove(round);

      if (move !== null) {
        dispatch({ type: "PLACE_MARK", player: BOT_PLAYER, index: move });
      }
    }, 480);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isBotTurn, round]);

  useEffect(() => {
    if (!lobby?.code || playMode !== "online") {
      return;
    }

    let isActive = true;

    const pollLobby = async () => {
      try {
        const response = await getJson<LobbyResponse>(
          `/api/tic-tac-toe/lobbies/${encodeURIComponent(lobby.code)}`,
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

  const localStatusText = useMemo(() => {
    if (round.winner) {
      return getLocalWinStatus(round.winner, mode);
    }

    if (isBotTurn) {
      return "Bot is thinking";
    }

    return getLocalTurnStatus(round.currentPlayer, mode);
  }, [isBotTurn, mode, round.currentPlayer, round.winner]);

  const localBoardLocked = round.status !== "playing" || isBotTurn;
  const onlineRound = lobby?.game.round;
  const onlineScores = lobby?.game.scores;
  const localPlayer = lobby?.players.find((player) => player.id === playerId);
  const onlineStatusText = getOnlineStatusText(lobby, playerId);
  const onlineBoardLocked =
    !lobby ||
    !playerId ||
    lobby.status !== "playing" ||
    lobby.game.round.currentPlayer !== playerId ||
    pendingMoveIndex !== null;

  function handleModeChange(nextMode: TicTacToePlayMode) {
    setPlayMode(nextMode);
    setError("");

    if (nextMode === "solo" || nextMode === "duo") {
      dispatch({ type: "SET_MODE", mode: nextMode });
    }
  }

  async function handleCreateLobby() {
    setIsBusy(true);
    setError("");

    try {
      const response = await postJson<LobbyWithPlayerResponse>(
        "/api/tic-tac-toe/lobbies",
        { playerName },
      );

      setLobby(response.lobby);
      setPlayerId(response.playerId);
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
        `/api/tic-tac-toe/lobbies/${encodeURIComponent(code)}/join`,
        { playerName },
      );

      setLobby(response.lobby);
      setPlayerId(response.playerId);
      rememberSession(response.lobby.code, response.playerId);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleOnlineMove(index: number) {
    if (!lobby || !playerId || pendingMoveIndex !== null) {
      return;
    }

    setPendingMoveIndex(index);
    setError("");

    try {
      const response = await postJson<LobbyResponse>(
        `/api/tic-tac-toe/lobbies/${encodeURIComponent(lobby.code)}/move`,
        {
          playerId,
          index,
        },
      );

      setLobby(response.lobby);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setPendingMoveIndex(null);
    }
  }

  async function handleOnlineNewRound() {
    if (!lobby || !playerId) {
      return;
    }

    setIsBusy(true);
    setError("");

    try {
      const response = await postJson<LobbyResponse>(
        `/api/tic-tac-toe/lobbies/${encodeURIComponent(lobby.code)}/new-round`,
        { playerId },
      );

      setLobby(response.lobby);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleOnlineReset() {
    if (!lobby || !playerId) {
      return;
    }

    setIsBusy(true);
    setError("");

    try {
      const response = await postJson<LobbyResponse>(
        `/api/tic-tac-toe/lobbies/${encodeURIComponent(lobby.code)}/reset`,
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

  return (
    <section aria-labelledby="tic-tac-toe-title" className="grid gap-5">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-teal-200/80">
            Classic Grid
          </p>
          <h2 id="tic-tac-toe-title" className="mt-2 text-3xl font-black text-white sm:text-5xl">
            Tic-Tac-Toe
          </h2>
        </div>

        <div className="grid w-full grid-cols-3 rounded-lg border border-white/10 bg-white/5 p-1 sm:w-auto">
          {MODE_OPTIONS.map(({ mode: optionMode, label, icon: Icon }) => (
            <button
              key={optionMode}
              type="button"
              aria-pressed={playMode === optionMode}
              onClick={() => handleModeChange(optionMode)}
              className={cn(
                "flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-bold transition sm:px-4",
                playMode === optionMode
                  ? "bg-teal-300 text-slate-950 shadow-lg shadow-teal-950/40"
                  : "text-slate-300 hover:bg-white/10 hover:text-white",
              )}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
      </header>

      {playMode === "online" && !lobby ? (
        <TicTacToeLobbySetup
          error={error}
          isBusy={isBusy || isRestoring}
          joinCode={joinCode}
          onCreateLobby={handleCreateLobby}
          onJoinCodeChange={(value) => setJoinCode(cleanLobbyCode(value))}
          onJoinLobby={handleJoinLobby}
          onPlayerNameChange={setPlayerName}
          playerName={playerName}
        />
      ) : null}

      {playMode !== "online" ? (
        <TicTacToePlaySurface
          actionButtons={
            <LocalActionButtons
              onNewRound={() => dispatch({ type: "NEW_ROUND" })}
              onReset={() => dispatch({ type: "RESET_SCORES" })}
            />
          }
          boardLocked={localBoardLocked}
          mode={mode}
          onMove={(index) =>
            dispatch({
              type: "PLACE_MARK",
              player: round.currentPlayer,
              index,
            })
          }
          round={round}
          scores={scores}
          statusText={localStatusText}
        />
      ) : null}

      {playMode === "online" && lobby && onlineRound && onlineScores ? (
        <TicTacToePlaySurface
          actionButtons={
            <OnlineActionButtons
              disabled={isBusy || !playerId}
              onLeave={handleLeaveLobby}
              onNewRound={handleOnlineNewRound}
              onReset={handleOnlineReset}
            />
          }
          boardLocked={onlineBoardLocked}
          lobbyPanel={
            <OnlineLobbyPanel
              copied={hasCopiedCode}
              lobby={lobby}
              localPlayerId={localPlayer?.id ?? null}
              onCopy={handleCopyLobbyCode}
            />
          }
          mode="online"
          onMove={handleOnlineMove}
          round={onlineRound}
          scores={onlineScores}
          statusText={onlineStatusText}
        />
      ) : null}

      {playMode === "online" && lobby && error ? (
        <ErrorMessage message={error} />
      ) : null}
    </section>
  );
}

function TicTacToeLobbySetup({
  error,
  isBusy,
  joinCode,
  onCreateLobby,
  onJoinCodeChange,
  onJoinLobby,
  onPlayerNameChange,
  playerName,
}: {
  error: string;
  isBusy: boolean;
  joinCode: string;
  onCreateLobby: () => void;
  onJoinCodeChange: (value: string) => void;
  onJoinLobby: (event: FormEvent<HTMLFormElement>) => void;
  onPlayerNameChange: (value: string) => void;
  playerName: string;
}) {
  return (
    <section className="grid gap-4 rounded-lg border border-white/10 bg-slate-950/70 p-4 shadow-2xl shadow-black/25 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
      <div className="grid content-start gap-4">
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

      <form onSubmit={onJoinLobby} className="grid content-start gap-4">
        <label className="grid gap-2 text-sm font-bold text-slate-200">
          Lobby Code
          <input
            aria-label="Tic-Tac-Toe lobby code"
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

      {error ? <ErrorMessage message={error} /> : null}
    </section>
  );
}

function TicTacToePlaySurface({
  actionButtons,
  boardLocked,
  lobbyPanel,
  mode,
  onMove,
  round,
  scores,
  statusText,
}: {
  actionButtons: ReactNode;
  boardLocked: boolean;
  lobbyPanel?: ReactNode;
  mode: TicTacToePlayMode;
  onMove: (index: number) => void;
  round: RoundState;
  scores: ScoreState;
  statusText: string;
}) {
  return (
    <section className="grid flex-1 items-center gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col items-center justify-center gap-4">
        <TicTacToeBoard
          isBoardLocked={boardLocked}
          onMove={onMove}
          round={round}
        />

        <div
          aria-live="polite"
          className="flex min-h-16 w-full max-w-[430px] items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/65 px-4 py-3"
        >
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
              Status
            </p>
            <p
              className={cn(
                "mt-1 text-xl font-black",
                round.winner
                  ? "text-emerald-200"
                  : PLAYER_THEME[round.currentPlayer].text,
              )}
            >
              {statusText}
            </p>
          </div>
          <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-right">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
              Turn
            </p>
            <p className="text-lg font-black text-white">{round.turnCount + 1}</p>
          </div>
        </div>
      </div>

      <aside className="grid content-center gap-3">
        {lobbyPanel}

        <div className="grid grid-cols-2 gap-3">
          {(["X", "O"] as const).map((player) => (
            <ScorePanel
              key={player}
              player={player}
              label={getPlayerLabel(player, mode)}
              score={scores[player]}
            />
          ))}
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.07] p-4">
          <div className="flex items-center gap-2 text-slate-300">
            <Trophy aria-hidden="true" className="size-4 text-emerald-200" />
            <p className="text-xs font-bold uppercase tracking-[0.22em]">
              Active Marks
            </p>
          </div>

          <div className="mt-4 grid gap-3">
            {(["X", "O"] as const).map((player) => (
              <ActiveMarks
                key={player}
                player={player}
                count={round.activeMoves[player].length}
              />
            ))}
          </div>
        </div>

        {actionButtons}
      </aside>
    </section>
  );
}

function TicTacToeBoard({
  isBoardLocked,
  onMove,
  round,
}: {
  isBoardLocked: boolean;
  onMove: (index: number) => void;
  round: RoundState;
}) {
  return (
    <div
      aria-label="Tic-Tac-Toe board"
      className="grid w-full max-w-[430px] grid-cols-3 gap-3 rounded-lg border border-white/10 bg-slate-950/75 p-3 shadow-2xl shadow-black/30"
      role="grid"
    >
      {round.board.map((cell, index) => {
        const isWinningCell = round.winningLine?.includes(index);
        const isOldestMove =
          cell !== null &&
          round.activeMoves[cell].length === MAX_ACTIVE_MOVES &&
          round.activeMoves[cell][0] === index &&
          round.status === "playing";

        return (
          <button
            key={index}
            type="button"
            aria-label={getCellLabel(index, cell)}
            disabled={isBoardLocked || cell !== null}
            onClick={() => onMove(index)}
            className={cn(
              "flex aspect-square min-h-0 items-center justify-center rounded-lg border text-5xl font-black transition duration-200 sm:text-6xl",
              cell
                ? cn(PLAYER_THEME[cell].cell, PLAYER_THEME[cell].glow)
                : "border-white/10 bg-white/[0.06] text-white hover:border-teal-200/60 hover:bg-teal-200/10",
              isOldestMove && "opacity-55 ring-2 ring-white/20",
              isWinningCell &&
                "scale-[1.03] border-emerald-300 bg-emerald-300/20 text-emerald-100 ring-2 ring-emerald-200/80",
              (isBoardLocked || cell !== null) &&
                "cursor-default hover:border-white/10",
            )}
            role="gridcell"
          >
            {cell ? PLAYER_THEME[cell].mark : ""}
          </button>
        );
      })}
    </div>
  );
}

function OnlineLobbyPanel({
  copied,
  lobby,
  localPlayerId,
  onCopy,
}: {
  copied: boolean;
  lobby: TicTacToeLobby;
  localPlayerId: Player | null;
  onCopy: () => void;
}) {
  return (
    <>
      <div className="rounded-lg border border-white/10 bg-white/[0.07] p-4">
        <div className="flex items-center gap-2 text-slate-300">
          <Users aria-hidden="true" className="size-4 text-teal-200" />
          <p className="text-xs font-bold uppercase tracking-[0.22em]">
            Lobby
          </p>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <output
            aria-label="Tic-Tac-Toe lobby code"
            className="rounded-md border border-teal-200/30 bg-teal-200/10 px-3 py-2 text-xl font-black tracking-[0.2em] text-teal-100"
          >
            {lobby.code}
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

      <div className="grid gap-3">
        {(["X", "O"] as const).map((player) => {
          const lobbyPlayer = lobby.players.find(({ id }) => id === player);

          if (!lobbyPlayer) {
            return <WaitingPlayerPanel key={player} player={player} />;
          }

          return (
            <OnlinePlayerPanel
              key={player}
              isCurrent={lobby.game.round.currentPlayer === player}
              isLocal={localPlayerId === player}
              name={lobbyPlayer.name}
              player={player}
            />
          );
        })}
      </div>
    </>
  );
}

function OnlinePlayerPanel({
  isCurrent,
  isLocal,
  name,
  player,
}: {
  isCurrent: boolean;
  isLocal: boolean;
  name: string;
  player: Player;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-white/[0.07] p-4",
        isCurrent ? "border-teal-200/60" : "border-white/10",
      )}
    >
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
        Player {player}
      </p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-black text-white">{name}</p>
          <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            {isLocal ? "You" : isCurrent ? "Turn" : "Ready"}
          </p>
        </div>
        <span className={cn("text-4xl font-black", PLAYER_THEME[player].text)}>
          {player}
        </span>
      </div>
    </div>
  );
}

function WaitingPlayerPanel({ player }: { player: Player }) {
  return (
    <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.04] p-4">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
        Player {player}
      </p>
      <p className="mt-3 text-base font-black text-slate-300">Waiting</p>
    </div>
  );
}

function ScorePanel({
  player,
  label,
  score,
}: {
  player: Player;
  label: string;
  score: number;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-white/[0.07] p-4",
        player === "X" ? "border-cyan-300/30" : "border-amber-300/30",
      )}
    >
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
        {label}
      </p>
      <div className="mt-3 flex items-end justify-between">
        <span className={cn("text-3xl font-black", PLAYER_THEME[player].text)}>
          {PLAYER_THEME[player].mark}
        </span>
        <span className="text-4xl font-black text-white">{score}</span>
      </div>
    </div>
  );
}

function ActiveMarks({ player, count }: { player: Player; count: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={cn("text-sm font-black", PLAYER_THEME[player].text)}>
        {PLAYER_THEME[player].label}
      </span>
      <div className="flex gap-2" aria-label={`${count} active ${player} marks`}>
        {Array.from({ length: MAX_ACTIVE_MOVES }).map((_, index) => (
          <span
            key={index}
            className={cn(
              "size-3 rounded-full border",
              index < count
                ? player === "X"
                  ? "border-cyan-200 bg-cyan-200"
                  : "border-amber-200 bg-amber-200"
                : "border-white/15 bg-white/5",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function LocalActionButtons({
  onNewRound,
  onReset,
}: {
  onNewRound: () => void;
  onReset: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        type="button"
        onClick={onNewRound}
        className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-teal-300 px-3 text-sm font-black text-slate-950 transition hover:bg-teal-200"
      >
        <Sparkles aria-hidden="true" className="size-4" />
        New Round
      </button>
      <button
        type="button"
        onClick={onReset}
        className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.07] px-3 text-sm font-black text-slate-100 transition hover:bg-white/12"
      >
        <RotateCcw aria-hidden="true" className="size-4" />
        Reset
      </button>
    </div>
  );
}

function OnlineActionButtons({
  disabled,
  onLeave,
  onNewRound,
  onReset,
}: {
  disabled: boolean;
  onLeave: () => void;
  onNewRound: () => void;
  onReset: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        type="button"
        onClick={onNewRound}
        disabled={disabled}
        className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-teal-300 px-3 text-sm font-black text-slate-950 transition hover:bg-teal-200 disabled:cursor-wait disabled:opacity-70"
      >
        <Sparkles aria-hidden="true" className="size-4" />
        New Round
      </button>
      <button
        type="button"
        onClick={onReset}
        disabled={disabled}
        className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.07] px-3 text-sm font-black text-slate-100 transition hover:bg-white/12 disabled:cursor-wait disabled:opacity-70"
      >
        <RotateCcw aria-hidden="true" className="size-4" />
        Reset
      </button>
      <button
        type="button"
        onClick={onLeave}
        className="col-span-2 flex min-h-12 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.07] px-3 text-sm font-black text-slate-100 transition hover:bg-white/12"
      >
        <LogOut aria-hidden="true" className="size-4" />
        Leave Lobby
      </button>
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-rose-300/30 bg-rose-300/10 px-4 py-3 text-sm font-bold text-rose-100"
    >
      {message}
    </p>
  );
}

function getPlayerLabel(player: Player, mode: TicTacToePlayMode) {
  if (mode === "duo" || mode === "online") {
    return `Player ${player}`;
  }

  return player === "X" ? "You" : "Bot";
}

function getLocalTurnStatus(player: Player, mode: GameMode) {
  if (mode === "solo") {
    return player === "X" ? "Your turn" : "Bot is thinking";
  }

  return `Player ${player}'s turn`;
}

function getLocalWinStatus(player: Player, mode: GameMode) {
  if (mode === "solo") {
    return player === "X" ? "You win" : "Bot wins";
  }

  return `Player ${player} wins`;
}

function getOnlineStatusText(
  lobby: TicTacToeLobby | null,
  playerId: Player | null,
): string {
  if (!lobby) {
    return "";
  }

  if (lobby.status === "waiting") {
    return "Waiting for Player O";
  }

  if (lobby.status === "finished") {
    const winner = lobby.game.round.winner;

    if (!winner) {
      return "Round finished";
    }

    return winner === playerId ? "You win" : `${getPlayerName(lobby, winner)} wins`;
  }

  if (lobby.game.round.currentPlayer === playerId) {
    return "Your turn";
  }

  return `${getPlayerName(lobby, lobby.game.round.currentPlayer)}'s turn`;
}

function getPlayerName(lobby: TicTacToeLobby, playerId: Player): string {
  return lobby.players.find((player) => player.id === playerId)?.name ?? `Player ${playerId}`;
}

function cleanLobbyCode(value: string): string {
  return normalizeLobbyCode(value).slice(0, 6);
}

function rememberSession(code: string, playerId: Player) {
  window.sessionStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({ code, playerId }),
  );
}

function readSavedSession(): SavedTicTacToeSession | null {
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

      if (
        typeof code === "string" &&
        typeof playerId === "string" &&
        isPlayer(playerId)
      ) {
        const normalizedCode = cleanLobbyCode(code);

        if (normalizedCode) {
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

function isPlayer(value: string): value is Player {
  return value === "X" || value === "O";
}
