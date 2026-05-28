import { NextResponse } from "next/server";
import { readJsonObject, readStringField } from "@/lib/api";
import { joinArcadeLobbyByCode } from "@/lib/arcade-lobbies";

export const runtime = "nodejs";

type LobbyRouteContext = {
  params: Promise<{
    code: string;
  }>;
};

export async function POST(request: Request, context: LobbyRouteContext) {
  const { code } = await context.params;
  const body = await readJsonObject(request);
  const playerName = readStringField(body, "playerName");
  const rejoinToken = readStringField(body, "rejoinToken");
  const result = joinArcadeLobbyByCode(code, playerName, rejoinToken);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message },
      { status: result.status },
    );
  }

  return NextResponse.json(result.data);
}
