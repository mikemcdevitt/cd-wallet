import { buildPairingLink } from "@cdwallet/shared";
import { describe, expect, it } from "vitest";
import { claimAndStore, loadCredentials, parsePairingText, validateManualPairing, type SecretStore } from "./pairing-flow";
import { jsonResponse } from "./testing";

function memoryStore(): SecretStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => void data.set(k, v),
    delete: async (k) => void data.delete(k),
  };
}

describe("pairing flow", () => {
  it("reads a scanned link", () => {
    const link = buildPairingLink({ api: "https://abc.execute-api.us-east-1.amazonaws.com/", code: "abcd efgh jkmn" });
    expect(parsePairingText(link)).toEqual({ apiUrl: "https://abc.execute-api.us-east-1.amazonaws.com", code: "ABCDEFGHJKMN" });
    expect(parsePairingText("https://example.com")).toBeUndefined();
  });

  it("validates hand-typed input", () => {
    expect(validateManualPairing("nonsense", "ABCD-EFGH-JKMN")).toMatch(/API address/);
    expect(validateManualPairing("https://x.example/", "short")).toMatch(/12 letters/);
    expect(validateManualPairing(" https://x.example/ ", "abcd-efgh-jkmn")).toEqual({ apiUrl: "https://x.example", code: "ABCDEFGHJKMN" });
  });

  it("claims the code and keeps the credentials", async () => {
    const store = memoryStore();
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      expect(JSON.parse(String(init.body))).toEqual({ code: "ABCDEFGHJKMN", deviceName: "Pixel 9" });
      return jsonResponse({ deviceId: "0123456789abcdef", deviceToken: "cdd_0123456789abcdef.s3cret" });
    }) as unknown as typeof fetch;
    const creds = await claimAndStore({ apiUrl: "https://x.example", code: "ABCDEFGHJKMN" }, "Pixel 9", store, fetchImpl);
    expect(creds.deviceToken).toBe("cdd_0123456789abcdef.s3cret");
    expect(await loadCredentials(store)).toEqual(creds);
  });

  it("stores nothing when the claim fails", async () => {
    const store = memoryStore();
    const fetchImpl = (async () => jsonResponse({ error: { code: "invalid_code", message: "x" } }, 400)) as unknown as typeof fetch;
    await expect(claimAndStore({ apiUrl: "https://x.example", code: "ABCDEFGHJKMN" }, "P", store, fetchImpl)).rejects.toThrow();
    expect(await loadCredentials(store)).toBeUndefined();
  });

  it("treats damaged stored credentials as not paired", async () => {
    const store = memoryStore();
    store.data.set("cdwallet.credentials", "{oops");
    expect(await loadCredentials(store)).toBeUndefined();
  });
});
