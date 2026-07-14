import { NextRequest, NextResponse } from "next/server";
import { delay, track, users } from "../../_service/db";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  track("user");
  await delay();
  const { id } = await params;
  const user = users.find((u) => u.id === id);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(user);
}
