"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Bot, Grid3X3, Keyboard, Layers, LogIn, Users } from "lucide-react";
import { HangmanGame } from "@/components/hangman-game";
import { MemoryCardGame } from "@/components/memory-card-game";
import { TicTacToeGame } from "@/components/tic-tac-toe-game";
import { getErrorMessage, getJson, postJson } from "@/lib/http-client";
import { createRejoinToken, rememberLobbySession } from "@/lib/lobby-client";
import { normalizeLobbyCode } from "@/lib/lobby-utils";

type ArcadeGame = "tic-tac-toe" | "memory" | "hangman";
type ArcadePlayMode = "singleplayer" | "multiplayer" | "one-device";
type ArcadeJoinResponse = {
  game: ArcadeGame;
  playerId: string;
  lobby: {
    code: string;
  };
};
type ArcadeLobbyStatusResponse = {
  game: ArcadeGame;
};
type ActiveLobbySession = {
  code: string;
  game: ArcadeGame;
  isHost: boolean;
  playerId: string;
  rejoinToken: string;
};

const PLAY_MODE_OPTIONS: Array<{
  id: ArcadePlayMode;
  title: string;
  label: string;
  icon: typeof Grid3X3;
}> = [
  {
    id: "singleplayer",
    title: "Singleplayer",
    label: "Play solo",
    icon: Bot,
  },
  {
    id: "multiplayer",
    title: "Multiplayer",
    label: "Lobby code",
    icon: Users,
  },
  {
    id: "one-device",
    title: "One Device",
    label: "Local turns",
    icon: Grid3X3,
  },
];

