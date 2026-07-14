import { NextResponse } from "next/server";
import { delay, products } from "../_service/db";

export async function GET() {
  await delay();
  return NextResponse.json(products.filter((p) => p.favorite).map((p) => p.id));
}
