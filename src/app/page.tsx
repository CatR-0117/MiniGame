"use client";

import { useState } from "react";
import { Grid3X3, Keyboard, Layers } from "lucide-react";
import { HangmanGame } from "@/components/hangman-game";
import { MemoryCardGame } from "@/components/memory-card-game";
import { TicTacToeGame } from "@/components/tic-tac-toe-game";

type ArcadeGame = "tic-tac-toe" | "memory" | "hangman";

const GAME_OPTIONS: Array<{
  id: ArcadeGame;
  title: string;
  label: string;
  icon: typeof Grid3X3;
}> = [
  {
    id: "tic-tac-toe",
    title: "Tic-Tac-Toe",
    label: "Solo / Local",
    icon: Grid3X3,
  },
  {
    id: "memory",
    title: "Memory Cards",
    label: "Lobby Code",
    icon: Layers,
  },
  {
    id: "hangman",
    title: "Hangman",
    label: "Word Game",
    icon: Keyboard,
  },
];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function Home() {
  const [selectedGame, setSelectedGame] = useState<ArcadeGame>("tic-tac-toe");

  return (
    <main className="min-h-dvh overflow-x-hidden bg-[linear-gradient(135deg,#07111f_0%,#10211d_48%,#1b1024_100%)] text-slate-100">
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-4 px-3 py-4 pb-8 sm:gap-5 sm:px-6 sm:py-5 lg:px-8">
        <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-teal-200/80 sm:tracking-[0.28em]">
              Mini Arcade
            </p>
            <h1 className="mt-1 text-2xl font-black text-white sm:mt-2 sm:text-5xl">
              Choose a Game
            </h1>
          </div>
        </header>

        <section
          aria-label="Choose a game"
          className="grid grid-cols-3 gap-2 sm:gap-3"
        >
          {GAME_OPTIONS.map(({ id, title, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={selectedGame === id}
              onClick={() => setSelectedGame(id)}
              className={cn(
                "flex min-h-20 min-w-0 flex-col items-center justify-center gap-2 rounded-lg border p-2 text-center transition sm:min-h-20 sm:flex-row sm:justify-between sm:gap-4 sm:p-4 sm:text-left",
                selectedGame === id
                  ? "border-teal-200 bg-teal-200/15 shadow-lg shadow-teal-950/30"
                  : "border-white/10 bg-white/[0.06] hover:border-white/25 hover:bg-white/[0.09]",
              )}
            >
              <span className="flex min-w-0 flex-col items-center gap-2 sm:flex-row sm:gap-3">
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-md border sm:size-11",
                    selectedGame === id
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
                    {label}
                  </span>
                </span>
              </span>
            </button>
          ))}
        </section>

        <div className="flex-1">
          {selectedGame === "tic-tac-toe" ? (
            <TicTacToeGame />
          ) : selectedGame === "memory" ? (
            <MemoryCardGame />
          ) : (
            <HangmanGame />
          )}
        </div>
      </div>
    </main>
  );
}
