import { describe, expect, it } from "vitest";
import { buildPairingLink, formatPairingCode, isPairingCode, normalizePairingCode, parsePairingLink } from "./pairing";

describe("pairing codes", () => {
  it("normalizes case, dashes, spaces and look-alike letters", () => {
    expect(normalizePairingCode("abcd-efgh-jkmn")).toBe("ABCDEFGHJKMN");
    expect(normalizePairingCode(" 0o1i-l234 5678 ")).toBe("001112345678");
  });

  it("recognizes valid codes only", () => {
    expect(isPairingCode("ABCDEFGHJKMN")).toBe(true);
    expect(isPairingCode("ABCDEFGHJKM")).toBe(false);
    expect(isPairingCode("ABCDEFGHJKMU")).toBe(false); // U is not in the alphabet
  });

  it("formats in groups of four", () => {
    expect(formatPairingCode("ABCDEFGHJKMN")).toBe("ABCD-EFGH-JKMN");
  });
});

describe("pairing links", () => {
  const payload = { api: "https://abc.execute-api.us-east-1.amazonaws.com", code: "abcdefghjkmn" };

  it("round-trips", () => {
    const link = buildPairingLink(payload);
    expect(link).toBe("cdwallet://pair?api=https%3A%2F%2Fabc.execute-api.us-east-1.amazonaws.com&code=ABCD-EFGH-JKMN");
    expect(parsePairingLink(link)).toEqual({ api: payload.api, code: "ABCDEFGHJKMN" });
  });

  it("trims a trailing slash on the api address", () => {
    expect(parsePairingLink(buildPairingLink({ ...payload, api: `${payload.api}/` }))?.api).toBe(payload.api);
  });

  it("rejects anything that is not a pairing link", () => {
    for (const bad of [
      "",
      "https://example.com/?api=x&code=ABCDEFGHJKMN",
      "cdwallet://other?api=https%3A%2F%2Fx.test&code=ABCDEFGHJKMN",
      "cdwallet://pair?code=ABCDEFGHJKMN",
      "cdwallet://pair?api=https%3A%2F%2Fx.test&code=SHORT",
      "cdwallet://pair?api=javascript%3Aalert(1)&code=ABCDEFGHJKMN",
      "cdwallet://pair?api=notaurl&code=ABCDEFGHJKMN",
    ]) {
      expect(parsePairingLink(bad), bad).toBeUndefined();
    }
  });
});
