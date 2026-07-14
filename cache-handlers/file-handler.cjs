// Custom cache handler for 'use cache', backed by a directory shared between
// server instances. Stands in for Redis/KV: on multi-instance deployments the
// built-in in-memory handler is per-instance, so instance A's updateTag never
// reaches instance B's cache — a shared handler is what makes tags propagate.
// Proven by e2e/multi-instance.spec.ts against two `next start` processes.
//
// The multi-instance contract (see the "How Revalidation Works" guide):
// - updateTags: the invalidating instance records {tag -> now} in shared storage
// - refreshTags: called before every request; each instance syncs tag state
// - getExpiration/get: entries whose timestamp predates a tag's invalidation
//   timestamp are treated as misses
//
// Simplification vs the built-in handler: every invalidation is a hard expiry
// (a miss). The default handler additionally distinguishes SWR-stale
// (revalidateTag(tag, "max")) from hard expiry — a miss is always safe.
const { createHash } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const DIR = path.join(process.cwd(), ".cache-handler");
const TAGS_FILE = path.join(DIR, "tags.json");

// In-flight sets per key: get() must wait for a pending set() of the same
// key instead of reporting a miss.
const pendingSets = new Map();
let tagTimestamps = new Map();

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

const anyTagNewerThan = (tags, timestamp) =>
  tags.some((tag) => (tagTimestamps.get(tag) ?? 0) > timestamp);

module.exports = {
  async get(cacheKey, softTags) {
    await pendingSets.get(cacheKey);
    try {
      const { value, ...meta } = JSON.parse(
        await fs.readFile(entryPath(cacheKey), "utf8"),
      );
      if (Date.now() > meta.timestamp + meta.revalidate * 1000) return undefined;
      if (anyTagNewerThan([...meta.tags, ...softTags], meta.timestamp)) {
        return undefined;
      }
      const buffer = Buffer.from(value, "base64");
      return {
        ...meta,
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
    tagTimestamps = await readTagsFile();
  },

  async getExpiration(tags) {
    return Math.max(0, ...tags.map((tag) => tagTimestamps.get(tag) ?? 0));
  },

  // Second param (durations) intentionally unused: we treat every
  // invalidation as immediate expiry rather than SWR-stale.
  async updateTags(tags) {
    const now = Date.now();
    const current = await readTagsFile();
    for (const tag of tags) current.set(tag, now);
    tagTimestamps = current;
    await fs.mkdir(DIR, { recursive: true });
    await writeAtomic(TAGS_FILE, JSON.stringify(Object.fromEntries(current)));
  },
};