const GAME_OPTIONS: Array<{
  id: ArcadeGame;
  title: string;
  labels: Partial<Record<ArcadePlayMode, string>>;
  modes: ArcadePlayMode[];
  icon: typeof Grid3X3;
}> = [
  {
    id: "tic-tac-toe",
    title: "Tic-Tac-Toe",
    labels: {
      singleplayer: "Solo / Bot",
      multiplayer: "Lobby Code",
      "one-device": "Same Device",
    },
    modes: ["singleplayer", "multiplayer", "one-device"],
    icon: Grid3X3,
  },
  {
    id: "memory",
    title: "Memory Cards",
    labels: {
      singleplayer: "Solo Deck",
      multiplayer: "Lobby Code",
    },
    modes: ["singleplayer", "multiplayer"],
    icon: Layers,
  },
  {
    id: "hangman",
    title: "Hangman",
    labels: {
      singleplayer: "Solo Word",
      multiplayer: "Lobby Race",
    },
    modes: ["singleplayer", "multiplayer"],
    icon: Keyboard,
  },
];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function Home() {
  const [selectedPlayMode, setSelectedPlayMode] =
    useState<ArcadePlayMode>("singleplayer");
  const [selectedGame, setSelectedGame] = useState<ArcadeGame>("tic-tac-toe");
  const [playerName, setPlayerName] = useState("Player");
  const [rejoinToken] = useState(() => createRejoinToken());
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [isSwitchingGame, setIsSwitchingGame] = useState(false);
  const [joinToken, setJoinToken] = useState(0);
  const [activeLobbySession, setActiveLobbySession] =
    useState<ActiveLobbySession | null>(null);
  const handleLobbySessionChange = useCallback(
    (session: ActiveLobbySession) => {
      setActiveLobbySession((currentSession) => {
        if (
          currentSession?.code === session.code &&
          currentSession.game === session.game &&
          currentSession.isHost === session.isHost &&
          currentSession.playerId === session.playerId &&
          currentSession.rejoinToken === session.rejoinToken
        ) {
          return currentSession;
        }

        return session;
      });
    },
    [],
  );
  const handleLobbyLeave = useCallback(() => {
    setActiveLobbySession(null);
  }, []);
  const availableGames = GAME_OPTIONS.filter((game) =>
    game.modes.includes(selectedPlayMode),
  );
  const activeGame = availableGames.some((game) => game.id === selectedGame)
    ? selectedGame
    : availableGames[0].id;

  function handlePlayModeChange(nextMode: ArcadePlayMode) {
    const nextGames = GAME_OPTIONS.filter((game) =>
      game.modes.includes(nextMode),
    );

    setSelectedPlayMode(nextMode);
    setJoinError("");
    setActiveLobbySession(null);
    setSelectedGame((currentGame) =>
      nextGames.some((game) => game.id === currentGame)
        ? currentGame
        : nextGames[0].id,
    );
  }

  useEffect(() => {
    if (selectedPlayMode !== "multiplayer" || !activeLobbySession) {
      return;
    }

    let isActive = true;

    const pollLobbyGame = async () => {
      try {
        const response = await getJson<ArcadeLobbyStatusResponse>(
          `/api/lobbies/${encodeURIComponent(activeLobbySession.code)}`,
        );

        if (!isActive || response.game === selectedGame) {
          return;
        }

        setSelectedGame(response.game);
        setActiveLobbySession((currentSession) =>
          currentSession
            ? {
                ...currentSession,
                game: response.game,
              }
            : currentSession,
        );
        setJoinToken((currentToken) => currentToken + 1);
      } catch {
        if (isActive) {
          setActiveLobbySession(null);
        }
      }
    };

    const intervalId = window.setInterval(pollLobbyGame, 900);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [activeLobbySession, selectedGame, selectedPlayMode]);

  async function handleGameChange(nextGame: ArcadeGame) {
    if (
      selectedPlayMode !== "multiplayer" ||
      !activeLobbySession ||
      !activeLobbySession.isHost
    ) {
      setSelectedGame(nextGame);
      return;
    }

    if (nextGame === activeLobbySession.game) {
      setSelectedGame(nextGame);
      return;
    }

    setIsSwitchingGame(true);
    setJoinError("");

    try {
      const response = await postJson<ArcadeJoinResponse>(
        `/api/lobbies/${encodeURIComponent(activeLobbySession.code)}/game`,
        {
          game: nextGame,
          playerName,
          rejoinToken: activeLobbySession.rejoinToken,
        },
      );

      rememberArcadeSession(
        response.game,
        response.lobby.code,
        response.playerId,
        activeLobbySession.rejoinToken,
      );
      setActiveLobbySession({
        code: response.lobby.code,
        game: response.game,
        isHost: true,
        playerId: response.playerId,
        rejoinToken: activeLobbySession.rejoinToken,
      });
      setSelectedGame(response.game);
      setJoinToken((currentToken) => currentToken + 1);
    } catch (requestError) {
      setJoinError(getErrorMessage(requestError));
    } finally {
      setIsSwitchingGame(false);
    }
  }

  async function handleJoinLobby(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const code = cleanLobbyCode(joinCode);

    if (!code) {
      setJoinError("Enter a lobby code.");
      return;
    }

    setIsJoining(true);
    setJoinError("");

    try {
      const response = await postJson<ArcadeJoinResponse>(
        `/api/lobbies/${encodeURIComponent(code)}/join`,
        { playerName, rejoinToken },
      );

      rememberArcadeSession(
        response.game,
        response.lobby.code,
        response.playerId,
        rejoinToken,
      );
      setActiveLobbySession({
        code: response.lobby.code,
        game: response.game,
        isHost: isHostPlayer(response.game, response.playerId),
        playerId: response.playerId,
        rejoinToken,
      });
      setSelectedPlayMode("multiplayer");
      setSelectedGame(response.game);
      setJoinCode("");
      setJoinToken((currentToken) => currentToken + 1);
    } catch (requestError) {
      setJoinError(getErrorMessage(requestError));
    } finally {
      setIsJoining(false);
    }
  }

  return (
    <main className="min-h-dvh overflow-x-hidden bg-[linear-gradient(135deg,#07111f_0%,#10211d_48%,#1b1024_100%)] text-slate-100">
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-4 px-3 py-4 pb-8 sm:gap-5 sm:px-6 sm:py-5 lg:px-8">
        <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-teal-200/80 sm:tracking-[0.28em]">
              Mini Arcade
            </p>
            <h1 className="mt-1 text-2xl font-black text-white sm:mt-2 sm:text-5xl">
              Choose How to Play
            </h1>
          </div>
        </header>

        <section
          aria-label="Choose how to play"
          className="grid grid-cols-3 gap-2 rounded-lg border border-white/10 bg-white/5 p-1 sm:gap-3"
        >
          {PLAY_MODE_OPTIONS.map(({ id, title, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={selectedPlayMode === id}
              onClick={() => handlePlayModeChange(id)}
              className={cn(
                "flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-md px-2 py-2 text-center transition sm:min-h-14 sm:flex-row sm:gap-3 sm:text-left",
                selectedPlayMode === id
                  ? "bg-teal-300 text-slate-950 shadow-lg shadow-teal-950/40"
                  : "text-slate-300 hover:bg-white/10 hover:text-white",
              )}
            >
              <Icon aria-hidden="true" className="size-5 shrink-0" />
              <span className="min-w-0">
                <span className="block text-xs font-black leading-tight sm:text-sm">
                  {title}
                </span>
                <span className="mt-0.5 hidden text-xs font-bold uppercase tracking-[0.16em] opacity-70 sm:block">
                  {label}
                </span>
              </span>
            </button>
          ))}
        </section>

        {selectedPlayMode === "multiplayer" && !activeLobbySession ? (
          <section className="rounded-lg border border-white/10 bg-slate-950/65 p-3 shadow-2xl shadow-black/20 sm:p-4">
            <form
              onSubmit={handleJoinLobby}
              className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(11rem,15rem)_auto] md:items-end"
            >
              <label className="grid min-w-0 gap-2 text-sm font-bold text-slate-200">
                Player Name
                <input
                  value={playerName}
                  onChange={(event) => setPlayerName(event.target.value)}
                  className="h-12 w-full rounded-lg border border-white/10 bg-white/[0.07] px-3 text-base font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-teal-200/80"
                  maxLength={24}
                  placeholder="Player"
                />
              </label>

              <label className="grid min-w-0 gap-2 text-sm font-bold text-slate-200">
                Lobby Code
                <input
                  aria-label="Arcade lobby code"
                  value={joinCode}
                  onChange={(event) => setJoinCode(cleanLobbyCode(event.target.value))}
                  className="h-12 w-full rounded-lg border border-white/10 bg-white/[0.07] px-3 text-center text-base font-black uppercase tracking-[0.2em] text-white outline-none transition placeholder:tracking-normal placeholder:text-slate-500 focus:border-teal-200/80 md:text-left"
                  inputMode="text"
                  placeholder="ABC123"
                />
              </label>

              <button
                type="submit"
                disabled={isJoining || isSwitchingGame}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-teal-300 px-4 text-sm font-black text-slate-950 shadow-lg shadow-teal-950/30 transition hover:bg-teal-200 disabled:cursor-wait disabled:opacity-70 md:w-auto md:min-w-36"
              >
                <LogIn aria-hidden="true" className="size-4" />
                Join Lobby
              </button>
            </form>

            {joinError ? (
              <p
                role="alert"
                className="rounded-lg border border-rose-300/30 bg-rose-300/10 px-4 py-3 text-sm font-bold text-rose-100 md:col-span-3"
              >
                {joinError}
              </p>
            ) : null}
          </section>
        ) : null}

        <section
          aria-label="Choose a game"
          className="grid grid-cols-3 gap-2 sm:gap-3"
        >
          {availableGames.map(({ id, title, labels, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={activeGame === id}
              onClick={() => void handleGameChange(id)}
              disabled={
                selectedPlayMode === "multiplayer" &&
                Boolean(activeLobbySession) &&
                !activeLobbySession?.isHost
              }
              className={cn(
                "flex min-h-20 min-w-0 flex-col items-center justify-center gap-2 rounded-lg border p-2 text-center transition sm:min-h-20 sm:flex-row sm:justify-between sm:gap-4 sm:p-4 sm:text-left",
                activeGame === id
                  ? "border-teal-200 bg-teal-200/15 shadow-lg shadow-teal-950/30"
                  : "border-white/10 bg-white/[0.06] hover:border-white/25 hover:bg-white/[0.09]",
                selectedPlayMode === "multiplayer" &&
                  activeLobbySession &&
                  !activeLobbySession.isHost &&
                  "cursor-default opacity-70 hover:border-white/10 hover:bg-white/[0.06]",
              )}
            >
              <span className="flex min-w-0 flex-col items-center gap-2 sm:flex-row sm:gap-3">
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-md border sm:size-11",
                    activeGame === id
                      ? "border-teal-200/60 bg-teal-200 text-slate-950"
                      : "border-white/10 bg-slate-950/60 text-teal-200",
                  )}
                >
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-black leading-tight text-white sm:text-lg">
                    {title}
                  </span>
                  <span className="mt-1 hidden text-sm font-bold uppercase tracking-[0.18em] text-slate-400 sm:block">
                    {labels[selectedPlayMode]}
                  </span>
                </span>
              </span>
            </button>
          ))}
        </section>

        <div className="flex-1">
          {activeGame === "tic-tac-toe" ? (
            <TicTacToeGame
              key={`${selectedPlayMode}-${activeGame}-${activeLobbySession?.code ?? "no-lobby"}-${joinToken}`}
              autoJoinCode={
                selectedPlayMode === "multiplayer"
                  ? activeLobbySession?.code
                  : null
              }
              initialPlayMode={
                selectedPlayMode === "multiplayer"
                  ? "online"
                  : selectedPlayMode === "one-device"
                    ? "duo"
                    : "solo"
              }
              onLobbyLeave={handleLobbyLeave}
              onLobbySessionChange={handleLobbySessionChange}
              playerName={playerName}
              rejoinToken={rejoinToken}
              showLobbyJoinForm={selectedPlayMode !== "multiplayer"}
              showModeControls={false}
            />
          ) : activeGame === "memory" ? (
            <MemoryCardGame
              key={`${selectedPlayMode}-${activeGame}-${activeLobbySession?.code ?? "no-lobby"}-${joinToken}`}
              autoJoinCode={
                selectedPlayMode === "multiplayer"
                  ? activeLobbySession?.code
                  : null
              }
              initialPlayMode={
                selectedPlayMode === "multiplayer" ? "lobby" : "solo"
              }
              onLobbyLeave={handleLobbyLeave}
              onLobbySessionChange={handleLobbySessionChange}
              playerName={playerName}
              rejoinToken={rejoinToken}
              showLobbyJoinForm={selectedPlayMode !== "multiplayer"}
              showModeControls={false}
            />
          ) : (
            <HangmanGame
              key={`${selectedPlayMode}-${activeGame}-${activeLobbySession?.code ?? "no-lobby"}-${joinToken}`}
              autoJoinCode={
                selectedPlayMode === "multiplayer"
                  ? activeLobbySession?.code
                  : null
              }
              initialPlayMode={
                selectedPlayMode === "multiplayer" ? "lobby" : "solo"
              }
              onLobbyLeave={handleLobbyLeave}
              onLobbySessionChange={handleLobbySessionChange}
              playerName={playerName}
              rejoinToken={rejoinToken}
              showLobbyJoinForm={selectedPlayMode !== "multiplayer"}
              showModeControls={false}
            />
          )}
        </div>
      </div>
    </main>
  );
}

function cleanLobbyCode(value: string): string {
  return normalizeLobbyCode(value).slice(0, 6);
}

function rememberArcadeSession(
  game: ArcadeGame,
  code: string,
  playerId: string,
  rejoinToken: string,
) {
  const keyByGame: Record<ArcadeGame, string> = {
    "tic-tac-toe": "mini-arcade-tic-tac-toe-session",
    memory: "mini-arcade-memory-session",
    hangman: "mini-arcade-hangman-session",
  };

  rememberLobbySession(keyByGame[game], { code, playerId, rejoinToken });
}

function isHostPlayer(game: ArcadeGame, playerId: string): boolean {
  if (game === "tic-tac-toe") {
    return playerId === "X";
  }

  return playerId === "player-1";
}
