// @vitest-environment node
// Unit tests for the file-backed 'use cache' handler: the SWR-vs-hard-expiry
// semantics are exactly what a real Redis handler must reproduce.
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

type Handler = {
  get: (
    key: string,
    softTags: string[],
  ) => Promise<
    undefined | { revalidate: number; value: ReadableStream<Uint8Array> }
  >;
  set: (key: string, entry: Promise<object>) => Promise<void>;
  updateTags: (
    tags: string[],
    durations?: { expire?: number },
  ) => Promise<void>;
  getExpiration: (tags: string[]) => Promise<number>;
  refreshTags: () => Promise<void>;
};

let handler: Handler;

beforeAll(async () => {
  process.env.CACHE_HANDLER_DIR = await mkdtemp(
    join(tmpdir(), "cache-handler-"),
  );
  handler = (await import("../cache-handlers/file-handler.cjs")).default;
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeEntry(tags: string[]) {
  return Promise.resolve({
    value: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("cached-data"));
        controller.close();
      },
    }),
    tags,
    stale: 300,
    timestamp: Date.now(),
    expire: 900,
    revalidate: 60,
  });
}

async function drain(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

describe("file cache handler", () => {
  it("round-trips an entry", async () => {
    await handler.set("key:roundtrip", makeEntry(["t:roundtrip"]));
    const entry = await handler.get("key:roundtrip", []);
    expect(entry).toBeDefined();
    expect(await drain(entry!.value)).toBe("cached-data");
    expect(entry!.revalidate).toBe(60);
  });

  it("misses for unknown keys", async () => {
    expect(await handler.get("key:unknown", [])).toBeUndefined();
  });

  it("hard-expires entries when a tag is invalidated with no SWR window", async () => {
    await handler.set("key:hard", makeEntry(["t:hard"]));
    await sleep(5);
    await handler.updateTags(["t:hard"]); // updateTag / { expire: 0 } shape
    expect(await handler.get("key:hard", [])).toBeUndefined();
  });

  it("serves stale with revalidate: -1 inside an SWR window", async () => {
    await handler.set("key:swr", makeEntry(["t:swr"]));
    await sleep(5);
    await handler.updateTags(["t:swr"], { expire: 60 }); // revalidateTag(tag, "max") shape
    const entry = await handler.get("key:swr", []);
    expect(entry).toBeDefined();
    expect(entry!.revalidate).toBe(-1); // serve stale, revalidate in background
  });

  it("hard-expires once the SWR window has passed", async () => {
    await handler.set("key:swr-out", makeEntry(["t:swr-out"]));
    await sleep(5);
    await handler.updateTags(["t:swr-out"], { expire: 0.01 });
    await sleep(20);
    expect(await handler.get("key:swr-out", [])).toBeUndefined();
  });

  it("leaves entries written after the invalidation untouched", async () => {
    await handler.updateTags(["t:pre"]);
    await sleep(5);
    await handler.set("key:fresh", makeEntry(["t:pre"]));
    const entry = await handler.get("key:fresh", []);
    expect(entry).toBeDefined();
    expect(entry!.revalidate).toBe(60);
  });

  it("checks soft tags too, and reports expirations for the front cache", async () => {
    await handler.set("key:soft", makeEntry(["t:other"]));
    await sleep(5);
    await handler.updateTags(["_N_T_/products/p1"]);
    expect(
      await handler.get("key:soft", ["_N_T_/products/p1"]),
    ).toBeUndefined();
    expect(await handler.getExpiration(["_N_T_/products/p1"])).toBeGreaterThan(
      0,
    );
    expect(await handler.getExpiration(["t:never-touched"])).toBe(0);
  });
});
