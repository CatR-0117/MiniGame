"use client";

import { Clock } from "lucide-react";
import { useEffect, useState } from "react";

export function WaitingLobbyCountdown({
  expiresAt,
}: {
  expiresAt?: number | null;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) {
      return;
    }

    const intervalId = window.setInterval(() => setNow(Date.now()), 1_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [expiresAt]);

  if (!expiresAt) {
    return null;
  }

  const secondsLeft = Math.max(0, Math.ceil((expiresAt - now) / 1_000));

  return (
    <div
      aria-label="Lobby wait countdown"
      className="mt-3 flex items-center justify-between gap-3 rounded-md border border-white/10 bg-slate-950/45 px-3 py-2"
    >
      <span className="flex min-w-0 items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
        <Clock aria-hidden="true" className="size-4 shrink-0 text-teal-200" />
        Waiting
      </span>
      <span className="font-mono text-sm font-black text-teal-100">
        {formatCountdown(secondsLeft)}
      </span>
    </div>
  );
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
