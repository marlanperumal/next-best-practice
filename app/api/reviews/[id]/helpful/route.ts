import { NextRequest, NextResponse } from "next/server";
import { delay, reviews, track } from "../../../_service/db";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Context) {
  track("helpful");
  await delay();
  const { id } = await params;
  const review = reviews.find((r) => r.id === id);
  if (!review) return NextResponse.json({ error: "Not found" }, { status: 404 });
  review.helpful += 1;
  return NextResponse.json(review);
}
