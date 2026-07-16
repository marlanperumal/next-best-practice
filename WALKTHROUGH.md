# The guided walkthrough

Every pattern in this reference — what it is, why it exists, the code that
implements it, how to watch it work, and what breaks without it. Section
numbers (§) match the [README](README.md). Read this with the app running in
another window.

## Before you start

Run the app and sign in — most patterns need a session, and the service's
400 ms artificial latency is what makes streaming and optimistic UI _visible_.

```bash
pnpm dev                          # app + simulated external API on :3000
# in the browser: Products → "Sign in as Alice"
curl -s localhost:3000/api/stats  # request counters — your cache observatory
```

The `/api/stats` counters increment once per request the app makes to the
"external service". Watching them is how you verify a cache hit: **no counter
movement = served from cache.**

## Contents

|                                       |                                                                                                                                                                                                                                                                                     |     |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| **Part 1 · Foundations**              | [§1 Server components by default](#1-server-components-by-default-client-components-at-the-leaves) · [§2 Layout = state lifetime](#2-layout-placement-decides-state-lifetime) · [§3 Per-user data & React.cache](#3-per-user-data-a-session-dal-deduped-with-reactcache)            |     |
| **Part 2 · Caching & streaming**      | [§4 'use cache' + tags](#4-use-cache--tags-and-invalidating-in-the-mutation) · [§5 Streaming & PPR](#5-streaming-with-suspense-and-partial-prerendering)                                                                                                                            |     |
| **Part 3 · URL state**                | [§6 URL as state](#6-filters-pagination-and-tabs-live-in-the-url)                                                                                                                                                                                                                   |     |
| **Part 4 · Client state & mutations** | [§7 Two zustand lifetimes](#7-two-zustand-stores-two-lifetimes) · [§8 Optimistic UI, three ways](#8-optimistic-ui-a-decision-rule-demonstrated-three-ways) · [§9 Forms](#9-form-mutations-with-useactionstate)                                                                      |     |
| **Part 5 · Operating the cache**      | [§12 Shared cache handler](#12-scaling-use-cache-past-one-instance-a-custom-cache-handler) · [§13 Webhook revalidation](#13-webhook-revalidation-for-writes-you-didnt-make) · [§14 refresh() & background jobs](#14-the-fully-dynamic-regime-refresh-background-jobs-focus-refetch) |     |
| **Part 6 · Surfaces & gotchas**       | [§15 Failure & waiting surfaces](#15-failure-and-waiting-surfaces) · [§11 Gotcha reel](#11-the-gotcha-reel)                                                                                                                                                                         |     |
| **Part 7 · Testing**                  | [§10/16 Testing at the boundary](#1016-integration-first-mocked-at-the-boundary--and-the-seam-for-when-you-cant) · [Appendix: the legacy model](#appendix--the-legacy-model-mapped)                                                                                                 |     |
| **Part 8 · Observability & CI**       | [§17 Traces, fetch logs, web vitals](#17-traces-fetch-logs-and-web-vitals) · [§18 CI & repo hygiene](#18-ci-and-repo-hygiene)                                                                                                                                                       |     |

---

# Part 1 · Foundations

Where code runs, how long state lives, and who is allowed to talk to the
network.

## §1. Server components by default, client components at the leaves

Files: [app/products/page.tsx](app/products/page.tsx) ·
[components/favorite-button.tsx](components/favorite-button.tsx) ·
[lib/api/client.ts](lib/api/client.ts)

**What:** pages and layouts are server components that fetch data and pass it
_down_ as props; `"use client"` appears only on small interactive leaves (a
button, a filter bar). The data layer imports `server-only`, which turns any
accidental client-side import into a build error.

**Why:** server components render with data already in hand — no client fetch
waterfall, no loading spinner for the initial view, no API keys shipped to the
browser. The `server-only` guard makes the boundary a compile-time fact
instead of a convention someone forgets.

```ts
// lib/api/client.ts
// Server-side data layer: the only place the app talks to the external API.
// `server-only` makes accidental client imports a build error.
import "server-only";
```

> [!TIP]
> **See it live**
>
> 1. Open `localhost:3000/products`, then View Source (not the inspector —
>    the raw HTML). The product names are already in the document: they were
>    rendered on the server.
> 2. DevTools → Network: no request from the browser to `/api/products`. The
>    only data requests you'll ever see from the client are Server Action
>    POSTs.
> 3. Add `import { getProducts } from "#api/client"` to
>    `components/favorite-button.tsx` and save: the dev overlay refuses the
>    build with the server-only error. Delete the line.

> [!CAUTION]
> **Without it** — the common failure is a page marked `"use client"` because
> one button needed a click handler — now everything below it fetches in
> `useEffect`: blank page → spinner → content, double round trips, no SEO,
> and your API base URL (or worse) in the bundle.

## §2. Layout placement decides state lifetime

Files: [app/products/layout.tsx](app/products/layout.tsx)

**What:** the favorites store provider lives in `app/products/layout.tsx` —
not in a page, not in the root layout. Layouts do _not_ re-render when you
navigate between their children, so the same store instance backs the list
and every detail page.

**Why:** where you mount a provider _is_ a decision about how long its state
lives. Layout-level = survives navigation within the section. Page-level =
dies on every navigation. Root-level = would force a per-user fetch onto
every page including static ones.

```tsx
// app/products/layout.tsx
async function WithFavorites({ children }) {
  const user = await getCurrentUser();
  const initialFavoriteIds = user ? await getFavoriteIds(user.id) : [];
  return (
    // key: remount (= reset all client state) when the user changes
    <FavoritesStoreProvider
      key={user?.id ?? "signed-out"}
      initialFavoriteIds={initialFavoriteIds}
    >
      <VisibilityRefetcher />
      {children}
    </FavoritesStoreProvider>
  );
}
```

> [!TIP]
> **See it live**
>
> 1. Sign in as Alice, star a product on the list, click through to its
>    detail page: the star is already filled, instantly, with no network
>    request — same store, still alive.
> 2. Sign in as Bob (nav): every star resets. That's the `key` remounting the
>    provider — React's idiomatic "reset client state below this point".

> [!CAUTION]
> **Without it** — provider-per-page: each navigation creates a fresh store,
> so an in-flight optimistic toggle is orphaned mid-navigation and the detail
> page disagrees with the list you just left. Without the `key`: switch from
> Alice to Bob and Bob sees Alice's starred items until a hard reload.

## §3. Per-user data: a session DAL, deduped with React.cache

Files: [lib/auth.ts](lib/auth.ts) · [e2e/auth.spec.ts](e2e/auth.spec.ts)

**What:** one 10-line module owns the question "who is signed in?" — it reads
the cookie, looks the user up, and is wrapped in `React.cache` so every
caller in one request shares a single lookup. Per-user reads are deliberately
_not_ in the shared cache.

**Why:** the nav, the favorites layout, and the product list all need the
current user. Without request-level dedup that's three sequential upstream
calls per page view — silently, on every page. And per-user data in a shared
cache is a security bug: one user's state cached into another's response.

```ts
// lib/auth.ts
export const getCurrentUser = cache(async () => {
  const cookieStore = await cookies();
  const userId = cookieStore.get("session-user")?.value;
  if (!userId) return null;
  return getUser(userId); // uncached fetch — React.cache dedups per request
});
```

> [!TIP]
> **See it live**
>
> 1. Sign in as Alice. Note the `user` counter:
>    `curl -s localhost:3000/api/stats`.
> 2. Load `/products?category=audio` — a page where at least three components
>    ask for the current user.
> 3. Re-curl the stats: `user` went up by exactly **1**. (The e2e suite
>    asserts this.)

> [!CAUTION]
> **Without it** — N call sites = N sequential fetches per request —
> invisible in dev, real latency and load in production. This was a confirmed
> finding in the audited production app: `generateMetadata` and the page each
> ran the same read, doubling every entity page's backend round trips. The
> other failure mode — caching the session in `'use cache'` — means Bob gets
> Alice's response.

---

# Part 2 · Caching & streaming

Nothing is cached until you say so; nothing blocks the page unless you let it.

## §4. 'use cache' + tags, and invalidating in the mutation

Files: [lib/api/client.ts](lib/api/client.ts) ·
[lib/actions.ts](lib/actions.ts) · [next.config.ts](next.config.ts)

**What:** with Cache Components enabled, `fetch` is uncached by default.
Shared, same-for-everyone data opts in with the `'use cache'` directive plus
a lifetime and tags. Mutations expire those tags _inside the Server Action_,
and `updateTag` refreshes within the same round trip — read-your-own-writes.

**Why:** caching-by-default is how stale-data bugs happen; explicit opt-in
makes every cached read visible in the code. Tags put invalidation next to
the write that caused it, instead of scattered `router.refresh()` calls
hoping to catch up.

```ts
// lib/api/client.ts
export async function getReviews(productId: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag(`reviews:${productId}`);
  const res = await fetch(`${BASE_URL}/products/${productId}/reviews`);
  return reviewListSchema.parse(await res.json());
}

// lib/actions.ts — in the action, after the write:
updateTag(`reviews:${productId}`); // expire + refresh in THIS request
```

> [!TIP]
> **See it live**
>
> 1. Open a product's reviews tab, then reload a few times. Curl the stats
>    between reloads: the `reviews` counter doesn't move — cache hits.
> 2. Add a review. It appears immediately — _and_ no reload happened: the
>    action's `updateTag` returned the refreshed list in its own response.
>    The stats counter ticked exactly once.
> 3. Contrast: toggle a favorite. No tag is touched — favorites are uncached
>    per-user data, so there is _nothing to invalidate_. Knowing when not to
>    invalidate is part of the model.

> [!CAUTION]
> **Without it** — two directions to fail. No caching: every navigation
> re-fetches everything (watch the counters climb). Caching without tags:
> your review posts, but the list won't show it for up to a minute — the
> classic "did my post go through?" double-submit generator. The blunt fixes
> people reach for (`force-dynamic` everywhere, client `router.refresh()`
> after every mutation) throw away the cache entirely.

## §5. Streaming with Suspense and Partial Prerendering

Files: [app/products/page.tsx](app/products/page.tsx) ·
[app/products/[id]/page.tsx](app/products/[id]/page.tsx)

**What:** the page component stays synchronous and composes async server
components under `Suspense`. The static shell (headings, filters, tabs) is
prerendered at build time; each dynamic hole streams in when its data
resolves. Independent holes are _siblings_, so they fetch in parallel.

**Why:** the alternative is that the slowest fetch decides when the user sees
_anything_. Streaming turns one 800 ms blank page into an instant shell plus
content arriving as it's ready — and sibling boundaries mean the product info
and the tab panel race instead of queueing.

```tsx
// app/products/page.tsx
export default function ProductsPage({ searchParams }: PageProps<"/products">) {
  return (
    // page itself is sync ⇒ filters are in the static shell
    <>
      <ProductFilters />
      <Suspense fallback={<ProductListSkeleton />}>
        <ProductList searchParams={searchParams} /> {/* awaits inside */}
      </Suspense>
    </>
  );
}
```

> [!TIP]
> **See it live**
>
> 1. Hard-reload `/products`. The heading and filter controls paint
>    immediately; the skeleton pulses for ~400 ms (the service latency); the
>    list streams in. The filters were usable the whole time.
> 2. Run `pnpm build` and read the route table: `◐` next to `/products`
>    means "static shell + streamed holes" — the architecture is visible in
>    the build output.
> 3. On a detail page, the title and the tab panel arrive independently —
>    two sibling Suspense holes fetching in parallel.

> [!CAUTION]
> **Without it** — one `await searchParams` at the top of the page pulls
> _everything_ — filters included — out of the static shell: blank page until
> the slowest fetch finishes. Nesting the reviews fetch inside the product
> fetch (instead of sibling boundaries) makes them sequential: 400 ms +
> 400 ms instead of max(400, 400). Waterfalls are invisible on localhost and
> brutal on real networks.

---

# Part 3 · URL state

If a link should reproduce the view, the URL is the store.

## §6. Filters, pagination, and tabs live in the URL

Files: [lib/search-params.ts](lib/search-params.ts) ·
[components/product-filters.tsx](components/product-filters.tsx) ·
[components/pagination.tsx](components/pagination.tsx)

**What:** anything shareable — category, search text, page, active tab — is a
search param managed by nuqs. One parser definition is shared three ways:
client hooks (`useQueryStates`), server parsing (`createLoader`), and server
URL-building (`createSerializer`). `shallow: false` re-runs the server
components that read the params; `useTransition` exposes the round trip as a
pending state.

**Why:** the test is one question: _would a pasted link reproduce this view?_
`useState` fails it — state dies on reload, back button breaks, links lie.
And a single shared parser means the client and server can never disagree
about what `?page=` means.

```tsx
// components/product-filters.tsx
const [{ category, q }, setParams] = useQueryStates(productListParams, {
  shallow: false, // tell the server; re-render the RSC tree
  startTransition, // surface the round trip as isPending
});
// on change: reset the page + debounce keystrokes
setParams({ q: value || null, page: null }, { limitUrlUpdates: debounce(300) });
```

> [!TIP]
> **See it live**
>
> 1. Filter to _audio_, search "mic", go to a detail page's reviews tab.
>    Copy the URL into a private window: the exact view reproduces, tab and
>    all.
> 2. Type in the search box and watch the URL: it updates once, ~300 ms after
>    you stop typing (debounced), and `page` disappears (reset on filter
>    change).
> 3. Page through the list, then hold the back button: each page is a
>    history entry (pagination uses `history: "push"`); filter changes are
>    not (default `replace`).
> 4. Visit `/products?page=9`: the server redirects you to the last real page
>    instead of rendering emptiness.

> [!CAUTION]
> **Without it** — every failure here shipped somewhere real. The back-button
> bug: nuqs defaults to `history: replace`, so paginating never pushed
> history and Back exited the site — our own e2e caught it. The
> stale-pagination bug: filter while on page 5 without resetting `page` → an
> empty page. And `useState` tabs mean every shared link opens the wrong tab.

---

# Part 4 · Client state & mutations

Two store lifetimes, three optimistic strategies, one decision rule.

## §7. Two zustand stores, two lifetimes

Files: [stores/favorites-store.ts](stores/favorites-store.ts) ·
[stores/favorites-store-provider.tsx](stores/favorites-store-provider.tsx) ·
[stores/recently-viewed-store.ts](stores/recently-viewed-store.ts)

**What:** the favorites store is a _factory_ instantiated once per provider
mount and reached through context — never a module-level singleton — and it
_reconciles_: every server re-render merges the fresh snapshot in, with
in-flight optimistic values protected. The recently-viewed store is the
opposite: module-level, client-only, persisted to localStorage with
`skipHydration`.

**Why:** a module-level store on the server is shared by _all requests_ —
Alice's favorites SSR-rendered into Bob's HTML. Per-request creation exists
for exactly that reason. The recently-viewed store never exists on the
server, so a singleton is safe there — the distinction is _where the state
originates_, not taste.

```tsx
// stores/favorites-store-provider.tsx
const [store] = useState(() => createFavoritesStore(initialFavoriteIds));

// created once ⇒ prop changes don't reach it; reconcile explicitly:
useEffect(() => {
  store.getState().mergeServer(initialFavoriteIds);
}, [store, initialFavoriteIds]);
```

> [!TIP]
> **See it live**
>
> 1. Visit three product pages, reload the list page: "Recently viewed"
>    survives the reload (localStorage), and there's no hydration warning in
>    the console — storage is only read _after_ mount.
> 2. The out-of-band merge, end to end: as Alice, open a product you haven't
>    starred, then from a terminal simulate "another device":
>    ```bash
>    curl -X POST localhost:3000/api/users/u1/favorites \
>      -H "Content-Type: application/json" \
>      -d '{"productId":"p9","favorite":true}'
>    ```
>    Nothing changes on screen — until any server re-render (click _Request
>    restock_, or reload): the star fills in. The store adopted the server
>    snapshot.

> [!CAUTION]
> **Without it** — singleton server store: cross-user data leaks under
> concurrency — the worst kind of bug, invisible locally. Persist without
> `skipHydration`: server HTML says one thing, first client render says
> another → React hydration mismatch errors. No reconciliation: the store is
> right until anything changes elsewhere, then it's confidently wrong until a
> full reload.

## §8. Optimistic UI: a decision rule, demonstrated three ways

Files: [stores/favorites-store.ts](stores/favorites-store.ts) ·
[components/helpful-button.tsx](components/helpful-button.tsx) ·
[components/add-review-form.tsx](components/add-review-form.tsx)

| State is…                                    | Tool                      | Demo             |
| -------------------------------------------- | ------------------------- | ---------------- |
| Shared across pages, must survive navigation | store-owned mutation      | favorites        |
| Single surface, dies with the component      | `useOptimistic`           | review "helpful" |
| Needs the server's answer anyway (new ID)    | form action + `updateTag` | add review       |

**Why the store owns the favorites mutation:** the promise belongs to the
store — whose lifetime is the layout's, not the button's — so navigating away
mid-request can't orphan it. A per-id version counter makes rapid toggles
settle on the _last_ click, and failures revert. `useOptimistic` is the right
tool only when nothing else needs the state: far less machinery, automatic
revert, error surfaces at the boundary.

```ts
// stores/favorites-store.ts — the whole lifecycle
toggle: async (id) => {
  const next = !get().favoriteIds.has(id);
  const version = (versions.get(id) ?? 0) + 1; // race guard
  versions.set(id, version);
  set(/* flip optimistically, mark pending */);
  try {
    const confirmed = await setFavorite({ id, favorite: next });
    if (versions.get(id) !== version) return; // a newer click owns the outcome
    set(/* reconcile with the server's answer */);
  } catch {
    if (versions.get(id) !== version) return;
    set(/* revert the flip */);
  }
},
```

> [!TIP]
> **See it live**
>
> 1. Click a star: it flips _instantly_; DevTools Network shows the action
>    POST still in flight for ~400 ms after.
> 2. The fire-and-navigate demo: click a star on a detail page and
>    immediately click "← All products". The list shows the new state; the
>    request landed even though the button that started it is gone. Reload to
>    confirm the server agrees.
> 3. Double-click a star as fast as you can: it settles on your final state,
>    never the first response's.
> 4. Click "Helpful" on a review: instant bump, button disabled while
>    pending, converges to the server's count.

> [!CAUTION]
> **Without it** — component-local optimistic state (`useState` per button)
> is how the same vote count ends up _diverging between the list card and the
> detail page mid-flight_ — two systems for one entity. No version guard:
> toggle twice quickly and the slow first response overwrites your second
> click. Component-owned promise + navigation: React cancels nothing, but
> your reconcile-or-revert callback updates state that no longer exists — the
> UI simply never learns what happened.

## §9. Form mutations with useActionState

Files: [components/add-review-form.tsx](components/add-review-form.tsx) ·
[lib/actions.ts](lib/actions.ts)

**What:** the review form posts straight to a Server Action. `useActionState`
supplies the pending flag and whatever the action returned — zod field
errors, echoed values — as React state. Validation lives in the action,
because actions are public HTTP endpoints regardless of what the UI does.

**Why:** React 19 auto-resets uncontrolled forms after an action. That's what
you want on success and exactly not what you want on a validation failure —
so the action echoes the submitted values back and the inputs use them as
`defaultValue`. It's the difference between a form that keeps your text and
one that eats it.

```tsx
// components/add-review-form.tsx
const [state, formAction, pending] = useActionState(addReview, initialState);

<input name="author" defaultValue={state.values?.author} />;
{
  state.errors?.author && <p role="alert">{state.errors.author[0]}</p>;
}
```

> [!TIP]
> **See it live**
>
> 1. On a reviews tab, type a name but leave the review empty; submit. A
>    field error appears _and your name is still in the box_.
> 2. Submit a valid review: the form clears (the auto-reset earning its keep)
>    and the review is already in the list above — that's §4's `updateTag` in
>    the same response.
> 3. DevTools → Network: the whole thing was one POST. There is no
>    client-side refetch code to find.

> [!CAUTION]
> **Without it** — validation only in the UI: anyone with `curl` can post
> whatever they like to the action's endpoint. No value echoing: every typo
> costs the user the whole form. Hand-rolled `fetch` + `useState` forms
> re-implement pending/error plumbing the platform now provides — and usually
> forget one of them.

---

# Part 5 · Operating the cache

What changes when there's more than one server, another writer, or data with
no cache at all.

## §12. Scaling 'use cache' past one instance: a custom cache handler

Files: [cache-handlers/file-handler.cjs](cache-handlers/file-handler.cjs) ·
[e2e/multi-instance.spec.ts](e2e/multi-instance.spec.ts) ·
[tests/cache-handler.test.ts](tests/cache-handler.test.ts)

**What:** the built-in cache is an in-memory LRU — per instance. The
`cacheHandlers` config swaps the storage for a shared one while keeping
`'use cache'`/tags as the programming model. The repo's handler uses a shared
directory as a Redis stand-in and implements the full contract: `updateTags`
records invalidations, `refreshTags` syncs them before each request, and
`get` distinguishes serve-stale (`revalidate: -1`) from hard-expired.

**Why:** on any multi-instance deployment, instance A's `updateTag` never
reaches instance B's memory — B serves stale until its lifetime expires. This
is the standard justification for abandoning Next's cache for thousands of
lines of bespoke Redis code. The handler shows the alternative: ~100 lines
behind a stable interface, with the unit tests as the spec a production Redis
port must pass.

> [!TIP]
> **See it live**
>
> 1. `pnpm e2e:multi` — it boots **two real `next start` processes** sharing
>    one build and cache directory, then proves both halves: a review added
>    through instance A appears on instance B's next request (tag
>    propagation), and a page warmed on A renders on B with _zero_ upstream
>    requests (entry sharing — the counters prove it).
> 2. Read `.cache-handler/tags.json` after a run: the invalidation records
>    the instances coordinate through.

> [!CAUTION]
> **Without it** — two users behind a load balancer see different data for
> minutes after every edit, depending on which instance they hit. And the war
> story: the handler initially compared Next's entry timestamps
> (performance-clock) against its own `Date.now()` — entries written just
> before an invalidation looked _newer_ than it and survived. It only failed
> on servers ~a minute old, never in fresh test runs — and Next's own
> built-in handler exhibits the same drift failure under WSL2. If
> invalidations "stop working" only on long-lived processes: it's the clock.

## §13. Webhook revalidation for writes you didn't make

Files: [app/webhooks/revalidate/route.ts](app/webhooks/revalidate/route.ts) ·
[e2e/webhook.spec.ts](e2e/webhook.spec.ts)

**What:** when another system writes to the data source, the app's cache has
no idea. The app exposes one endpoint the backend calls after writing:
authenticated with a shared secret compared via `timingSafeEqual`, calling
`revalidateTag(tag, { expire: 0 })` — the "expire right now" form that's
legal in route handlers (`updateTag` is actions-only).

> [!TIP]
> **See it live**
>
> 1. Note a product's price, then change it behind the app's back:
>    ```bash
>    curl -X PATCH localhost:3000/api/products/p6 \
>      -H "Content-Type: application/json" -d '{"price":179}'
>    ```
> 2. Reload the product page: still the old price — _provably stale_, and
>    correctly so; nothing told the app.
> 3. Deliver the webhook, then reload — new price:
>    ```bash
>    curl -X POST localhost:3000/webhooks/revalidate \
>      -H "x-revalidate-secret: dev-webhook-secret" \
>      -H "Content-Type: application/json" -d '{"tag":"products"}'
>    ```
> 4. Try a wrong secret: 401.

> [!CAUTION]
> **Without it** — backend-originated changes surface whenever the cache
> lifetime happens to expire: support tickets that say "I updated it and the
> site still shows the old one." With `===` instead of `timingSafeEqual`:
> string comparison returns at the first wrong byte, so response timing leaks
> how much of the secret matched.

## §14. The fully-dynamic regime: refresh(), background jobs, focus refetch

Files: [components/restock-panel.tsx](components/restock-panel.tsx) ·
[components/refreshers.tsx](components/refreshers.tsx) ·
[lib/actions.ts](lib/actions.ts)

**What:** some state is uncached _by nature_ — job status changes
out-of-band, so there's no tag to expire; the tool is re-rendering. The
restock action calls `refresh()` (the uncached-data sibling of `updateTag`);
the server renders a capped poller _only while the job is pending_; a
visibility listener refreshes when you return to the tab. Every refresh is
transition-wrapped so it can't clobber in-flight UI.

```tsx
// components/restock-panel.tsx
if (restock.status === "pending") {
  return (
    <p role="status">
      Restock pending… <PendingAutoRefresher />{" "}
      {/* exists ⇔ job is pending:
        polling starts and stops as a function of server state */}
    </p>
  );
}
```

> [!TIP]
> **See it live**
>
> 1. Signed in, on a product page, click _Request restock_: "Restock
>    pending…" appears with no reload — the action's `refresh()` re-rendered
>    in the same round trip.
> 2. Wait: at ~4 seconds it flips to "Restock confirmed." on its own. The job
>    completed server-side at 3 s; the poller's next tick picked it up — then
>    the poller unmounted, because the server stopped rendering it.
> 3. Note what a refresh does _not_ do: the stats counters for cached reads
>    don't move. `refresh()` re-runs server components; it does not expire
>    `'use cache'` data.

> [!CAUTION]
> **Without it** — the user stares at "pending" forever and learns to hammer
> reload. The naive fix — a client `setInterval` — never stops: it polls
> after completion, after navigation, for stuck jobs, forever (hence the cap
> and the server-controlled mount). And calling `router.refresh()` after
> _cached_-data mutations is the anti-pattern §4 replaces — it re-renders
> everything and guarantees nothing.

---

# Part 6 · Surfaces & gotchas

The states an app shows when things are missing, broken, or slow — and the
traps with no error message.

## §15. Failure and waiting surfaces

Files: [app/not-found.tsx](app/not-found.tsx) ·
[app/global-error.tsx](app/global-error.tsx) ·
[app/products/error.tsx](app/products/error.tsx) ·
[components/skeletons.tsx](components/skeletons.tsx)

**What:** a branded `not-found.tsx` for every `notFound()` and unmatched URL;
a segment `error.tsx` that catches data-layer failures with a retry;
`global-error.tsx` as the last resort for root-layout errors; and skeleton
fallbacks that mirror the shape of incoming content instead of a spinner.

> [!TIP]
> **See it live**
>
> 1. Visit `/products/nope`: a branded page with a way forward, not the
>    framework's default.
> 2. Now run `curl -sI localhost:3000/products/nope | head -1` — it's a
>    **200**, not a 404. With streaming, the shell's status line is sent
>    before `notFound()` throws inside a hole. If crawlers matter for a
>    route, that route must block on the entity fetch instead of streaming
>    it.
> 3. Reload the list page and watch the skeleton: five placeholder rows where
>    five products will be — no layout jump when they arrive, and the region
>    is announced (`role="status"`), not just drawn.

> [!CAUTION]
> **Without it** — one thrown fetch error blanks the entire app instead of
> one section. Spinners cause layout jump when content lands, and tell
> screen-reader users nothing. And the 200-on-404 gotcha silently poisons SEO
> for entity pages if nobody knows to look for it.

## §11. The gotcha reel

Short, sharp, and all encountered for real while building this repo:

| Trap                                 | Symptom                                                   | Fix                                                                        |
| ------------------------------------ | --------------------------------------------------------- | -------------------------------------------------------------------------- |
| `params`/`searchParams` are Promises | works in dev, type errors or undefined at build           | always `await`; use generated `PageProps` types                            |
| Static GET route handlers            | endpoint returns a frozen build-time snapshot forever     | `await connection()` (segment `dynamic` is rejected under cacheComponents) |
| nuqs history default                 | Back button leaves the site instead of un-paginating      | `history: "push"` for pagination only                                      |
| Filter without page reset            | filter on page 5 → empty page                             | write `page: null` in the same update                                      |
| Performance-clock cache timestamps   | invalidations miss recent entries, only on aged processes | normalize to one clock in the handler (§12)                                |
| PPR + `notFound()`                   | missing entities return HTTP 200                          | block instead of stream where status codes matter (§15)                    |
| persist without `skipHydration`      | hydration mismatch warnings, flash of wrong content       | read storage after mount; track hydration in the store                     |

---

# Part 7 · Testing

Real modules end to end; replace only what genuinely isn't yours.

## §10/16. Integration-first, mocked at the boundary — and the seam for when you can't

Files: [tests/favorites.test.tsx](tests/favorites.test.tsx) ·
[tests/mocks/server.ts](tests/mocks/server.ts) ·
[tests/mocks/api-client.mock.ts](tests/mocks/api-client.mock.ts) ·
[vitest.config.mts](vitest.config.mts)

**What:** component tests render the _real_ store, provider, and Server
Action modules; MSW intercepts actual HTTP at the network boundary, with
`onUnhandledRequest: "error"` so nothing escapes silently. Only framework
runtime modules (`server-only`, `next/cache`, `next/headers`) are stubbed.
For boundaries MSW can't reach (gRPC, SDKs), a second Vitest project flips
one resolve condition and `#api/client` becomes a typed mock — one seam,
declared once, with every export typed `typeof import(…)` so contract drift
fails the compile. Async server components and multi-page flows go to
Playwright, against a production build.

**Why:** a test that mocks the store, the fetch wrapper, _and_ the action
tests your mocks' choreography, not your app — it keeps passing while the
integration is broken. Mocking at the outermost boundary you don't own means
the favorites test exercises click → optimistic flip → auth check → HTTP POST
→ reconcile/revert as one real pipeline.

> [!TIP]
> **See it live**
>
> 1. `pnpm test` — 30 tests, ~3 s. Read
>    [tests/favorites.test.tsx](tests/favorites.test.tsx): the failure-revert
>    and rapid-toggle race from §8 are asserted against MSW handlers, not
>    mocked functions.
> 2. `pnpm e2e` — 16 flows against a real production build on its own port,
>    ~30 s.
> 3. The drift protection, live: change any signature in
>    [lib/api/client.ts](lib/api/client.ts) and run `pnpm typecheck` — the
>    seam mock fails to compile. This actually fired during development when
>    restock became per-user.

> [!CAUTION]
> **Without it** — dozens of hand-maintained module stubs drifting
> independently, tests green while integrations rot. The related trap: spec
> files no runner executes at all — dead tests that read as coverage.
> Deleting them is a feature.

---

# Part 8 · Observability & CI

Seeing what the app actually did — and enforcing everything above.

## §17. Traces, fetch logs, and web vitals

Files: [instrumentation.ts](instrumentation.ts) · [lib/auth.ts](lib/auth.ts)
· [components/web-vitals.tsx](components/web-vitals.tsx) ·
[next.config.ts](next.config.ts)

**What:** three observability layers, all opt-in. Dev fetch logging prints
every server-side fetch with its cache status. `instrumentation.ts` (the
stable server-startup hook) registers OpenTelemetry — Next emits spans for
rendering and fetches, and the session DAL adds a custom `session.lookup`
span. `useReportWebVitals` reports LCP/CLS/INP as users experienced them.

**Why:** every caching claim in Parts 2 and 5 is a claim about invisible
behavior. Traces and fetch logs are how you verify them in production
instead of trusting them — and the custom span doubles as §3's proof: one
`session.lookup` per request, no matter how many components asked.

> [!TIP]
> **See it live**
>
> 1. Restart dev and load `/products`: the console prints each upstream
>    fetch with its full URL and cache status — reload and watch reads
>    disappear as they become cache hits.
> 2. `OTEL_CONSOLE=1 pnpm dev`, then load a page while signed in: spans
>    print to the server console. Find `session.lookup` — exactly one per
>    request, with a `session.authenticated` attribute.
> 3. In the browser console (verbose level): `[web-vitals] LCP: … (good)`
>    lines as you navigate.

> [!CAUTION]
> **Without it** — "the cache is working" is a belief, not a measurement.
> Slow requests get debugged by adding `console.log` to production, and the
> N-fetches-per-request class of bug (§3) ships invisibly because nothing
> ever counted the fetches.

## §18. CI and repo hygiene

Files: [.github/workflows/ci.yml](.github/workflows/ci.yml) ·
[package.json](package.json)

**What:** one workflow runs the full verification matrix on every push and
PR — format check, lint, `next typegen` + typecheck for both apps, both
Vitest projects, both Playwright suites. Prettier (deliberately default
config) formats on a pre-commit hook via lint-staged, and `packageManager`
pins pnpm for CI, hooks, and teammates alike.

> [!TIP]
> **See it live**
>
> 1. Push a branch and open the Actions tab — the matrix is the README's
>    claims, enforced.
> 2. Commit a badly formatted file: the pre-commit hook reformats it before
>    it lands.

> [!CAUTION]
> **Without it** — the verification suite only runs when someone remembers,
> which converges on never; formatting becomes review-comment material
> instead of a tool's job; and the reference slowly stops being true.

---

# Appendix · The legacy model, mapped

Most production apps still run the pre-16 caching model. The workspace app
[legacy-cache/](legacy-cache/) is the same domain built on it — run it beside
the main app and diff the feel.

> [!TIP]
> **See it live**
>
> 1. With the main app on :3000, run `pnpm --filter legacy-cache dev` and
>    open `localhost:3100/products`.
> 2. Same catalog, different machinery: per-fetch
>    `next: { revalidate, tags }`, `unstable_cache` for computed values, a
>    `force-dynamic` route serving _cached_ fetches (route dynamism and
>    response caching are independent axes there), on-demand ISR on the
>    detail page, and a helpful-vote form with _zero_ client components.
> 3. The full pattern-by-pattern translation table is in
>    [legacy-cache/README.md](legacy-cache/README.md) — the Rosetta stone for
>    migrating either direction.
