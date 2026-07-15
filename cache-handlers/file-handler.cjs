// Custom cache handler for 'use cache', backed by a directory shared between
// server instances. Stands in for Redis/KV: on multi-instance deployments the
// built-in in-memory handler is per-instance, so instance A's updateTag never
// reaches instance B's cache — a shared handler is what makes tags propagate.
// Proven by e2e/multi-instance.spec.ts against two `next start` processes.
//
// The multi-instance contract (see the "How Revalidation Works" guide):
// - updateTags: the invalidating instance records the invalidation in shared
//   storage. `durations.expire` distinguishes the two invalidation flavors:
//   absent/0 = hard expiry now (updateTag, revalidateTag(tag, {expire: 0}));
//   N seconds = stale-while-revalidate window (revalidateTag(tag, "max")).
// - refreshTags: called before every request; each instance syncs tag state
// - getExpiration/get: entries written before a tag's `stale` timestamp are
//   served once with `revalidate: -1` (the "serve stale, revalidate in the
//   background" signal) until the tag's `expired` timestamp passes, after
//   which they are hard misses.
const { createHash } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const DIR =
  process.env.CACHE_HANDLER_DIR ?? path.join(process.cwd(), ".cache-handler");
const TAGS_FILE = path.join(DIR, "tags.json");

// In-flight sets per key: get() must wait for a pending set() of the same
// key instead of reporting a miss.
const pendingSets = new Map();
// tag -> { stale: ms timestamp, expired: ms timestamp }
let tagRecords = new Map();

const entryPath = (cacheKey) =>
  path.join(DIR, `${createHash("sha256").update(cacheKey).digest("hex")}.json`);

async function readTagsFile() {
  try {
    return new Map(Object.entries(JSON.parse(await fs.readFile(TAGS_FILE, "utf8"))));
  } catch {
    return new Map();
  }
}

// Write-then-rename so a concurrent reader never sees a partial file.
async function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
}

module.exports = {
  async get(cacheKey, softTags) {
    await pendingSets.get(cacheKey);
    try {
      const { value, ...meta } = JSON.parse(
        await fs.readFile(entryPath(cacheKey), "utf8"),
      );
      const now = Date.now();
      if (now > meta.timestamp + meta.revalidate * 1000) return undefined;

      let serveStale = false;
      for (const tag of [...meta.tags, ...softTags]) {
        const record = tagRecords.get(tag);
        if (!record || meta.timestamp >= record.stale) continue;
        if (now >= record.expired) return undefined; // hard-expired: miss
        serveStale = true; // inside the SWR window
      }

      const buffer = Buffer.from(value, "base64");
      return {
        ...meta,
        // revalidate: -1 tells the 'use cache' runtime "serve this, but
        // re-run the function in the background".
        revalidate: serveStale ? -1 : meta.revalidate,
        value: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(buffer));
            controller.close();
          },
        }),
      };
    } catch {
      // A handler error must read as a miss, never a render error.
      return undefined;
    }
  },

  async set(cacheKey, pendingEntry) {
    const write = (async () => {
      const entry = await pendingEntry; // may still be streaming: await first
      const chunks = [];
      for await (const chunk of entry.value) chunks.push(chunk);
      await fs.mkdir(DIR, { recursive: true });
      await writeAtomic(
        entryPath(cacheKey),
        JSON.stringify({
          value: Buffer.concat(chunks).toString("base64"),
          tags: entry.tags,
          stale: entry.stale,
          // One clock everywhere: Next stamps entries from a performance-
          // based clock that drifts from the system clock over process
          // lifetime (very visibly under WSL2). Tag invalidations below use
          // Date.now(), so entries must too, or an entry written just before
          // an invalidation can look newer than it and wrongly survive.
          timestamp: Date.now(),
          expire: entry.expire,
          revalidate: entry.revalidate,
        }),
      );
    })().catch(() => {}); // set failures must never break the response
    pendingSets.set(cacheKey, write);
    try {
      await write;
    } finally {
      pendingSets.delete(cacheKey);
    }
  },

  async refreshTags() {
    // Called before each request: pick up invalidations from other instances.
    tagRecords = await readTagsFile();
  },

  async getExpiration(tags) {
    // Max `stale` timestamp: flags exactly the entries written before an
    // invalidation; get() then decides between serve-stale and hard miss.
    return Math.max(0, ...tags.map((tag) => tagRecords.get(tag)?.stale ?? 0));
  },

  async updateTags(tags, durations) {
    const now = Date.now();
    const expired =
      durations?.expire != null ? now + durations.expire * 1000 : now;
    const current = await readTagsFile();
    for (const tag of tags) current.set(tag, { stale: now, expired });
    tagRecords = current;
    await fs.mkdir(DIR, { recursive: true });
    await writeAtomic(TAGS_FILE, JSON.stringify(Object.fromEntries(current)));
  },
};
