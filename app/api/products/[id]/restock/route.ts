import { NextRequest, NextResponse } from "next/server";
import { delay, getRestock, startRestock, track } from "../../../_service/db";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  track("restock");
  await delay();
  const { id } = await params;
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId)
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  return NextResponse.json(getRestock(userId, id));
}

export async function POST(request: NextRequest, { params }: Context) {
  track("restock");
  await delay();
  const { id } = await params;
  const body = (await request.json()) as { userId?: string };
  if (!body.userId)
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  return NextResponse.json(startRestock(body.userId, id), { status: 201 });
}
