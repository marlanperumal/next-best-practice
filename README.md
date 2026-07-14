# Next Best Practice

A deliberately minimal Next.js App Router app demonstrating best practices for
server/client components, caching, URL state (nuqs), cross-component state
(zustand), optimistic mutations, and integration testing. Every pattern below
links to the code that demonstrates it.

Stack: Next.js 16 (Cache Components enabled), React 19, zustand 5, nuqs 2,
zod, Vitest + Testing Library + MSW, Playwright.

## Running it

```bash
pnpm install
pnpm dev        # app + simulated external API on :3000
pnpm test       # Vitest integration tests (MSW at the network boundary)
pnpm e2e        # Playwright (builds and starts a production server itself)
pnpm build && pnpm start
```

The "external service" is simulated by route handlers under
[app/api/](app/api/) backed by in-memory data
([app/api/_service/db.ts](app/api/_service/db.ts)) with 400ms artificial
latency. The app only talks to it over HTTP via `EXTERNAL_API_URL`
(default `http://localhost:3000/api`), so it behaves exactly like a third
party: it has real latency, real mutations, and is mockable at the network
boundary. **Real-world caveat:** when you own the data, server components
should call the data source directly — fetching your own route handlers from
a server component adds a pointless HTTP hop. The hop here exists only to
simulate an external service.

## Architecture

