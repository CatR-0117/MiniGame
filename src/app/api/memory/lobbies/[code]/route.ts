import { NextResponse } from "next/server";
import { getLobbyByCode, leaveLobbyByCode } from "@/lib/memory-lobbies";
import { readJsonObject, readStringField } from "@/lib/api";

export const runtime = "nodejs";

type LobbyRouteContext = {
  params: Promise<{
    code: string;
  }>;
};

export async function GET(_request: Request, context: LobbyRouteContext) {
  const { code } = await context.params;
  const result = await getLobbyByCode(code);

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
  const result = await leaveLobbyByCode(code, playerId, rejoinToken);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message },
      { status: result.status },
    );
  }

  return NextResponse.json(result.data);
}
