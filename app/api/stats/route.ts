import { connection } from "next/server";
import { NextResponse } from "next/server";
import { hits } from "../_service/db";

// Observability for the demo: request counts per endpoint family, so cache
// hits and per-request dedup can be asserted from tests (see e2e/auth.spec.ts).
export async function GET() {
  // Gotcha: a GET route handler that reads nothing from the request is
  // prerendered at build time and would serve a frozen snapshot forever.
  // connection() opts out (route segment `dynamic = "force-dynamic"` is not
  // allowed alongside cacheComponents).
  await connection();
  return NextResponse.json(hits);
}
