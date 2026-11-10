import type { AddTrackResponse, CheckTracksResponse, CreateUploadResponse, LibraryResponse } from "@cdwallet/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { sha256Hex } from "./auth";
import { route, type Deps, type HttpResponse } from "./router";
import { FakeStorage, MemoryStore } from "./testing/memory-store";

const ADMIN = "cda_test-admin-token";
const DEVICE = "cdd_phone1.test-secret";
const NOW = new Date("2026-11-07T12:00:00.000Z");

const hash = (n: number): string => n.toString(16).padStart(64, "0");

const trackBody = (n: number, extra: Record<string, unknown> = {}) => ({
  hash: hash(n),
  title: `Song ${n}`,
  artist: "Artist",
  album: "Album",
  durationSec: 200.5,
  sizeBytes: 4_000_000,
  metaSource: "tags",
  originalPath: `Artist/Album/${n}.mp3`,
  ...extra,
});

let store: MemoryStore;
let storage: FakeStorage;
let deps: Deps;

beforeEach(() => {
  store = new MemoryStore();
  storage = new FakeStorage();
  store.setAdminTokenHash(sha256Hex(ADMIN));
  store.addDevice({ id: "phone1", name: "Pixel", tokenHash: sha256Hex(DEVICE), pairedAt: NOW.toISOString() });
  deps = { store, storage, now: () => NOW, libraryOverlap: 0 };
});

async function call(
  method: string,
  path: string,
  opts: { token?: string | null; body?: unknown; rawBody?: string; query?: Record<string, string> } = {},
): Promise<HttpResponse> {
  const token = opts.token === undefined ? ADMIN : opts.token;
  const body = opts.rawBody ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body));
  return route(
    {
      method,
      path,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      query: opts.query ?? {},
      ...(body !== undefined ? { body } : {}),
    },
    deps,
  );
}

const parse = <T>(res: HttpResponse): T => JSON.parse(res.body) as T;

/** Upload the audio "to S3" and add the track, as the CLI would. */
async function addTrack(n: number, extra: Record<string, unknown> = {}): Promise<HttpResponse> {
  storage.objects.add(`audio/${hash(n)}.${extra.container === "m4a" ? "m4a" : "mp3"}`);
  return call("POST", "/tracks", { body: trackBody(n, extra) });
}

describe("health and routing", () => {
  it("answers /health without a token", async () => {
    const res = await call("GET", "/health", { token: null });
    expect(res.statusCode).toBe(200);
    expect(parse(res)).toEqual({ ok: true, service: "cd-wallet" });
  });

  it("returns 404 for unknown routes", async () => {
    expect((await call("GET", "/nope")).statusCode).toBe(404);
  });
});

describe("auth", () => {
  it("rejects a missing token with 401", async () => {
    expect((await call("GET", "/library", { token: null })).statusCode).toBe(401);
  });

  it("rejects a wrong admin token with 401", async () => {
    expect((await call("GET", "/library", { token: "cda_wrong" })).statusCode).toBe(401);
  });

  it("rejects everything while no admin token has been set up", async () => {
    deps.store = new MemoryStore();
    expect((await call("GET", "/library")).statusCode).toBe(401);
  });

  it("lets a device read the library but not write", async () => {
    expect((await call("GET", "/library", { token: DEVICE })).statusCode).toBe(200);
    expect((await call("POST", "/tracks/check", { token: DEVICE, body: { hashes: [] } })).statusCode).toBe(403);
    expect((await call("POST", "/uploads", { token: DEVICE, body: {} })).statusCode).toBe(403);
    expect((await call("POST", "/tracks", { token: DEVICE, body: {} })).statusCode).toBe(403);
  });

  it("rejects a device token with the wrong secret", async () => {
    expect((await call("GET", "/library", { token: "cdd_phone1.nope" })).statusCode).toBe(401);
    expect((await call("GET", "/library", { token: "cdd_ghost.test-secret" })).statusCode).toBe(401);
  });
});

