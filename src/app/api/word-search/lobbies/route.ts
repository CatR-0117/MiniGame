import { NextResponse } from "next/server";
import {
  createApiErrorResponse,
  readJsonObject,
  readStringField,
} from "@/lib/api";
import { createWordSearchLobbyForPlayer } from "@/lib/word-search-lobbies";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    const playerName = readStringField(body, "playerName");
    const rejoinToken = readStringField(body, "rejoinToken");
    const lobby = await createWordSearchLobbyForPlayer(
      playerName,
      rejoinToken,
    );

    return NextResponse.json(lobby, { status: 201 });
  } catch (error) {
    return createApiErrorResponse(error);
  }
}
