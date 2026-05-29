import { NextResponse } from "next/server";
import {
  getWordScrambleLobbyByCode,
  leaveWordScrambleLobbyByCode,
} from "@/lib/word-scramble-lobbies";
import { readJsonObject, readStringField } from "@/lib/api";

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
  const result = await getWordScrambleLobbyByCode(code, playerId);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message },
      { status: result.status },
    );
  }

  return NextResponse.json(result.data);
}

export async function DELETE(request: Request, context: LobbyRouteContext) {
  const { code } = await context.params;
  const body = await readJsonObject(request);
  const playerId = readStringField(body, "playerId");
  const rejoinToken = readStringField(body, "rejoinToken");
  const result = await leaveWordScrambleLobbyByCode(
    code,
    playerId,
    rejoinToken,
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message },
      { status: result.status },
    );
  }

  return NextResponse.json(result.data);
}