describe("POST /tracks/check", () => {
  it("returns only the hashes the library does not have", async () => {
    await addTrack(1);
    const res = await call("POST", "/tracks/check", { body: { hashes: [hash(1), hash(2), hash(2)] } });
    expect(res.statusCode).toBe(200);
    expect(parse<CheckTracksResponse>(res).missing).toEqual([hash(2)]);
  });

  it("treats a deleted track as missing", async () => {
    await addTrack(1);
    store.softDelete(hash(1), NOW.toISOString());
    const res = await call("POST", "/tracks/check", { body: { hashes: [hash(1)] } });
    expect(parse<CheckTracksResponse>(res).missing).toEqual([hash(1)]);
  });

  it("validates input", async () => {
    expect((await call("POST", "/tracks/check", { body: { hashes: ["abc"] } })).statusCode).toBe(400);
    expect((await call("POST", "/tracks/check", { body: {} })).statusCode).toBe(400);
    const tooMany = Array.from({ length: 501 }, (_, i) => hash(i));
    expect((await call("POST", "/tracks/check", { body: { hashes: tooMany } })).statusCode).toBe(400);
    expect((await call("POST", "/tracks/check", { rawBody: "{nope" })).statusCode).toBe(400);
  });
});

describe("POST /uploads", () => {
  it("signs an audio upload locked to the file size", async () => {
    const res = await call("POST", "/uploads", { body: { hash: hash(1), sizeBytes: 1234 } });
    expect(res.statusCode).toBe(200);
    const body = parse<CreateUploadResponse>(res);
    expect(body.audio.url).toContain(`audio/${hash(1)}.mp3`);
    expect(body.art).toBeUndefined();
    expect(body.expiresAt).toBe("2026-11-07T12:15:00.000Z");
    expect(storage.presigned[0]).toMatchObject({ contentType: "audio/mpeg", contentLength: 1234 });
  });

  it("signs an M4A upload for the m4a key with the audio/mp4 type, and says so in the answer", async () => {
    const res = await call("POST", "/uploads", { body: { hash: hash(1), sizeBytes: 1234, container: "m4a" } });
    expect(res.statusCode).toBe(200);
    const body = parse<CreateUploadResponse>(res);
    expect(body.container).toBe("m4a");
    expect(body.audio.url).toContain(`audio/${hash(1)}.m4a`);
    expect(body.audio.headers).toEqual({ "content-type": "audio/mp4" });
    expect(storage.presigned[0]).toMatchObject({ contentType: "audio/mp4", contentLength: 1234 });
  });

  it("treats a missing container as an MP3 and rejects unknown ones", async () => {
    expect(parse<CreateUploadResponse>(await call("POST", "/uploads", { body: { hash: hash(1), sizeBytes: 10 } })).container).toBe("mp3");
    for (const container of ["flac", "", 3, null]) {
      expect((await call("POST", "/uploads", { body: { hash: hash(1), sizeBytes: 10, container } })).statusCode).toBe(400);
    }
  });

  it("signs a cover art upload only when that art is not stored yet", async () => {
    const first = parse<CreateUploadResponse>(
      await call("POST", "/uploads", { body: { hash: hash(1), sizeBytes: 10, artHash: hash(9) } }),
    );
    expect(first.art?.url).toContain(`art/${hash(9)}.jpg`);

    storage.objects.add(`art/${hash(9)}.jpg`);
    const second = parse<CreateUploadResponse>(
      await call("POST", "/uploads", { body: { hash: hash(2), sizeBytes: 10, artHash: hash(9) } }),
    );
    expect(second.art).toBeUndefined();
  });

  it("rejects bad sizes", async () => {
    expect((await call("POST", "/uploads", { body: { hash: hash(1), sizeBytes: 0 } })).statusCode).toBe(400);
    expect((await call("POST", "/uploads", { body: { hash: hash(1), sizeBytes: 1e12 } })).statusCode).toBe(400);
  });
});

