import { NextResponse } from "next/server";
import { getLobbyByCode } from "@/lib/memory-lobbies";

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
