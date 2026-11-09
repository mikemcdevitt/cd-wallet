import type { ClaimPairingResponse, CreatePairingResponse, LibraryResponse, ListDevicesResponse } from "@cdwallet/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { makeHarness, parse } from "./testing/harness";

let h: ReturnType<typeof makeHarness>;
beforeEach(() => {
  h = makeHarness();
});

const pair = async (deviceName?: string) =>
  parse<CreatePairingResponse>(await h.call("POST", "/pairing", deviceName ? { body: { deviceName } } : {}));

const claim = (code: string, body: Record<string, unknown> = { deviceName: "Pixel 8" }) =>
  h.call("POST", "/pairing/claim", { token: null, body: { code, ...body } });

describe("creating a pairing code", () => {
  it("returns a grouped code that expires in five minutes", async () => {
    const res = await h.call("POST", "/pairing");
    expect(res.statusCode).toBe(201);
    const body = parse<CreatePairingResponse>(res);
    expect(body.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(body.expiresAt).toBe("2026-11-07T12:05:00.000Z");
  });

  it("is owner-only", async () => {
    expect((await h.call("POST", "/pairing", { token: null })).statusCode).toBe(401);
  });

  it("rejects a bad device name", async () => {
    expect((await h.call("POST", "/pairing", { body: { deviceName: "x".repeat(101) } })).statusCode).toBe(400);
  });
});

describe("claiming a code", () => {
  it("gives the phone a read-only token that works", async () => {
    const { code } = await pair();
    const res = await claim(code);
    expect(res.statusCode).toBe(201);
    const { deviceId, deviceToken } = parse<ClaimPairingResponse>(res);
    expect(deviceId).toMatch(/^[0-9a-f]{16}$/);
    expect(deviceToken.startsWith(`cdd_${deviceId}.`)).toBe(true);

    await h.addTrack(1);
    expect((await h.call("GET", "/library", { token: deviceToken })).statusCode).toBe(200);
    expect(parse<LibraryResponse>(await h.call("GET", "/library", { token: deviceToken })).tracks).toHaveLength(1);
    expect((await h.call("POST", "/tracks/check", { token: deviceToken, body: { hashes: [] } })).statusCode).toBe(403);
    expect((await h.call("POST", "/pairing", { token: deviceToken })).statusCode).toBe(403);
  });

  it("accepts the code typed loosely", async () => {
    const { code } = await pair();
    const sloppy = code.toLowerCase().replaceAll("-", " ");
    expect((await claim(sloppy)).statusCode).toBe(201);
  });

  it("works only once", async () => {
    const { code } = await pair();
    expect((await claim(code)).statusCode).toBe(201);
    const again = await claim(code);
    expect(again.statusCode).toBe(400);
    expect(parse<{ error: { code: string } }>(again).error.code).toBe("invalid_code");
  });

  it("stops working after five minutes", async () => {
    const { code } = await pair();
    h.advance(5 * 60 * 1000);
    expect((await claim(code)).statusCode).toBe(400);
  });

  it("works right up to the deadline", async () => {
    const { code } = await pair();
    h.advance(5 * 60 * 1000 - 1000);
    expect((await claim(code)).statusCode).toBe(201);
  });

  it("gives the same answer for wrong, malformed and missing codes", async () => {
    await pair();
    for (const code of ["ABCD-EFGH-JKMN", "short", ""]) {
      const res = await claim(code);
      expect(res.statusCode).toBe(400);
      expect(parse<{ error: { code: string } }>(res).error.code).toBe("invalid_code");
    }
    expect((await h.call("POST", "/pairing/claim", { token: null, body: {} })).statusCode).toBe(400);
    expect((await h.call("POST", "/pairing/claim", { token: null, rawBody: "{nope" })).statusCode).toBe(400);
  });

  it("names the device from the phone, then the owner's name, then a default", async () => {
    const a = await pair("Owner's name");
    await claim(a.code, { deviceName: "Phone's name" });
    const b = await pair("Owner's name");
    await claim(b.code, {});
    const c = await pair();
    await claim(c.code, {});

    const { devices } = parse<ListDevicesResponse>(await h.call("GET", "/devices"));
    expect(devices.map((d) => d.name)).toEqual(["Phone's name", "Owner's name", "Phone"]);
  });
});

describe("devices", () => {
  it("are listed for the owner without their token hashes", async () => {
    await claim((await pair()).code);
    h.advance(1000);
    await claim((await pair()).code, { deviceName: "Tablet" });

    const res = await h.call("GET", "/devices");
    expect(res.statusCode).toBe(200);
    const { devices } = parse<ListDevicesResponse>(res);
    expect(devices.map((d) => d.name)).toEqual(["Pixel 8", "Tablet"]);
    expect(res.body).not.toContain("tokenHash");
    expect(res.body).not.toContain("cdd_");
  });

  it("cannot be listed by a phone", async () => {
    const { deviceToken } = parse<ClaimPairingResponse>(await claim((await pair()).code));
    expect((await h.call("GET", "/devices", { token: deviceToken })).statusCode).toBe(403);
  });

  it("can be revoked, which ends that phone's access at once", async () => {
    const { deviceId, deviceToken } = parse<ClaimPairingResponse>(await claim((await pair()).code));
    expect((await h.call("GET", "/library", { token: deviceToken })).statusCode).toBe(200);

    const res = await h.call("DELETE", `/devices/${deviceId}`);
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe("");
    expect((await h.call("GET", "/library", { token: deviceToken })).statusCode).toBe(401);
    expect(parse<ListDevicesResponse>(await h.call("GET", "/devices")).devices).toEqual([]);
  });

  it("report 404 when revoking something that is not there", async () => {
    expect((await h.call("DELETE", `/devices/${"0".repeat(16)}`)).statusCode).toBe(404);
    expect((await h.call("DELETE", "/devices/nope")).statusCode).toBe(404);
  });

  it("can only be revoked by the owner", async () => {
    const { deviceId, deviceToken } = parse<ClaimPairingResponse>(await claim((await pair()).code));
    expect((await h.call("DELETE", `/devices/${deviceId}`, { token: deviceToken })).statusCode).toBe(403);
    expect((await h.call("DELETE", `/devices/${deviceId}`, { token: null })).statusCode).toBe(401);
  });

  it("record when they were last used, but only about once an hour", async () => {
    const { deviceId, deviceToken } = parse<ClaimPairingResponse>(await claim((await pair()).code));
    expect((await h.store.getDevice(deviceId))?.lastSeenAt).toBeUndefined();

    await h.call("GET", "/library", { token: deviceToken });
    const first = (await h.store.getDevice(deviceId))?.lastSeenAt;
    expect(first).toBe("2026-11-07T12:00:00.000Z");

    h.advance(10 * 60 * 1000);
    await h.call("GET", "/library", { token: deviceToken });
    expect((await h.store.getDevice(deviceId))?.lastSeenAt).toBe(first);

    h.advance(61 * 60 * 1000);
    await h.call("GET", "/library", { token: deviceToken });
    expect((await h.store.getDevice(deviceId))?.lastSeenAt).toBe("2026-11-07T13:11:00.000Z");
  });
});
