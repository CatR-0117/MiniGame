import { NextResponse } from "next/server";
import {
  createApiErrorResponse,
  readJsonObject,
  readStringField,
} from "@/lib/api";
import { createWordScrambleLobbyForPlayer } from "@/lib/word-scramble-lobbies";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    const playerName = readStringField(body, "playerName");
    const rejoinToken = readStringField(body, "rejoinToken");
    const lobby = await createWordScrambleLobbyForPlayer(
      playerName,
      rejoinToken,
    );

    return NextResponse.json(lobby, { status: 201 });
  } catch (error) {
    return createApiErrorResponse(error);
  }
}
