import { NextResponse } from "next/server";
import { readJsonObject, readNumberField, readStringField } from "@/lib/api";
import { submitWordSearchLobbySelection } from "@/lib/word-search-lobbies";

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
  const result = await submitWordSearchLobbySelection(
    code,
    playerId,
    {
      row: readNumberField(body, "startRow"),
      col: readNumberField(body, "startCol"),
    },
    {
      row: readNumberField(body, "endRow"),
      col: readNumberField(body, "endCol"),
    },
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message },
      { status: result.status },
    );
  }

  return NextResponse.json(result.data);
}
