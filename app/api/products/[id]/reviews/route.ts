import { NextRequest, NextResponse } from "next/server";
import { delay, reviews } from "../../../_service/db";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  await delay();
  const { id } = await params;
  return NextResponse.json(reviews.filter((r) => r.productId === id));
}
