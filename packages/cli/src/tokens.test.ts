import { describe, expect, it } from "vitest";
import { generateAdminToken, hashToken } from "./tokens";

describe("admin tokens", () => {
  it("has the admin prefix, enough randomness, and no whitespace", () => {
    const token = generateAdminToken();
    expect(token).toMatch(/^cda_[A-Za-z0-9_-]{43}$/);
  });

  it("is different every time", () => {
    expect(generateAdminToken()).not.toBe(generateAdminToken());
  });

  it("hashes with SHA-256 hex (matches the API's check)", () => {
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
