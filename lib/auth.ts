// Data access layer for the session, following the Next.js auth guidance.
import "server-only";
import { trace } from "@opentelemetry/api";
import { cookies } from "next/headers";
import { cache } from "react";
import { getUser } from "#api/client";

// A no-op unless instrumentation.ts registered a provider — custom spans
// cost nothing when tracing is off.
const tracer = trace.getTracer("next-best-practice");

// React.cache: every layout, page, and component that asks "who is signed
// in?" shares one cookie read and one upstream lookup per request. Without
// it, N call sites = N sequential user fetches per request.
//
// Note this cannot live inside a 'use cache' scope (cookies() is per-request)
// — React.cache is the dedup tool for deliberately-uncached reads.
//
// The span makes the dedup observable in traces: one session.lookup per
// request, no matter how many components call this.
export const getCurrentUser = cache(async () =>
  tracer.startActiveSpan("session.lookup", async (span) => {
    try {
      const cookieStore = await cookies();
      const userId = cookieStore.get("session-user")?.value;
      const user = userId ? await getUser(userId) : null;
      span.setAttribute("session.authenticated", user !== null);
      return user;
    } finally {
      span.end();
    }
  }),
);
