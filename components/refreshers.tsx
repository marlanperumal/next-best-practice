"use client";

// router.refresh() patterns for the fully-dynamic (uncached) data regime.
// Both wrap the refresh in a transition so it streams in behind the current
// UI instead of clobbering pending or optimistic state. Note refresh()
// re-renders server components but does NOT expire 'use cache' data — cached
// reads stay cached; uncached reads re-run.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

// Rendered by the server ONLY while a job is pending, so polling starts and
// stops with the server-rendered state. The cap stops a stuck job from
// polling forever.
export function PendingAutoRefresher({
  intervalMs = 2000,
  maxAttempts = 15,
}: {
  intervalMs?: number;
  maxAttempts?: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const attempts = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      if (attempts.current >= maxAttempts) {
        clearInterval(id);
        return;
      }
      attempts.current += 1;
      startTransition(() => router.refresh());
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, maxAttempts, router]);

  return null;
}

// Re-render server data when the user returns to the tab, so uncached
// per-user state (favorites changed elsewhere, job completions) catches up.
export function VisibilityRefetcher() {
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        startTransition(() => router.refresh());
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [router]);

  return null;
}
