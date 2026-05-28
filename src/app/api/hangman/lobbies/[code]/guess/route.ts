import { NextResponse } from "next/server";
import { readJsonObject, readStringField } from "@/lib/api";
import { guessHangmanLobbyLetter } from "@/lib/hangman-lobbies";

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
  const letter = readStringField(body, "letter");
  const result = await guessHangmanLobbyLetter(code, playerId, letter);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message },
      { status: result.status },
    );
  }

  return NextResponse.json(result.data);
}
