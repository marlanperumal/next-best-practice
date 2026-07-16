# legacy-cache: the previous caching model, runnable

The same catalog domain as the main app, built WITHOUT `cacheComponents` —
the model most production apps still run. `cacheComponents` is a global
config, so the two models can't coexist in one app; this workspace app is
the side-by-side comparison.

```bash
pnpm --filter next-best-practice dev   # main app on :3000 (hosts the external service)
pnpm --filter legacy-cache dev         # this app on :3100
```

## Pattern-by-pattern mapping

| Concern                             | Previous model (this app)                                                                                                                                                         | Cache Components (main app)                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Default behavior                    | `fetch` uncached; routes static unless they use dynamic APIs                                                                                                                      | nothing cached; dynamic work must sit under `Suspense` (PPR)                                  |
| Cache an API response               | `fetch(url, { next: { revalidate, tags } })` — [lib/api.ts](lib/api.ts)                                                                                                           | `'use cache'` + `cacheLife()` + `cacheTag()` — main [lib/api/client.ts](../lib/api/client.ts) |
| Cache non-fetch work                | `unstable_cache(fn, keys, { revalidate, tags })` — `getReviewSummary` in [lib/api.ts](lib/api.ts)                                                                                 | `'use cache'` on any async function                                                           |
| Static/dynamic control              | segment configs: `dynamic`, `revalidate` (ISR), `generateStaticParams` — [app/products/page.tsx](app/products/page.tsx), [app/products/[id]/page.tsx](app/products/[id]/page.tsx) | Suspense boundaries decide; segment configs are rejected                                      |
| Route dynamism vs response caching  | independent axes: `force-dynamic` route can serve cached fetches — [app/products/page.tsx](app/products/page.tsx)                                                                 | one axis: cached functions are the static parts                                               |
| Invalidate after own mutation       | `revalidateTag(tag, { expire: 0 })` in the action — [lib/actions.ts](lib/actions.ts)                                                                                              | `updateTag(tag)` (Server Actions only)                                                        |
| Invalidate from outside             | `revalidateTag` in a Route Handler (same as main app's webhook)                                                                                                                   | same — `revalidateTag` works in both models                                                   |
| Read-your-own-writes, uncached data | `router.refresh()` from the client                                                                                                                                                | `refresh()` inside the Server Action                                                          |
| Request-level dedup                 | `React.cache` + built-in fetch memoization                                                                                                                                        | same (unchanged across models)                                                                |

## What deliberately isn't here

No client components, no stores, no URL state — those patterns are identical
in both models and live in the main app. This app isolates exactly the part
that changed: how data gets cached, revalidated, and rendered static.

Note the build works without the external service running: the product list
route is `force-dynamic` (no build-time fetch) and the detail page builds no
paths (ISR fills on demand). That's the previous model's version of the same
property the main app gets from PPR holes.
