import type { StreamUrlsResponse } from "@cdwallet/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { hash, makeHarness, parse } from "./testing/harness";

let h: ReturnType<typeof makeHarness>;
beforeEach(() => {
  h = makeHarness();
});

async function deviceToken(): Promise<string> {
  const pairing = parse<{ code: string }>(await h.call("POST", "/pairing"));
  const claim = parse<{ deviceToken: string }>(
    await h.call("POST", "/pairing/claim", { token: null, body: { code: pairing.code, deviceName: "Pixel" } }),
  );
  return claim.deviceToken;
}

describe("POST /stream-urls", () => {
  it("signs a download link for each known track, in order, valid for an hour", async () => {
    await h.addTrack(1);
    await h.addTrack(2);
    const res = await h.call("POST", "/stream-urls", { body: { trackIds: [hash(2), hash(1)] } });

    expect(res.statusCode).toBe(200);
    const { urls } = parse<StreamUrlsResponse>(res);
    expect(urls.map((u) => u.trackId)).toEqual([hash(2), hash(1)]);
    expect(urls[0]?.url).toBe(`https://s3.test/audio/${hash(2)}.mp3?get`);
    expect(urls[0]?.expiresAt).toBe("2026-11-07T13:00:00.000Z");
  });

  it("leaves out unknown and deleted tracks", async () => {
    await h.addTrack(1);
    await h.addTrack(2);
    h.store.softDelete(hash(2), h.now().toISOString());
    const { urls } = parse<StreamUrlsResponse>(
      await h.call("POST", "/stream-urls", { body: { trackIds: [hash(1), hash(2), hash(3)] } }),
    );
    expect(urls.map((u) => u.trackId)).toEqual([hash(1)]);
  });

  it("works for a paired phone", async () => {
    await h.addTrack(1);
    const token = await deviceToken();
    const res = await h.call("POST", "/stream-urls", { token, body: { trackIds: [hash(1)] } });
    expect(res.statusCode).toBe(200);
  });

  it("needs a token and valid input", async () => {
    expect((await h.call("POST", "/stream-urls", { token: null, body: { trackIds: [hash(1)] } })).statusCode).toBe(401);
    expect((await h.call("POST", "/stream-urls", { body: { trackIds: [] } })).statusCode).toBe(400);
    expect((await h.call("POST", "/stream-urls", { body: { trackIds: ["nope"] } })).statusCode).toBe(400);
    const tooMany = Array.from({ length: 21 }, (_, i) => hash(i));
    expect((await h.call("POST", "/stream-urls", { body: { trackIds: tooMany } })).statusCode).toBe(400);
  });
});

describe("GET /art/{hash}", () => {
  it("redirects to a signed cover URL", async () => {
    h.storage.objects.add(`art/${hash(9)}.jpg`);
    const res = await h.call("GET", `/art/${hash(9)}`);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`https://s3.test/art/${hash(9)}.jpg?get`);
  });

  it("is available to a paired phone", async () => {
    h.storage.objects.add(`art/${hash(9)}.jpg`);
    const token = await deviceToken();
    expect((await h.call("GET", `/art/${hash(9)}`, { token })).statusCode).toBe(302);
  });

  it("returns 404 for a missing cover and 400 for a malformed hash", async () => {
    expect((await h.call("GET", `/art/${hash(9)}`)).statusCode).toBe(404);
    expect((await h.call("GET", "/art/not-a-hash")).statusCode).toBe(400);
  });

  it("needs a token", async () => {
    expect((await h.call("GET", `/art/${hash(9)}`, { token: null })).statusCode).toBe(401);
  });
});
