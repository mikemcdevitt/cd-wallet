import { describe, expect, it } from "vitest";
import { StreamUrlResolver } from "./stream-urls";

function fakeClient(ttlMs: number, now: () => number) {
  const asked: string[][] = [];
  return {
    asked,
    client: {
      async streamUrls(ids: string[]) {
        asked.push(ids);
        return { urls: ids.map((trackId) => ({ trackId, url: `https://s3/${trackId}?n=${asked.length}`, expiresAt: new Date(now() + ttlMs).toISOString() })) };
      },
    },
  };
}

describe("stream url resolver", () => {
  it("asks 20 at a time and keeps the order", async () => {
    const t = 1_000_000;
    const { client, asked } = fakeClient(3_600_000, () => t);
    const ids = Array.from({ length: 45 }, (_, i) => `id${i}`);
    const urls = await new StreamUrlResolver(client, () => t).resolve(ids);
    expect(asked.map((a) => a.length)).toEqual([20, 20, 5]);
    expect(urls[44]).toContain("id44");
  });

  it("reuses fresh urls and refreshes ones about to expire", async () => {
    let t = 1_000_000;
    const { client, asked } = fakeClient(3_600_000, () => t);
    const resolver = new StreamUrlResolver(client, () => t);
    await resolver.resolve(["a"]);
    await resolver.resolve(["a"]);
    expect(asked.length).toBe(1);
    t += 3_600_000 - 60_000; // one minute left
    await resolver.resolve(["a"]);
    expect(asked.length).toBe(2);
  });

  it("fails clearly if the server leaves a track out", async () => {
    const resolver = new StreamUrlResolver({ streamUrls: async () => ({ urls: [] }) });
    await expect(resolver.resolve(["a"])).rejects.toThrow(/stream address/);
  });
});