describe("POST /tracks", () => {
  it("refuses a track whose audio was never uploaded", async () => {
    const res = await call("POST", "/tracks", { body: trackBody(1) });
    expect(res.statusCode).toBe(409);
    expect(parse<{ error: { code: string } }>(res).error.code).toBe("audio_not_uploaded");
  });

  it("refuses a track whose cover art was never uploaded", async () => {
    storage.objects.add(`audio/${hash(1)}.mp3`);
    const res = await call("POST", "/tracks", { body: trackBody(1, { artHash: hash(9) }) });
    expect(res.statusCode).toBe(409);
    expect(parse<{ error: { code: string } }>(res).error.code).toBe("art_not_uploaded");
  });

  it("adds a track (201) and is idempotent on repeat (200, same version)", async () => {
    const first = await addTrack(1);
    expect(first.statusCode).toBe(201);
    expect(parse<AddTrackResponse>(first).libraryVersion).toBe(1);
    expect(parse<AddTrackResponse>(first).track).toMatchObject({
      hash: hash(1),
      title: "Song 1",
      addedAt: NOW.toISOString(),
    });

    const again = await addTrack(1);
    expect(again.statusCode).toBe(200);
    expect(parse<AddTrackResponse>(again).libraryVersion).toBe(1);
  });

  it("adds an M4A track only once its m4a file is uploaded, and keeps the container", async () => {
    storage.objects.add(`audio/${hash(5)}.mp3`); // an MP3 under the same hash does not count
    const refused = await call("POST", "/tracks", { body: trackBody(5, { container: "m4a" }) });
    expect(refused.statusCode).toBe(409);

    const res = await addTrack(6, { container: "m4a" });
    expect(res.statusCode).toBe(201);
    expect(parse<AddTrackResponse>(res).track.container).toBe("m4a");
    const library = parse<LibraryResponse>(await call("GET", "/library"));
    expect(library.tracks[0]?.container).toBe("m4a");
  });

  it("rejects an unknown container", async () => {
    expect((await addTrack(7, { container: "ogg" })).statusCode).toBe(400);
  });

  it("brings a deleted track back with a new version", async () => {
    await addTrack(1);
    store.softDelete(hash(1), NOW.toISOString());
    const res = await addTrack(1);
    expect(res.statusCode).toBe(201);
    expect(parse<AddTrackResponse>(res).libraryVersion).toBe(3);
    expect(parse<AddTrackResponse>(res).track).not.toHaveProperty("deletedAt");
  });

  it("does not leak internal fields", async () => {
    const track = parse<AddTrackResponse>(await addTrack(1)).track;
    expect(track).not.toHaveProperty("version");
    expect(track).not.toHaveProperty("pk");
  });

  it("validates metadata", async () => {
    storage.objects.add(`audio/${hash(1)}.mp3`);
    const cases: Array<Record<string, unknown>> = [
      { title: "" },
      { artist: 5 },
      { metaSource: "magic" },
      { durationSec: -1 },
      { year: 20.5 },
    ];
    for (const extra of cases) {
      const res = await call("POST", "/tracks", { body: trackBody(1, extra) });
      expect(res.statusCode, JSON.stringify(extra)).toBe(400);
    }
  });
});

describe("GET /library", () => {
  it("returns everything from version 0 and the current version", async () => {
    await addTrack(1);
    await addTrack(2);
    const body = parse<LibraryResponse>(await call("GET", "/library"));
    expect(body.tracks.map((t) => t.hash)).toEqual([hash(1), hash(2)]);
    expect(body).toMatchObject({ version: 2, deletedIds: [], hasMore: false });
  });

  it("returns only changes after `since`, with deletions as ids", async () => {
    await addTrack(1);
    await addTrack(2);
    store.softDelete(hash(1), NOW.toISOString());
    await addTrack(3);

    const body = parse<LibraryResponse>(await call("GET", "/library", { query: { since: "2" } }));
    expect(body.tracks.map((t) => t.hash)).toEqual([hash(3)]);
    expect(body.deletedIds).toEqual([hash(1)]);
    expect(body.version).toBe(4);
  });

  it("pages through a large library", async () => {
    for (let n = 1; n <= 5; n++) await addTrack(n);
    deps.libraryPageSize = 2;

    const seen: string[] = [];
    let since = 0;
    for (let guard = 0; guard < 10; guard++) {
      const page = parse<LibraryResponse>(await call("GET", "/library", { query: { since: String(since) } }));
      seen.push(...page.tracks.map((t) => t.hash));
      since = page.version;
      if (!page.hasMore) break;
    }
    expect(seen).toEqual([1, 2, 3, 4, 5].map(hash));
    expect(since).toBe(5);
  });

  it("reaches back by the overlap window", async () => {
    for (let n = 1; n <= 3; n++) await addTrack(n);
    deps.libraryOverlap = 2;
    const body = parse<LibraryResponse>(await call("GET", "/library", { query: { since: "3" } }));
    expect(body.tracks.map((t) => t.hash)).toEqual([hash(2), hash(3)]);
  });

  it("rejects a bad `since`", async () => {
    expect((await call("GET", "/library", { query: { since: "-1" } })).statusCode).toBe(400);
    expect((await call("GET", "/library", { query: { since: "abc" } })).statusCode).toBe(400);
  });
});
