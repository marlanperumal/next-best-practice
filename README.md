# Next Best Practice

The team reference for Next.js App Router patterns: server/client
components, caching, per-user data, URL state (nuqs), cross-component state
(zustand), optimistic mutations, and integration testing. Every pattern
links to runnable code, states the anti-pattern it replaces, and is covered
by a test. When two approaches exist, the sections say which one is the
default and when the other applies.

Stack: Next.js 16 (Cache Components enabled), React 19, zustand 5, nuqs 2,
zod, Vitest + Testing Library + MSW, Playwright. A second workspace app,
[legacy-cache/](legacy-cache/), runs the pre-16 caching model side by side.

## Decision table

| You need | Reach for | Where |
| --- | --- | --- |
| Cache data everyone sees | `'use cache'` + `cacheLife` + `cacheTag` | §4 |
| Per-user / session reads | uncached fetch + `React.cache` DAL | §3 |
| Invalidate after your own mutation | `updateTag` in the Server Action | §4 |
| React to a backend's out-of-band write | webhook → `revalidateTag(tag, { expire: 0 })` | §13 |
| Read-your-own-writes for uncached data | `refresh()` in the action | §14 |
| Shareable UI state (filters, tabs, page) | nuqs — the URL is the store | §6 |
| Cross-page client state that survives navigation | per-request zustand store in a layout | §7–8 |
| Client-only state | module-level zustand (+ `persist`) | §7 |
| Single-surface optimistic flip | `useOptimistic` | §8 |
| Form mutation with validation | `useActionState` + zod in the action | §9 |
| Deploying more than one instance | shared cache handler | §12 |
| Working in the pre-16 caching model | the legacy-cache app | [legacy-cache/README](legacy-cache/README.md) |

## Running it

```bash
pnpm install
pnpm dev        # app + simulated external API on :3000
pnpm test       # Vitest (unit + seam projects)
pnpm e2e        # Playwright: one production instance on :3001 (fast default)
pnpm e2e:multi  # the two-instance shared-cache proof on :3002/:3003
pnpm e2e:all    # both suites (CI)
pnpm build && pnpm start

pnpm --filter legacy-cache dev   # the previous-model app on :3100
```

The "external service" is simulated by route handlers under
[app/api/](app/api/) backed by in-memory data
([app/api/_service/db.ts](app/api/_service/db.ts)) with artificial latency
(400ms default so streaming is visible; tests set `SERVICE_LATENCY_MS=50`). The app only talks to it over HTTP via `EXTERNAL_API_URL`
(default `http://localhost:3000/api`), so it behaves exactly like a third
party: it has real latency, real mutations, and is mockable at the network
boundary. `/api/stats` exposes request counts per endpoint family, so cache
hits and request dedup are observable from outside. **Real-world caveat:**
when you own the data, server components should call the data source directly
— fetching your own route handlers from a server component adds a pointless
HTTP hop. The hop here exists only to simulate an external service.

There is a demo session: sign in as Alice or Bob from the nav. The session is
an httpOnly cookie; favorites are per-user on the external service.

## Architecture

```
app/
  layout.tsx              root layout: NuqsAdapter, nav, user menu (Suspense hole)
  page.tsx                home page (static shell, dynamic user chip)
  products/
    layout.tsx            per-user favorites fetch, hosts the zustand provider
    page.tsx              list: filtering + pagination + redirect guard
    [id]/page.tsx         detail: parallel streamed sections, URL tabs, reviews
    error.tsx             segment error boundary
  not-found.tsx           branded 404 / notFound() target
  global-error.tsx        last-resort boundary (root layout errors)
  api/                    the simulated external service (+ /api/stats)
  webhooks/revalidate/    app-owned endpoint for backend-driven invalidation
cache-handlers/
  file-handler.cjs        shared 'use cache' handler (multi-instance tags)
legacy-cache/             workspace app: the pre-16 caching model (own README)
lib/
  auth.ts                 session DAL: cookies() + React.cache
  api/client.ts           server-only data layer ('use cache' + tags)
  api/schemas.ts          zod schemas = the API contract
  actions.ts              Server Actions (auth checks, validation, invalidation)
  search-params.ts        nuqs parsers + loader + serializer, shared everywhere
stores/
  favorites-store.ts      server-hydrated store factory (per request)
  favorites-store-provider.tsx
  recently-viewed-store.ts  client-only global store (persisted)
components/               client leaf components + server user-menu
tests/                    Vitest + RTL + MSW integration tests
e2e/                      Playwright tests (full flows, async RSCs)
```

