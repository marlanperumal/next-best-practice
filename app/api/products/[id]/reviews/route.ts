import { NextRequest, NextResponse } from "next/server";
import { delay, nextReviewId, reviews, track } from "../../../_service/db";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  track("reviews");
  await delay();
  const { id } = await params;
  return NextResponse.json(reviews.filter((r) => r.productId === id));
}

export async function POST(request: NextRequest, { params }: Context) {
  track("reviews");
  await delay();
  const { id } = await params;
  const body = (await request.json()) as {
    author: string;
    rating: number;
    body: string;
  };
  const review = {
    id: nextReviewId(),
    productId: id,
    author: body.author,
    rating: body.rating,
    body: body.body,
    helpful: 0,
  };
  reviews.push(review);
  return NextResponse.json(review, { status: 201 });
}
