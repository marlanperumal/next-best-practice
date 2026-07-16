import { NextRequest, NextResponse } from "next/server";
import { delay, favoriteIds, track, users } from "../../../_service/db";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  track("favorites");
  await delay();
  const { id } = await params;
  if (!users.some((u) => u.id === id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(favoriteIds[id] ?? []);
}

export async function POST(request: NextRequest, { params }: Context) {
  track("favorites");
  await delay();
  const { id } = await params;
  if (!users.some((u) => u.id === id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = await request.json();
  const { productId, favorite } = body as {
    productId: string;
    favorite: boolean;
  };
  const current = favoriteIds[id] ?? [];
  favoriteIds[id] = favorite
    ? [...new Set([...current, productId])]
    : current.filter((p) => p !== productId);
  return NextResponse.json({ productId, favorite });
}
