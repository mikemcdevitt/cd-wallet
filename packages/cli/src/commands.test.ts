import { mkdtemp, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { ClaimPairingResponse, Device } from "@cdwallet/shared";
import { parsePairingLink } from "@cdwallet/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveConfig, type DeploymentConfig } from "./config";
import { formatDevices, resolveDeviceId, runDevices } from "./devices";
import { runPair } from "./pair";
import { configAfterReset } from "./reset-token";
import { startLocalApi, type LocalApi } from "./testing/local-api";

const TOKEN = "cda_test-token";
let api: LocalApi;
let home: string;
let env: NodeJS.ProcessEnv;
let out: string[];

beforeEach(async () => {
  api = await startLocalApi(TOKEN);
  home = await mkdtemp(path.join(os.tmpdir(), "cdw-cmd-"));
  env = { CDWALLET_HOME: home };
  out = [];
  const config: DeploymentConfig = {
    version: 1, name: "default", accountId: "1".repeat(12), region: "us-east-1", stackName: "CdWallet",
    apiUrl: api.url, bucketName: "b", tableName: "t", adminToken: TOKEN, monthlyBudgetUsd: 10,
    deployedAt: "2026-11-07T12:00:00.000Z",
  };
  await saveConfig(config, home);
});
afterEach(async () => {
  await api.close();
  await rm(home, { recursive: true, force: true });
});

const io = () => ({ env, log: (line: string) => void out.push(line) });
const text = () => out.join("\n");

/** What the phone does after scanning. */
async function phoneClaims(code: string, deviceName = "Pixel 8"): Promise<ClaimPairingResponse> {
  const res = await fetch(`${api.url}/pairing/claim`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, deviceName }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as ClaimPairingResponse;
}

describe("cdwallet pair", () => {
  it("prints a QR code, the code, and a link the app can open", async () => {
    await runPair(["--no-wait"], io());

    const link = /Link\s+(cdwallet:\/\/\S+)/.exec(text())?.[1];
    expect(link).toBeDefined();
    const parsed = parsePairingLink(link ?? "");
    expect(parsed?.api).toBe(api.url);
    expect(text()).toMatch(/Code\s+[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}/);
    expect(text()).toMatch(/[█▀▄]/); // the QR code itself
    expect(text()).not.toContain("Waiting for the phone");
  });

  it("waits for the phone and reports it", async () => {
    let now = new Date("2026-11-07T12:00:00Z");
    let claimed = false;
    await runPair([], {
      ...io(),
      now: () => now,
      sleep: async (ms) => {
        now = new Date(now.getTime() + ms);
        if (!claimed) {
          claimed = true;
          const code = /Code\s+(\S+)/.exec(text())?.[1] ?? "";
          await phoneClaims(code);
        }
      },
    });
    expect(text()).toMatch(/Paired: Pixel 8 \([0-9a-f]{16}\)/);
  });

  it("gives up when the code expires", async () => {
    let now = new Date("2026-11-07T12:00:00Z");
    await expect(
      runPair([], { ...io(), now: () => now, sleep: async (ms) => void (now = new Date(now.getTime() + ms * 100)) }),
    ).rejects.toThrow(/expired/);
  });

  it("needs a deployment and rejects unknown options", async () => {
    await expect(runPair(["--name", "other"], io())).rejects.toThrow(/cdwallet deploy/);
    await expect(runPair(["--bogus"], io())).rejects.toThrow(/Usage: cdwallet pair/);
  });
});

describe("cdwallet devices", () => {
  async function pairOne(name: string): Promise<ClaimPairingResponse> {
    await runPair(["--no-wait"], io());
    const code = [...text().matchAll(/Code\s+(\S+)/g)].at(-1)?.[1] ?? "";
    return phoneClaims(code, name);
  }

  it("says so when nothing is paired", async () => {
    await runDevices([], io());
    expect(text()).toContain("No phones are paired");
  });

  it("lists paired phones", async () => {
    const phone = await pairOne("Pixel 8");
    await runDevices([], io());
    expect(text()).toContain("Pixel 8");
    expect(text()).toContain(phone.deviceId);
    expect(text()).not.toContain("cdd_");
  });

  it("revokes a phone by full id or a short start of it, and its token stops working", async () => {
    const phone = await pairOne("Pixel 8");
    out = [];
    await runDevices(["revoke", phone.deviceId.slice(0, 6)], io());
    expect(text()).toContain("Revoked Pixel 8");

    const res = await fetch(`${api.url}/library`, { headers: { authorization: `Bearer ${phone.deviceToken}` } });
    expect(res.status).toBe(401);
    out = [];
    await runDevices([], io());
    expect(text()).toContain("No phones are paired");
  });

  it("explains what went wrong for a bad id", async () => {
    await pairOne("Pixel 8");
    await expect(runDevices(["revoke", "zzzz"], io())).rejects.toThrow(/No paired phone matches/);
    await expect(runDevices(["revoke"], io())).rejects.toThrow(/which phone/);
    await expect(runDevices(["frobnicate"], io())).rejects.toThrow(/Unknown arguments/);
  });
});

describe("device helpers", () => {
  const devices: Device[] = [
    { id: "aaaa111122223333", name: "Pixel", pairedAt: "2026-11-07T12:00:00.000Z", lastSeenAt: "2026-11-08T09:30:00.000Z" },
    { id: "aaaa999988887777", name: "Tablet", pairedAt: "2026-11-07T13:00:00.000Z" },
  ];

  it("formats a table with 'never' for unused phones", () => {
    const table = formatDevices(devices);
    expect(table.split("\n")[0]).toMatch(/^Name\s+ID\s+Paired\s+Last used$/);
    expect(table).toContain("2026-11-08 09:30 UTC");
    expect(table).toMatch(/Tablet\s+aaaa999988887777\s+2026-11-07 13:00 UTC\s+never/);
  });

  it("resolves ids by prefix only when unambiguous", () => {
    expect(resolveDeviceId(devices, "aaaa1")).toBe("aaaa111122223333");
    expect(resolveDeviceId(devices, "AAAA9999")).toBe("aaaa999988887777");
    expect(() => resolveDeviceId(devices, "aaaa")).toThrow(/more than one/);
    expect(() => resolveDeviceId(devices, "aa")).toThrow(/No paired phone/);
  });
});

describe("reset-token config", () => {
  const target = { accountId: "2".repeat(12), region: "us-west-2", arn: "arn", profile: "p" };
  const outputs = { apiUrl: "https://x.test", bucketName: "bkt", tableName: "tbl" };

  it("keeps known settings and fills the rest from the stack", () => {
    const saved = { monthlyBudgetUsd: 25, ownerEmail: "a@b.co", maintainerAccountId: "123456789012", deployedAt: "2026-01-01T00:00:00.000Z" } as DeploymentConfig;
    expect(configAfterReset("default", target, outputs, "cda_new", saved)).toMatchObject({
      adminToken: "cda_new", apiUrl: "https://x.test", tableName: "tbl", profile: "p",
      monthlyBudgetUsd: 25, ownerEmail: "a@b.co", maintainerAccountId: "123456789012", deployedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("works on a computer that has never seen this deployment", () => {
    const config = configAfterReset("default", target, outputs, "cda_new", undefined, new Date("2026-11-09T00:00:00Z"));
    expect(config).toMatchObject({ monthlyBudgetUsd: 10, deployedAt: "2026-11-09T00:00:00.000Z", accountId: target.accountId });
    expect(config).not.toHaveProperty("ownerEmail");
  });
});
