"use client";

import { useState } from "react";
import { Grid3X3, Layers } from "lucide-react";
import { MemoryCardGame } from "@/components/memory-card-game";
import { TicTacToeGame } from "@/components/tic-tac-toe-game";

type ArcadeGame = "tic-tac-toe" | "memory";

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
];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function Home() {
  const [selectedGame, setSelectedGame] = useState<ArcadeGame>("tic-tac-toe");

  return (
    <main className="min-h-screen overflow-hidden bg-[linear-gradient(135deg,#07111f_0%,#10211d_48%,#1b1024_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-teal-200/80">
              Mini Arcade
            </p>
            <h1 className="mt-2 text-3xl font-black text-white sm:text-5xl">
              Choose a Game
            </h1>
          </div>
        </header>

        <section aria-label="Choose a game" className="grid gap-3 sm:grid-cols-2">
          {GAME_OPTIONS.map(({ id, title, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={selectedGame === id}
              onClick={() => setSelectedGame(id)}
              className={cn(
                "flex min-h-20 items-center justify-between gap-4 rounded-lg border p-4 text-left transition",
                selectedGame === id
                  ? "border-teal-200 bg-teal-200/15 shadow-lg shadow-teal-950/30"
                  : "border-white/10 bg-white/[0.06] hover:border-white/25 hover:bg-white/[0.09]",
              )}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-md border",
                    selectedGame === id
                      ? "border-teal-200/60 bg-teal-200 text-slate-950"
                      : "border-white/10 bg-slate-950/60 text-teal-200",
                  )}
                >
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-lg font-black text-white">
                    {title}
                  </span>
                  <span className="mt-1 block text-sm font-bold uppercase tracking-[0.18em] text-slate-400">
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
          ) : (
            <MemoryCardGame />
          )}
        </div>
      </div>
    </main>
  );
}
