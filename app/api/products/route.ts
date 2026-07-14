import { NextRequest, NextResponse } from "next/server";
import { delay, products, track } from "../_service/db";

export async function GET(request: NextRequest) {
  track("products");
  await delay();
  const params = request.nextUrl.searchParams;
  const category = params.get("category");
  const q = params.get("q")?.toLowerCase();
  const page = Math.max(1, Number(params.get("page") ?? 1));
  const pageSize = Math.max(1, Number(params.get("pageSize") ?? 5));

  let items = products;
  if (category) items = items.filter((p) => p.category === category);
  if (q) items = items.filter((p) => p.name.toLowerCase().includes(q));

  const total = items.length;
  items = items.slice((page - 1) * pageSize, page * pageSize);

  return NextResponse.json({ items, total, page, pageSize });
}
