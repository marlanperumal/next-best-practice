// Data access layer for the session, following the Next.js auth guidance.
import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { getUser } from "#api/client";

// React.cache: every layout, page, and component that asks "who is signed
// in?" shares one cookie read and one upstream lookup per request. Without
// it, N call sites = N sequential user fetches per request.
//
// Note this cannot live inside a 'use cache' scope (cookies() is per-request)
// — React.cache is the dedup tool for deliberately-uncached reads.
export const getCurrentUser = cache(async () => {
  const cookieStore = await cookies();
  const userId = cookieStore.get("session-user")?.value;
  if (!userId) return null;
  return getUser(userId);
});