```
app/
  layout.tsx              root layout: NuqsAdapter, nav
  page.tsx                static home page (fully prerendered)
  products/
    layout.tsx            fetches favorites, hosts the zustand provider
    page.tsx              list: filtering + pagination
    [id]/page.tsx         detail: parallel streamed sections, URL tabs
    error.tsx             segment error boundary
  api/                    the simulated external service
lib/
  api/client.ts           server-only data layer ('use cache' + tags)
  api/schemas.ts          zod schemas = the API contract
  actions.ts              Server Actions (mutations + cache invalidation)
  search-params.ts        nuqs parsers shared by client and server
stores/
  favorites-store.ts      server-hydrated store factory (per request)
  favorites-store-provider.tsx
  recently-viewed-store.ts  client-only global store (persisted)
components/               client leaf components
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

[lib/api/client.ts](lib/api/client.ts) imports `server-only`, which turns any
accidental client-side import of the data layer into a build error rather than
a leaked API base URL or a runtime surprise.

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
concerns: the `NuqsAdapter` and nav. It stays free of data fetching so the
home page remains fully static.

### 3. A typed data layer at the network boundary

All external API access goes through [lib/api/client.ts](lib/api/client.ts).
Responses are validated with zod ([lib/api/schemas.ts](lib/api/schemas.ts))
so a contract change in the external service fails loudly at the boundary with
a clear error, instead of `undefined` propagating into components.

**Anti-pattern avoided:** scattering `fetch` calls and `as` casts through
components.

### 4. Caching: `use cache` + tags, uncached by default

With Cache Components enabled ([next.config.ts](next.config.ts)), nothing is
cached unless you say so — `fetch` is uncached by default in Next 15+.

- Shared, cacheable data opts in: `getProducts` / `getProduct` / `getReviews`
  in [lib/api/client.ts](lib/api/client.ts) use `'use cache'` +
  `cacheLife("minutes")` + `cacheTag(...)`. The cache key includes the
  function arguments, so each filter/page combination is cached separately.
- Per-user-style data stays uncached deliberately (`getFavoriteIds`) — caching
  it would leak one user's state into another's response in a real app.
- Mutations invalidate by tag: [lib/actions.ts](lib/actions.ts) calls
  `updateTag("products")` after the PATCH. `updateTag` (vs `revalidateTag`)
  expires *and refreshes within the same request*, giving read-your-own-writes
  — the action's response already reflects the mutation.
- `getProduct` is called by both `generateMetadata` and the page in
  [app/products/[id]/page.tsx](app/products/[id]/page.tsx); the cache dedupes
  this into one upstream request.

**Anti-patterns avoided:** `export const dynamic = "force-dynamic"` as a
cache-busting hammer; `router.refresh()` from the client after a mutation
(refetches everything, no read-your-own-writes guarantee); caching per-user
data.

### 5. Streaming with Suspense and Partial Prerendering

`pnpm build` shows `/products` and `/products/[id]` as ◐ partial prerender:
the static shell (headings, filters, tabs) is served instantly, and each
dynamic hole streams in.

- [app/products/page.tsx](app/products/page.tsx): the page component stays
  *synchronous*; only the nested async `ProductList` awaits `searchParams`
  and data. Awaiting `searchParams` at the top of the page would pull the
  whole page — filters included — out of the static shell.
- [app/products/[id]/page.tsx](app/products/[id]/page.tsx): `ProductInfo` and
  `TabPanel` are sibling async components under separate `Suspense`
  boundaries, so the product and the tab content are fetched in parallel and
  stream independently. The reviews list inside `TabPanel` is the nested
  sub-resource fetch.

**Anti-pattern avoided:** sequential await waterfalls — awaiting the product,
then the reviews, then rendering, in one component.

**Gotcha worth knowing:** with streaming/PPR, a missing product renders the
not-found UI but the HTTP status is 200, because the static shell (and its
status line) is already sent before `notFound()` throws inside a hole. If
crawler-correct 404 status codes matter for a route, that route must block on
the entity fetch instead of streaming it.

### 6. URL is the state for filters, pagination, and tabs

Anything you'd want in a shareable/bookmarkable/back-button-friendly link
lives in the URL, managed by nuqs — not in `useState`, not in a store.

- One definition, both sides: [lib/search-params.ts](lib/search-params.ts)
  declares the parsers once; client components use them via `useQueryStates`,
  server components via `createLoader` (type-safe `searchParams` parsing, no
  hand-rolled `Number(params.get("page") ?? 1)`).
- `shallow: false` tells the server about the change so the RSC tree re-renders
  with new data; the update is wrapped in `useTransition` and surfaced as a
  pending indicator ([components/product-filters.tsx](components/product-filters.tsx)).
- Search input updates are debounced (`limitUrlUpdates: debounce(300)`), and
  **changing a filter resets `page`** — the classic stale-pagination bug.
- History semantics are per-control: pagination uses `history: "push"` so the
  back button steps through pages ([components/pagination.tsx](components/pagination.tsx));
  filters and tabs keep the default `replace` so typing doesn't spam history.
  (This was caught by the e2e back-button test — nuqs defaults to `replace`.)
- Tabs ([components/product-tabs.tsx](components/product-tabs.tsx)) are just a
  URL param; the *server* decides what the active panel renders in `TabPanel`.
  Deep links and reloads land on the right tab for free.

**Anti-patterns avoided:** tab/filter state in `useState` (lost on reload, not
shareable); duplicating URL parsing logic on client and server.

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

**Client-originated ([stores/recently-viewed-store.ts](stores/recently-viewed-store.ts)):**
recently-viewed products never exist on the server, so a module-level global
store is fine — the server never reads it. It uses `persist` with
`skipHydration: true`: localStorage is only read in an effect after mount
([components/recently-viewed.tsx](components/recently-viewed.tsx)), because
reading it during the first render would make client HTML differ from server
HTML (the hydration-mismatch gotcha). Hydration completion is tracked *in the
store* via `onRehydrateStorage`.

The store hydrates with initial state and is then updated as the user browses
(`record` on each detail-page visit) — hydrate-then-mutate, the same lifecycle
the favorites store demonstrates with server data.

### 8. Optimistic updates that survive navigation

The favorite toggle is visible on both the list and detail pages and must stay
consistent between them, flip instantly, and settle correctly even if the user
navigates away mid-request. The design
([stores/favorites-store.ts](stores/favorites-store.ts)):

- **The store owns the mutation, not the component.** `toggle` flips state
  optimistically, calls the Server Action, and reconciles or reverts when it
  settles. Because the promise belongs to the store (whose lifetime is the
  layout's, not the button's), unmounting the button — e.g. navigating from
  detail back to the list — cannot orphan or cancel the request. This is the
  correct answer to "fire a mutation and immediately navigate away"
  (proven in [e2e/favorites.spec.ts](e2e/favorites.spec.ts)).
- **Every reader renders from the store** ([components/favorite-button.tsx](components/favorite-button.tsx)),
  so all pages show identical state at all times, including mid-flight.
- **A per-id version counter guards races:** if the user toggles again while a
  request is in flight, only the latest request may write the final state — a
  slow first response can't clobber a newer click (tested in
  [tests/favorites.test.tsx](tests/favorites.test.tsx)).
- **On failure the flip is reverted** — the UI never lies for longer than the
  request takes.
- The Server Action then invalidates the server cache (`updateTag`), so the
  next server render agrees with the store.

**Anti-patterns avoided:** component-local `useState` for favorite status (list
and detail drift apart, state dies on unmount); awaiting the mutation before
allowing navigation (janky UX); skipping the version guard (rapid toggles
settle in the wrong state); optimistic updates with no revert path.

(React's `useOptimistic` covers the simpler case where a single component owns
the mutation; it's the right tool when state doesn't need to be shared across
pages or survive unmount. Here the store is the source of truth, so the
optimistic write lives there.)

### 9. Mutations via Server Actions, validated

[lib/actions.ts](lib/actions.ts): mutations go through a Server Action (the
docs-recommended path) rather than a hand-rolled API route + client fetch.
The action validates its input with zod before acting — Server Actions are
public HTTP endpoints, so treat arguments as untrusted (and check auth here in
a real app). Cache invalidation lives in the action, next to the write.

### 10. Testing: integration-first, mock only at real boundaries

**Vitest + Testing Library + MSW** ([tests/](tests/)): components are rendered
with their *real* store, *real* provider, and the *real* server-action module;
only two kinds of things are replaced:

- The network — MSW intercepts the actual HTTP requests
  ([tests/mocks/server.ts](tests/mocks/server.ts)), with
  `onUnhandledRequest: "error"` so no request silently escapes.
- Framework-runtime modules that don't exist outside Next (`server-only`,
  `next/cache`) are aliased to tiny stubs in
  [vitest.config.mts](vitest.config.mts) — a framework boundary, not app logic.

So [tests/favorites.test.tsx](tests/favorites.test.tsx) exercises the full
click → optimistic flip → HTTP PATCH → reconcile/revert pipeline, including
the failure-revert and rapid-toggle race. URL-state components are tested
against nuqs's official testing adapter, asserting on **emitted URL updates**,
not implementation details ([tests/url-state.test.tsx](tests/url-state.test.tsx)).

**Playwright** ([e2e/](e2e/)) covers what Vitest can't: async server
components (the Next docs explicitly recommend e2e for these), streaming,
caching, and multi-page flows. Tests run against a production build
(`webServer` in [playwright.config.ts](playwright.config.ts)), serially
(`workers: 1`) because they share the external service's state, and each test
restores the state it mutates.

**Anti-patterns avoided:** mocking zustand/nuqs/fetch-wrappers module-by-module
(tests that pass while the integration is broken); unit-testing async RSCs in
jsdom; asserting on store internals instead of rendered output.

### 11. Assorted gotchas demonstrated

- **`params`/`searchParams` are Promises** in Next 16 — always awaited, typed
  with the generated `PageProps`/`LayoutProps` helpers (no hand-written prop
  types to drift).
- **Error boundaries per segment:** [app/products/error.tsx](app/products/error.tsx)
  keeps a data-layer failure from blanking the whole app and offers a retry.
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
2. [app/products/[id]/page.tsx](app/products/[id]/page.tsx) — parallel
   streaming + URL-driven tabs in one file.
3. [tests/favorites.test.tsx](tests/favorites.test.tsx) — what
   "integration test with mocks only at the boundary" means concretely.
