// App-owned webhook (deliberately NOT under /api, which plays the external
// service): lets a backend that writes data out-of-band tell this app to
// drop its cache. See e2e/webhook.spec.ts for the full flow.
import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

const SECRET = process.env.REVALIDATE_SECRET ?? "dev-webhook-secret";

// timingSafeEqual, not ===: string comparison time leaks how much of the
// secret matched.
function secretMatches(candidate: string) {
  const a = Buffer.from(candidate);
  const b = Buffer.from(SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!secretMatches(request.headers.get("x-revalidate-secret") ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { tag } = await request.json();
  if (typeof tag !== "string" || tag.length === 0) {
    return NextResponse.json({ error: "tag required" }, { status: 400 });
  }
  // { expire: 0 } = expire immediately (the webhook semantic). updateTag is
  // Server-Action-only; revalidateTag(tag, "max") would serve stale once
  // more while refreshing in the background.
  revalidateTag(tag, { expire: 0 });
  return NextResponse.json({ revalidated: tag });
}
