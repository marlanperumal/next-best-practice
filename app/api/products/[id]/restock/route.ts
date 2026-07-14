import { NextRequest, NextResponse } from "next/server";
import { delay, restocks, startRestock, track } from "../../../_service/db";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  track("restock");
  await delay();
  const { id } = await params;
  return NextResponse.json(restocks[id] ?? null);
}

export async function POST(_request: NextRequest, { params }: Context) {
  track("restock");
  await delay();
  const { id } = await params;
  return NextResponse.json(startRestock(id), { status: 201 });
}
