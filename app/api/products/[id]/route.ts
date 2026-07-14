import { NextRequest, NextResponse } from "next/server";
import { delay, products } from "../../_service/db";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  await delay();
  const { id } = await params;
  const product = products.find((p) => p.id === id);
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(product);
}

export async function PATCH(request: NextRequest, { params }: Context) {
  await delay();
  const { id } = await params;
  const product = products.find((p) => p.id === id);
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json();
  if (typeof body.favorite === "boolean") product.favorite = body.favorite;
  return NextResponse.json(product);
}
