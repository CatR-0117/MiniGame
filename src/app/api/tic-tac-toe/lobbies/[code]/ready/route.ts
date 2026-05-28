import { NextResponse } from "next/server";
import { readJsonObject, readStringField } from "@/lib/api";
import { readyTicTacToeLobbyPlayer } from "@/lib/tic-tac-toe-lobbies";

export const runtime = "nodejs";

type LobbyRouteContext = {
  params: Promise<{
    code: string;
  }>;
};

export async function POST(request: Request, context: LobbyRouteContext) {
  const { code } = await context.params;
  const body = await readJsonObject(request);
  const playerId = readStringField(body, "playerId");
  const result = readyTicTacToeLobbyPlayer(code, playerId);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message },
      { status: result.status },
    );
  }

  return NextResponse.json(result.data);
}
