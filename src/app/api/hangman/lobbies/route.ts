import { NextResponse } from "next/server";
import { readJsonObject, readStringField } from "@/lib/api";
import { createHangmanLobbyForPlayer } from "@/lib/hangman-lobbies";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  const playerName = readStringField(body, "playerName");
  const lobby = createHangmanLobbyForPlayer(playerName);

  return NextResponse.json(lobby, { status: 201 });
}
