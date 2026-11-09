import { describe, expect, it } from "vitest";
import { ApiError, createApiClient, describeApiError, isAuthRevoked } from "./api-client";
import { jsonResponse } from "./testing";

function recorder(respond: () => Response | Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond();
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe("api client", () => {
  it("sends the device token and paging cursor", async () => {
    const { calls, fetchImpl } = recorder(() => jsonResponse({ version: 3, tracks: [], deletedIds: [], hasMore: false }));
    const client = createApiClient({ apiUrl: "https://x.example/api/", token: "cdd_abc.secret", fetch: fetchImpl });
    await client.library(2);
    expect(calls[0]?.url).toBe("https://x.example/api/library?since=2");
    expect((calls[0]?.init.headers as Record<string, string>).authorization).toBe("Bearer cdd_abc.secret");
  });

  it("posts stream-url requests as JSON", async () => {
    const { calls, fetchImpl } = recorder(() => jsonResponse({ urls: [] }));
    await createApiClient({ apiUrl: "https://x.example", token: "t", fetch: fetchImpl }).streamUrls(["a", "b"]);
    expect(calls[0]?.init.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ trackIds: ["a", "b"] });
  });

  it("claims a pairing code without a token", async () => {
    const { calls, fetchImpl } = recorder(() => jsonResponse({ deviceId: "d", deviceToken: "cdd_d.s" }));
    const res = await createApiClient({ apiUrl: "https://x.example", fetch: fetchImpl }).claimPairing("ABCD", "Pixel");
    expect(res.deviceId).toBe("d");
    expect((calls[0]?.init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it("turns server errors into ApiError", async () => {
    const { fetchImpl } = recorder(() => jsonResponse({ error: { code: "invalid_code", message: "nope" } }, 400));
    const err = await createApiClient({ apiUrl: "https://x.example", fetch: fetchImpl }).claimPairing("x", "y").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: "invalid_code" });
    expect(describeApiError(err)).toContain("pairing code");
  });

  it("copes with non-JSON error pages and network failures", async () => {
    const bad = recorder(() => new Response("<html>bad gateway</html>", { status: 502 }));
    await expect(createApiClient({ apiUrl: "https://x", fetch: bad.fetchImpl }).library(0)).rejects.toMatchObject({ status: 502, code: "http_error" });
    const down = createApiClient({
      apiUrl: "https://x",
      fetch: (async () => {
        throw new TypeError("Network request failed");
      }) as unknown as typeof fetch,
    });
    await expect(down.library(0)).rejects.toMatchObject({ status: 0, code: "network" });
  });

  it("gives up when the server never answers", async () => {
    const hangs = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as unknown as typeof fetch;
    const client = createApiClient({ apiUrl: "https://x.example", fetch: hangs, timeoutMs: 20 });
    await expect(client.library(0)).rejects.toMatchObject({ status: 0, code: "timeout" });
  });

  it("recognises a revoked device", () => {
    expect(isAuthRevoked(new ApiError(401, "unauthorized", "x"))).toBe(true);
    expect(isAuthRevoked(new ApiError(500, "x", "x"))).toBe(false);
  });
});