## The practices

### 1. Server components by default, client components at the leaves

Pages and layouts are server components; `"use client"` appears only on small
interactive leaves ([components/favorite-button.tsx](components/favorite-button.tsx),
[components/product-filters.tsx](components/product-filters.tsx)). Server
components pass data *down* to client components as props; client components
never fetch entity data themselves.

[lib/api/client.ts](lib/api/client.ts) and [lib/auth.ts](lib/auth.ts) import
`server-only`, which turns any accidental client-side import into a build
error rather than a leaked API base URL or a runtime surprise.

**Anti-patterns avoided:** marking whole pages `"use client"` because one
button needs interactivity; fetching list data in a `useEffect`.

### 2. Layout placement decides state lifetime

[app/products/layout.tsx](app/products/layout.tsx) hosts the
`FavoritesStoreProvider`. Layouts do **not** re-render on navigation between
their children, so the same store instance backs both the list and detail
pages — this is what makes cross-page optimistic state work. Putting the
provider in each page would create a fresh store per navigation and lose
in-flight state.

The root layout ([app/layout.tsx](app/layout.tsx)) holds only truly global
concerns: the `NuqsAdapter`, nav, and the user menu — the latter isolated in
`Suspense` so its per-request cookie read doesn't drag the whole shell
dynamic (see §6).

### 3. Per-user data: a session DAL, deduped with React.cache

[lib/auth.ts](lib/auth.ts) is the data access layer for the session: it reads
the cookie, looks the user up on the external service, and is wrapped in
**`React.cache`** so every caller in a request — the nav user menu, the
favorites layout, `ProductList` — shares **one** cookie read and one upstream
lookup. The e2e test in [e2e/auth.spec.ts](e2e/auth.spec.ts) proves it via
`/api/stats`: one page load with three call sites produces one user request.

Two dedup tools, two jobs:

- `'use cache'` — *shared across requests and users*; for data that is the
  same for everyone (products, reviews). Dedup across a request comes free.
- `React.cache` — *scoped to one request*; the only dedup tool for data that
  must stay uncached (sessions, per-user reads). Without it, N call sites =
  N upstream requests, silently, on every page.

Session facts worth copying: the cookie is httpOnly; sign-in/out are Server
Actions ([lib/actions.ts](lib/actions.ts)) so the cookie is set server-side;
`setFavorite` re-checks the session **inside the action** — actions are
public HTTP endpoints, so the UI hiding a button is not authorization.
Server components decide visibility (`{user && <FavoriteButton …>}`), which
is rendering logic, not security.

**Anti-patterns avoided:** caching per-user data in the shared cache (one
user's state leaking into another's response); auth checks only in the UI;
re-fetching the session in every component that needs it.

### 4. Caching: `use cache` + tags, uncached by default

With Cache Components enabled ([next.config.ts](next.config.ts)), nothing is
cached unless you say so — `fetch` is uncached by default in Next 15+.

- Shared, cacheable data opts in: `getProducts` / `getProduct` / `getReviews`
  in [lib/api/client.ts](lib/api/client.ts) use `'use cache'` +
  `cacheLife("minutes")` + `cacheTag(...)`. The cache key includes the
  function arguments, so each filter/page combination is cached separately.
- Per-user data (`getUser`, `getFavoriteIds`) stays uncached deliberately.
- Mutations of *cached* data invalidate by tag: `addReview` and
  `markReviewHelpful` call `updateTag("reviews:<id>")`. `updateTag` (vs
  `revalidateTag`) expires *and refreshes within the same request*, giving
  read-your-own-writes — the action's response already contains the new
  review; no client refetch code exists ([e2e/reviews.spec.ts](e2e/reviews.spec.ts)).
- Mutations of *uncached* data invalidate nothing: `setFavorite` ends at the
  external write, because there is no cache entry to expire. Knowing when
  **not** to invalidate is part of the model.
- `getProduct` is called by both `generateMetadata` and the page in
  [app/products/[id]/page.tsx](app/products/[id]/page.tsx); the cache dedupes
  this into one upstream request.

