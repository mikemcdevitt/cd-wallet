import { MemoryStore, route, sha256Hex, type Storage } from "@cdwallet/api";
import { describe, expect, it } from "vitest";
import { createApiClient } from "./api-client";
import { claimAndStore, loadCredentials, type SecretStore } from "./pairing-flow";
import { SqlLibrary } from "./sql-library";
import { StreamUrlResolver } from "./stream-urls";
import { syncLibrary } from "./sync";
import { makeTrack, nodeSqlDb } from "./testing";

const ADMIN = "cda_test-admin-token";
const API = "https://api.test";

/** The real API handlers behind a fetch function, with an in-memory database. */
function realServer() {
  const store = new MemoryStore();
  store.setAdminTokenHash(sha256Hex(ADMIN));
  const storage: Storage = {
    objectExists: async () => true,
    presignPut: async (r) => `https://s3.test/put/${r.key}`,
    presignGet: async (key) => `https://s3.test/get/${key}?sig=1`,
  };
  const now = new Date("2026-11-07T12:00:00Z");
  const fetchImpl = (async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const out = await route(
      {
        method: init.method ?? "GET",
        path: url.pathname,
        headers,
        query: Object.fromEntries(url.searchParams),
        ...(init.body ? { body: String(init.body) } : {}),
      },
      { store, storage, now: () => now, libraryOverlap: 0, libraryPageSize: 3 },
    );
    return new Response(out.statusCode === 204 ? null : out.body, { status: out.statusCode, headers: out.headers });
  }) as unknown as typeof fetch;
  const admin = createApiClient({ apiUrl: API, token: ADMIN, fetch: fetchImpl });
  return { fetchImpl, admin, store };
}

function memorySecrets(): SecretStore {
  const m = new Map<string, string>();
  return { get: async (k) => m.get(k) ?? null, set: async (k, v) => void m.set(k, v), delete: async (k) => void m.delete(k) };
}

async function post(fetchImpl: typeof fetch, path: string, body: unknown) {
  const res = await fetchImpl(`${API}${path}`, { method: "POST", headers: { authorization: `Bearer ${ADMIN}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  expect(res.ok).toBe(true);
  return res.json();
}

describe("app against the real API handlers", () => {
  it("pairs with a one-time code, syncs the library in pages, and gets stream links", async () => {
    const { fetchImpl } = realServer();
    const tracks = Array.from({ length: 7 }, (_, i) => makeTrack(i + 1, { artHash: i === 0 ? "a".repeat(64) : undefined }));
    for (const t of tracks) await post(fetchImpl, "/tracks", t);

    const { code } = (await post(fetchImpl, "/pairing", { deviceName: "Pixel" })) as { code: string };
    const secrets = memorySecrets();
    const creds = await claimAndStore({ apiUrl: API, code }, "Pixel", secrets, fetchImpl);
    expect(creds.deviceToken.startsWith("cdd_")).toBe(true);
    expect(await loadCredentials(secrets)).toEqual(creds);

    // The code works once only.
    await expect(claimAndStore({ apiUrl: API, code }, "Again", memorySecrets(), fetchImpl)).rejects.toMatchObject({ code: "invalid_code" });

    const client = createApiClient({ apiUrl: creds.apiUrl, token: creds.deviceToken, fetch: fetchImpl });
    const library = await SqlLibrary.open(nodeSqlDb());
    const result = await syncLibrary(client, library);
    expect(result.pages).toBe(3); // 7 tracks, 3 per page
    expect(await library.count()).toBe(7);

    const resolver = new StreamUrlResolver(client, () => new Date("2026-11-07T12:00:00Z").getTime());
    const [url] = await resolver.resolve([tracks[0]!.hash]);
    expect(url).toContain(`audio/${tracks[0]!.hash}.mp3`);

    // A second sync finds nothing new.
    expect((await syncLibrary(client, library)).tracksReceived).toBe(0);
  });

  it("a revoked device is told it is no longer allowed", async () => {
    const { fetchImpl } = realServer();
    const { code } = (await post(fetchImpl, "/pairing", {})) as { code: string };
    const creds = await claimAndStore({ apiUrl: API, code }, "Pixel", memorySecrets(), fetchImpl);
    const del = await fetchImpl(`${API}/devices/${creds.deviceId}`, { method: "DELETE", headers: { authorization: `Bearer ${ADMIN}` } });
    expect(del.status).toBe(204);
    const client = createApiClient({ apiUrl: API, token: creds.deviceToken, fetch: fetchImpl });
    await expect(client.library(0)).rejects.toMatchObject({ status: 401 });
  });
});
