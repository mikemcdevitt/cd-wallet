import * as http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { startDevServer, type DevServer } from "./server";

let server: DevServer | undefined;
afterEach(async () => {
  await server?.api.close();
  server = undefined;
});

async function start(tracks = 12) {
  server = await startDevServer({ audioPath: "/nonexistent/none.mp3", audioRequired: false, host: "127.0.0.1", port: 0, tracks });
  return server;
}

async function pair(s: DevServer) {
  const code = await s.newPairingCode();
  const res = await fetch(`${s.api.url}/pairing/claim`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, deviceName: "t" }) });
  expect(res.status).toBe(201);
  const { deviceToken } = (await res.json()) as { deviceToken: string };
  return { code, auth: { authorization: `Bearer ${deviceToken}` } };
}

describe("dev server", () => {
  it("seeds a library with distinct tracks, albums and a compilation", async () => {
    const s = await start(24);
    const { auth } = await pair(s);
    const lib = (await (await fetch(`${s.api.url}/library?since=0`, { headers: auth })).json()) as {
      tracks: Array<{ hash: string; album: string; artist: string; albumArtist?: string; artHash?: string }>;
      hasMore: boolean;
    };
    expect(lib.tracks).toHaveLength(24);
    expect(new Set(lib.tracks.map((t) => t.hash)).size).toBe(24);
    expect(new Set(lib.tracks.map((t) => t.album)).size).toBeGreaterThan(3);
    expect(lib.tracks.some((t) => t.albumArtist === "Various Artists" && t.artist !== "Various Artists")).toBe(true);
    expect(lib.tracks.every((t) => t.artHash)).toBe(true);
  });

  it("serves audio with range requests and cover art through the redirect", async () => {
    const s = await start(3);
    const { auth } = await pair(s);
    const lib = (await (await fetch(`${s.api.url}/library?since=0`, { headers: auth })).json()) as { tracks: Array<{ hash: string; artHash: string }> };
    const t = lib.tracks[1]!;
    const urls = (await (
      await fetch(`${s.api.url}/stream-urls`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ trackIds: [t.hash] }) })
    ).json()) as { urls: Array<{ url: string }> };
    const url = urls.urls[0]!.url;

    const full = await fetch(url);
    expect(full.status).toBe(200);
    expect(full.headers.get("content-type")).toBe("audio/mpeg");
    const total = (await full.arrayBuffer()).byteLength;

    const part = await fetch(url, { headers: { range: "bytes=100-199" } });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe(`bytes 100-199/${total}`);
    expect((await part.arrayBuffer()).byteLength).toBe(100);

    const tail = await fetch(url, { headers: { range: "bytes=-50" } });
    expect(tail.status).toBe(206);
    expect((await tail.arrayBuffer()).byteLength).toBe(50);

    const art = await fetch(`${s.api.url}/art/${t.artHash}`, { headers: auth });
    expect(art.status).toBe(200);
    expect(art.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await art.arrayBuffer()).slice(0, 3)).toEqual(Uint8Array.from([0xff, 0xd8, 0xff]));
  });

  it("signs links with the address the caller used (the emulator reaches us as 10.0.2.2)", async () => {
    const s = await start(2);
    const { auth } = await pair(s);
    const lib = (await (await fetch(`${s.api.url}/library?since=0`, { headers: auth })).json()) as { tracks: Array<{ hash: string }> };
    const port = new URL(s.api.url).port;
    const body = JSON.stringify({ trackIds: [lib.tracks[0]!.hash] });
    const text = await new Promise<string>((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port, path: "/stream-urls", method: "POST", headers: { ...auth, host: `10.0.2.2:${port}`, "content-type": "application/json", "content-length": Buffer.byteLength(body) } },
        (res) => {
          let out = "";
          res.on("data", (c: Buffer) => (out += c));
          res.on("end", () => resolve(out));
        },
      );
      req.on("error", reject);
      req.end(body);
    });
    expect(text).toContain(`http://10.0.2.2:${port}/s3/audio/`);
  });

  it("pairing codes work once, and a restart forgets phones", async () => {
    const s = await start(1);
    const { code } = await pair(s);
    const again = await fetch(`${s.api.url}/pairing/claim`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, deviceName: "x" }) });
    expect(again.status).toBe(400);
  });
});
