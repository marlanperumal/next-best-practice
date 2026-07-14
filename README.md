# Next Best Practice

A deliberately minimal Next.js App Router app demonstrating best practices for
server/client components, caching, per-user data, URL state (nuqs),
cross-component state (zustand), optimistic mutations, and integration
testing. Every pattern below links to the code that demonstrates it.

Stack: Next.js 16 (Cache Components enabled), React 19, zustand 5, nuqs 2,
zod, Vitest + Testing Library + MSW, Playwright.

## Running it

```bash
pnpm install
pnpm dev        # app + simulated external API on :3000
pnpm test       # Vitest integration tests (MSW at the network boundary)
pnpm e2e        # Playwright: builds and starts a production server on :3001
pnpm build && pnpm start
```

The "external service" is simulated by route handlers under
[app/api/](app/api/) backed by in-memory data
([app/api/_service/db.ts](app/api/_service/db.ts)) with 400ms artificial
latency. The app only talks to it over HTTP via `EXTERNAL_API_URL`
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
  api/                    the simulated external service (+ /api/stats)
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
props alone won't re-hydrate it. When the *identity* behind the state changes
(sign-in/out, user switch), the layout remounts the provider with
`key={user?.id}` — React's idiomatic "reset client state below this point"
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
`/api/stats` deltas), and multi-page flows. Tests run against a production
build **on a dedicated port** so a dev server on :3000 is never silently
reused ([playwright.config.ts](playwright.config.ts)), serially
(`workers: 1`) because they share the external service's state, and each test
restores the state it mutates.

**Anti-patterns avoided:** mocking zustand/nuqs/fetch-wrappers module-by-module
(tests that pass while the integration is broken); unit-testing async RSCs in
jsdom; asserting on store internals instead of rendered output; e2e against a
dev server.

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

## Where to poke around first

1. [stores/favorites-store.ts](stores/favorites-store.ts) — the optimistic
   mutation lifecycle in ~50 lines.
2. [lib/auth.ts](lib/auth.ts) — the entire per-user story hangs off 10 lines
   of DAL.
3. [app/products/[id]/page.tsx](app/products/[id]/page.tsx) — parallel
   streaming, URL-driven tabs, and all three optimistic patterns on one page.
4. [tests/favorites.test.tsx](tests/favorites.test.tsx) — what
   "integration test with mocks only at the boundary" means concretely.
