import { NextRequest, NextResponse } from "next/server";
import { delay, products, track } from "../../_service/db";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  track("product");
  await delay();
  const { id } = await params;
  const product = products.find((p) => p.id === id);
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(product);
}

// A "backend-originated" write: the service's own admin surface, not used by
// the app. Exists to demonstrate webhook-driven cache invalidation.
export async function PATCH(request: NextRequest, { params }: Context) {
  track("product");
  await delay();
  const { id } = await params;
  const product = products.find((p) => p.id === id);
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json();
  if (typeof body.price === "number") product.price = body.price;
  return NextResponse.json(product);
}
