import { NextResponse } from "next/server";
import { getHangmanLobbyByCode } from "@/lib/hangman-lobbies";

export const runtime = "nodejs";

type LobbyRouteContext = {
  params: Promise<{
    code: string;
  }>;
};

export async function GET(request: Request, context: LobbyRouteContext) {
  const { code } = await context.params;
  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get("playerId") ?? "";
  const result = getHangmanLobbyByCode(code, playerId);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message },
      { status: result.status },
    );
  }

  return NextResponse.json(result.data);
}
