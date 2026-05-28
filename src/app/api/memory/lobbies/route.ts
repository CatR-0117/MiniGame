import { NextResponse } from "next/server";
import { readJsonObject, readStringField } from "@/lib/api";
import { createLobbyForPlayer } from "@/lib/memory-lobbies";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  const playerName = readStringField(body, "playerName");
  const rejoinToken = readStringField(body, "rejoinToken");
  const lobby = await createLobbyForPlayer(playerName, rejoinToken);

  return NextResponse.json(lobby, { status: 201 });
}