**Anti-patterns avoided:** `export const dynamic = "force-dynamic"` as a
cache-busting hammer (it's rejected outright under `cacheComponents`);
`router.refresh()` from the client after a mutation when tags can do it in
one round trip; caching per-user data.

Three extensions of this model live in their own sections: multi-instance
cache sharing (§12), backend-originated invalidation via webhook (§13), and
the fully-dynamic regime where `refresh()`/`router.refresh()` *is* the right
tool (§14).

**The previous model, runnable:** `cacheComponents` is a global config, so
the pre-16 model (per-fetch `next: { revalidate, tags }`, `unstable_cache`,
segment configs, ISR) can't coexist in this app. It lives as a second
workspace app instead — [legacy-cache/](legacy-cache/) — same domain, same
external service, with a pattern-by-pattern mapping table in
[legacy-cache/README.md](legacy-cache/README.md). Read them together to
translate between the model most production apps run today and the one this
reference is built on.

### 5. Streaming with Suspense and Partial Prerendering

`pnpm build` shows every page as ◐ partial prerender: static shell served
instantly, dynamic holes streamed.

- [app/products/page.tsx](app/products/page.tsx): the page component stays
  *synchronous*; only the nested async `ProductList` awaits `searchParams`
  and data. Awaiting `searchParams` at the top of the page would pull the
  whole page — filters included — out of the static shell.
- [app/products/[id]/page.tsx](app/products/[id]/page.tsx): `ProductInfo` and
  `TabPanel` are sibling async components under separate `Suspense`
  boundaries, so the product and the tab content are fetched in parallel and
  stream independently. The reviews list inside `TabPanel` is the nested
  sub-resource fetch. Inside one component, independent reads use
  `Promise.all` (`getProduct` + `getCurrentUser` in `ProductInfo`).
- One per-request read in a shared layout would make **every** page fully
  dynamic; wrapping `UserMenu` in `Suspense` confines the damage to a hole
  ([app/layout.tsx](app/layout.tsx)).

**Anti-pattern avoided:** sequential await waterfalls — awaiting the product,
then the user, then the reviews, in one flat sequence.

**Gotcha worth knowing:** with streaming/PPR, a missing product renders the
not-found UI but the HTTP status is 200, because the static shell (and its
status line) is already sent before `notFound()` throws inside a hole. If
crawler-correct 404 status codes matter for a route, that route must block on
the entity fetch instead of streaming it.

### 6. URL is the state for filters, pagination, and tabs

Anything you'd want in a shareable/bookmarkable/back-button-friendly link
lives in the URL, managed by nuqs — not in `useState`, not in a store.

- One definition, all sides: [lib/search-params.ts](lib/search-params.ts)
  declares the parsers once; client components use them via `useQueryStates`,
  server components via `createLoader`, and server-side URL *building* goes
  through `createSerializer`.
- `shallow: false` re-runs the server components that read the params; the
  update is wrapped in `useTransition` and surfaced as a pending indicator
  ([components/product-filters.tsx](components/product-filters.tsx)).
- Search input updates are debounced (`limitUrlUpdates: debounce(300)`), and
  **changing a filter resets `page`** — the classic stale-pagination bug.
- **Out-of-range pages redirect** instead of rendering an empty page: if a
  deep link or a shrunk result set leaves `page` past the end, `ProductList`
  redirects to the last valid page using the shared serializer
  ([app/products/page.tsx](app/products/page.tsx), proven in
  [e2e/products.spec.ts](e2e/products.spec.ts)).
- History semantics are per-control: pagination uses `history: "push"` so the
  back button steps through pages ([components/pagination.tsx](components/pagination.tsx));
  filters and tabs keep the default `replace` so typing doesn't spam history.
  (Caught by the e2e back-button test — nuqs defaults to `replace`.)
- Tabs ([components/product-tabs.tsx](components/product-tabs.tsx)) are just a
  URL param; the *server* decides what the active panel renders in `TabPanel`.
  Deep links and reloads land on the right tab for free.

**Anti-patterns avoided:** tab/filter state in `useState` (lost on reload, not
shareable); duplicating URL parsing or URL building logic by hand on either
side.

### 7. Two zustand stores, two lifetimes — and why they differ

**Server-originated ([stores/favorites-store.ts](stores/favorites-store.ts)):**
follows the zustand Next.js guide. The store is a *factory* (`createStore`
from `zustand/vanilla`), instantiated once per provider mount inside
`useState(() => ...)` ([stores/favorites-store-provider.tsx](stores/favorites-store-provider.tsx)),
and accessed through context. A module-level store here would be shared by
**all requests on the server** — one user's favorites leaking into another's
SSR output. The provider receives its initial state from a server component
([app/products/layout.tsx](app/products/layout.tsx)), so the SSR HTML and the
client's first render agree — no hydration mismatch, no flash.

Because the store initializes **once per provider instance**, new server
props alone won't reach it — so the provider reconciles explicitly: on every
server re-render it calls `mergeServer` with the fresh snapshot
([stores/favorites-store-provider.tsx](stores/favorites-store-provider.tsx)).
The server wins for settled ids; in-flight optimistic values win until their
mutation resolves. That's what lets a favorite added "on another device"
appear on the next `refresh()`/revalidation without ever clobbering a
pending toggle (both proven: [tests/favorites.test.tsx](tests/favorites.test.tsx),
[e2e/favorites.spec.ts](e2e/favorites.spec.ts)). One honest caveat lives in
the code comment: a snapshot that started rendering just before a mutation
settled can briefly revert it until the next refresh — real apps close that
gap with per-entity versions from the server.

When the *identity* behind the state changes (sign-in/out, user switch),
merging isn't enough — the layout remounts the provider with
`key={user?.id}`, React's idiomatic "reset client state below this point"
([e2e/auth.spec.ts](e2e/auth.spec.ts) proves Alice's favorites vanish when
Bob signs in).

**Client-originated ([stores/recently-viewed-store.ts](stores/recently-viewed-store.ts)):**
recently-viewed products never exist on the server, so a module-level global
store is fine — the server never reads it. It uses `persist` with
`skipHydration: true`: localStorage is only read in an effect after mount
([components/recently-viewed.tsx](components/recently-viewed.tsx)), because
reading it during the first render would make client HTML differ from server
HTML (the hydration-mismatch gotcha). Hydration completion is tracked *in the
store* via `onRehydrateStorage`. Known tradeoff: localStorage is per-browser,
not per-user — state that must follow the user belongs on the server.

### 8. Optimistic UI: a decision rule, demonstrated three ways

All three mutations are optimistic or near-optimistic, but they use different
tools — deliberately. The rule:

| State is… | Tool | Demo |
|---|---|---|
| Shared across pages, must survive navigation | store-owned mutation | favorites |
| Single surface, dies with the component | `useOptimistic` | review "helpful" |
| Needs the server's answer anyway (new ID) | form action + `updateTag` | add review |

**Store-owned ([stores/favorites-store.ts](stores/favorites-store.ts)):** the
store flips state optimistically, calls the Server Action, and reconciles or
reverts. Because the promise belongs to the store (whose lifetime is the
layout's, not the button's), unmounting the button — navigating away
mid-request — cannot orphan or cancel it
([e2e/favorites.spec.ts](e2e/favorites.spec.ts)). A per-id version counter
guards rapid-toggle races; failures revert
([tests/favorites.test.tsx](tests/favorites.test.tsx)).

**`useOptimistic` ([components/helpful-button.tsx](components/helpful-button.tsx)):**
the canonical value is the server-rendered prop; the bump shows during the
transition; the action's `updateTag` refresh delivers the new canonical
value. Failure auto-reverts and the thrown error surfaces at the segment
error boundary — never a silent `console.error`
([tests/reviews.test.tsx](tests/reviews.test.tsx)). Far less machinery than
the store — which is exactly why it's the right tool *only* when nothing else
needs the state. Maintaining both patterns for the same entity is how two
surfaces drift apart mid-flight.

**Confirm-then-render ([components/add-review-form.tsx](components/add-review-form.tsx)):**
adding a review needs the server-assigned entity anyway, so the form waits
for the action and lets the `updateTag` refresh render the new review — no
temp-ID bookkeeping, no revert path to write.

**Anti-patterns avoided:** component-local `useState` for shared status (list
and detail drift apart, state dies on unmount); two competing optimistic
systems for one entity; optimistic updates with no revert path; swallowing
mutation failures.

### 9. Form mutations via `useActionState`

[components/add-review-form.tsx](components/add-review-form.tsx) +
[lib/actions.ts](lib/actions.ts): the form posts to a Server Action;
`useActionState` supplies the pending flag and the action's returned state.
The action validates with zod and returns **field errors as state** — and
echoes the submitted values back, because React 19 auto-resets uncontrolled
forms after actions; the `defaultValue={state.values?.…}` wiring is what
keeps the user's input on a failed submit
([tests/reviews.test.tsx](tests/reviews.test.tsx)). Since it's a real
`<form action>`, it degrades gracefully before hydration. Validation lives in
the action (public endpoint), not just in the UI.

### 10. Testing: integration-first, mock only at real boundaries

**Vitest + Testing Library + MSW** ([tests/](tests/)): components are rendered
with their *real* store, *real* provider, and the *real* server-action module;
only two kinds of things are replaced:

- The network — MSW intercepts the actual HTTP requests
  ([tests/mocks/server.ts](tests/mocks/server.ts)), with
  `onUnhandledRequest: "error"` so no request silently escapes.
- Framework-runtime modules that don't exist outside Next — `server-only`,
  `next/cache`, and `next/headers` (the request cookie store) — are aliased
  to tiny stubs in [vitest.config.mts](vitest.config.mts). A framework
  boundary, not app logic.

So [tests/favorites.test.tsx](tests/favorites.test.tsx) exercises the full
click → optimistic flip → auth check → HTTP POST → reconcile/revert pipeline,
including the failure-revert and rapid-toggle race. URL-state components are
tested against nuqs's official testing adapter, asserting on **emitted URL
updates**, not implementation details
([tests/url-state.test.tsx](tests/url-state.test.tsx)).

**Playwright** ([e2e/](e2e/)) covers what Vitest can't: async server
components (the Next docs explicitly recommend e2e for these), streaming,
caching and `updateTag` refresh semantics, `React.cache` dedup (via
`/api/stats` deltas), and multi-page flows. Two suites: `pnpm e2e` runs one
production instance ([playwright.config.ts](playwright.config.ts)) — the
fast default — and `pnpm e2e:multi` boots the two-instance shared-cache
pair ([playwright.multi.config.ts](playwright.multi.config.ts)); CI runs
`e2e:all`. Each config owns dedicated ports so neither a dev server on
:3000 nor the other suite's servers can be silently reused. Tests run
serially (`workers: 1`) because they share the external service's state,
and each test restores the state it mutates.

**Anti-patterns avoided:** mocking zustand/nuqs/fetch-wrappers module-by-module
(tests that pass while the integration is broken); unit-testing async RSCs in
jsdom; asserting on store internals instead of rendered output; e2e against a
dev server.

(When the upstream boundary *isn't* interceptable HTTP, the seam moves inward
— see §16 for the module-seam alternative.)

### 11. Assorted gotchas demonstrated

- **`params`/`searchParams` are Promises** in Next 16 — always awaited, typed
  with the generated `PageProps`/`LayoutProps` helpers (no hand-written prop
  types to drift).
- **Route handlers can be statically prerendered:** a GET handler that reads
  nothing from the request is evaluated at build time and serves a frozen
  response forever. Under `cacheComponents`, `dynamic = "force-dynamic"` is
  *rejected*; the fix is `await connection()`
  ([app/api/stats/route.ts](app/api/stats/route.ts)).
- **Error boundaries per segment:** [app/products/error.tsx](app/products/error.tsx)
  keeps a data-layer failure from blanking the whole app and offers a retry —
  and is where thrown Server Action errors from transitions land.
- **Pending feedback everywhere:** every async control exposes state
  (`useTransition` + `aria-busy` / `role="status"`), which also gives tests
  a deterministic thing to wait on instead of sleeps.
- **`notFound()`** for missing entities rather than rendering an empty page —
  with the PPR status-code caveat from §5.
- **Empty states** are rendered explicitly (`No products found.`,
  `No reviews yet.`) rather than leaving a blank region.

### 12. Scaling `use cache` beyond one instance: a custom cache handler

The built-in cache handler is an in-memory LRU — correct for one server, but
on a multi-instance deployment (serverless, Cloud Run, k8s replicas) each
instance has its own cache, and `updateTag` on instance A **never reaches
instance B**: B serves stale data until its `cacheLife` expires. This is the
usual justification for abandoning Next's cache for a bespoke external cache.

The alternative: keep `use cache`/tags as the programming model and swap the
storage via the stable `cacheHandlers` config
([next.config.ts](next.config.ts)).
[cache-handlers/file-handler.cjs](cache-handlers/file-handler.cjs) implements
the `CacheHandler` interface backed by a shared directory — a stand-in for
Redis with the same coordination contract:

- `updateTags` — the invalidating instance records `{tag → now}` in shared
  storage;
- `refreshTags` — called before every request, each instance syncs tag state;
- `getExpiration` / `get` — entries older than a tag's invalidation timestamp
  are misses.

[e2e/multi-instance.spec.ts](e2e/multi-instance.spec.ts) proves both halves
end to end against **two separate `next start` processes**: tag propagation
(warm instance B's cache, mutate through instance A via `updateTag`, reload
B — B re-fetches; with the default handler B would serve its stale entry)
and entry sharing (a page warmed on A is a cache hit on B — zero upstream
requests, measured via the service's hit counters; cache keys are derived
from the build ID, which both instances share).

Handler-authoring rules that came straight from the docs and from building
it: `get` errors must read as misses, never render errors; `get` must await
an in-flight `set` for the same key; `set` receives a possibly-still-
streaming entry — await it before storing; write-then-rename so concurrent
readers never see partial files.

The handler models both invalidation flavors, because a real Redis handler
must: `updateTag` / `revalidateTag(tag, { expire: 0 })` arrive with no SWR
window and hard-expire matching entries, while `revalidateTag(tag, "max")`
opens a stale-while-revalidate window in which `get` serves the old entry
with `revalidate: -1` — the "serve stale, re-run in the background" signal.
Unit-tested in [tests/cache-handler.test.ts](tests/cache-handler.test.ts);
that file is the spec a Redis port has to pass.

**Gotcha earned the hard way:** Next stamps cache entries from a
performance-based clock that drifts from the system clock over process
lifetime (dramatic under WSL2 — ~900ms/minute). Comparing those stamps
against your own `Date.now()` invalidation timestamps makes entries written
just before an invalidation look *newer* than it and wrongly survive. A
handler must normalize everything to one clock (see the `timestamp:` comment
in `set`). This is not just a custom-handler concern: the **built-in
in-memory handler exhibits the same failure** here — the single-instance e2e
suite reproducibly lost a webhook invalidation once the server was about a
minute old, which is why both e2e configs run on the normalized file handler
([playwright.config.ts](playwright.config.ts)). The failure signature to
recognize: invalidations "stop working" only on long-lived processes, only
for recently written entries, and never reproduce on a fresh server.

### 13. Webhook revalidation for backend-originated writes

When another system writes to the data source directly, the app's cache
doesn't know. [app/webhooks/revalidate/route.ts](app/webhooks/revalidate/route.ts)
is the app-owned endpoint such a backend calls after writing:

- Authenticated with a shared secret compared via `crypto.timingSafeEqual` —
  `===` on secrets leaks how much of the string matched.
- Calls `revalidateTag(tag, { expire: 0 })` — the "expire immediately"
  profile for webhooks. (`updateTag` is Server-Action-only and throws in
  route handlers; `revalidateTag(tag, "max")` is stale-while-revalidate and
  would serve stale one more time.)
- Deliberately NOT under `/api`, which plays the external service here.

[e2e/webhook.spec.ts](e2e/webhook.spec.ts) walks the full lifecycle: cached
price → backend writes directly → app provably serves stale → webhook →
fresh, plus the 401 on a bad secret.

### 14. The fully-dynamic regime: refresh(), background jobs, focus refetch

Some state is uncached *by nature* — job status, per-user data — and for it
tag invalidation has nothing to do; the tool is re-rendering. Three patterns
([components/refreshers.tsx](components/refreshers.tsx),
[e2e/jobs.spec.ts](e2e/jobs.spec.ts)):

- **Read-your-own-writes with `refresh()`:** `requestRestock` in
  [lib/actions.ts](lib/actions.ts) checks the session, mutates, then calls
  `refresh()` (new in Next 16, Server Actions only) — the client router
  re-renders in the same round trip, showing "pending" with zero client
  refetch code. This is the uncached-data sibling of `updateTag`. Restock
  state is per-user, like favorites: the panel renders only for a session,
  and the job is keyed by user on the service.
- **Capped polling for background jobs:** the server renders
  `PendingAutoRefresher` *only while the job is pending*
  ([components/restock-panel.tsx](components/restock-panel.tsx)), so polling
  starts and stops as a function of server state, transition-wrapped so it
  never clobbers in-flight UI, and capped so a stuck job can't poll forever.
- **`VisibilityRefetcher`** ([app/products/layout.tsx](app/products/layout.tsx)):
  on returning to the tab, `router.refresh()` inside a transition brings
  uncached data up to date.

Honesty note: §4 calls client-side `router.refresh()` after a mutation an
anti-pattern *when tags can do the job in one round trip*. In this regime —
uncached data, out-of-band writes — refresh **is** the correct tool. Also
remember `refresh()`/`router.refresh()` re-runs server components but does
NOT expire `'use cache'` entries; cached reads stay cached.

### 15. Failure and waiting surfaces

The states an app shows when things are missing, broken, or slow are part of
the design, not leftovers:

- **[app/not-found.tsx](app/not-found.tsx)** — one file turns every
  `notFound()` call and unmatched URL from Next's unbranded default into a
  page with a way forward.
- **[app/global-error.tsx](app/global-error.tsx)** — the last-resort
  boundary for errors in the root layout itself, which segment `error.tsx`
  files can't catch. It replaces the whole document, so it renders its own
  `<html>`/`<body>`; only active in production builds.
- **Skeletons over spinners** ([components/skeletons.tsx](components/skeletons.tsx)):
  Suspense fallbacks that mirror the shape of the incoming content, so the
  layout doesn't jump when data arrives — with `role="status"` and an
  `aria-label` so the loading state is announced, not just drawn.

### 16. Module-seam mocking, for boundaries the network mock can't reach

The default testing rule here is "mock at the network boundary" (§10) — but
that assumes the boundary speaks something MSW can intercept. When it
doesn't (gRPC transports, vendor SDKs, native bindings), the honest seam
moves inward to the data-layer module. This repo demonstrates the mechanism
even though its own boundary is HTTP:

- **One seam, declared once:** `package.json` `imports` maps `#api/client`
  to the real [lib/api/client.ts](lib/api/client.ts) by default, and to
  [tests/mocks/api-client.mock.ts](tests/mocks/api-client.mock.ts) under the
  custom `mock` resolve condition. App code imports `#api/client`; nothing
  else changes.
- **Two Vitest projects** ([vitest.config.mts](vitest.config.mts)): `unit`
  (real modules + MSW) and `seam` (adds the `mock` condition). The swap is a
  resolver concern, not 272 scattered `vi.mock()` calls.
- **Drift protection:** every export in the mock is typed as
  `typeof import("@/lib/api/client")["…"]`, so a contract change in the real
  module breaks the mock at compile time — the classic failure mode of
  hand-maintained mock modules.
- [tests/seam/restock-panel.test.tsx](tests/seam/restock-panel.test.tsx)
  uses it to test an async Server Component by simply awaiting it — viable
  for components that touch no framework request APIs (the Next docs still
  recommend e2e beyond that).

**Anti-pattern avoided:** per-test, per-module `vi.mock()`/`jest.mock()`
sprawl — dozens of ad-hoc stubs that drift independently and let tests pass
while the real integration is broken.

## Where to poke around first

1. [stores/favorites-store.ts](stores/favorites-store.ts) — the optimistic
   mutation lifecycle in ~50 lines.
2. [lib/auth.ts](lib/auth.ts) — the entire per-user story hangs off 10 lines
   of DAL.
3. [app/products/[id]/page.tsx](app/products/[id]/page.tsx) — parallel
   streaming, URL-driven tabs, and all three optimistic patterns on one page.
4. [tests/favorites.test.tsx](tests/favorites.test.tsx) — what
   "integration test with mocks only at the boundary" means concretely.
5. [cache-handlers/file-handler.cjs](cache-handlers/file-handler.cjs) — the
   entire multi-instance caching story in ~100 lines, proven by
   [e2e/multi-instance.spec.ts](e2e/multi-instance.spec.ts).
