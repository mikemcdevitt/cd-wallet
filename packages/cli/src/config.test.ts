import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configDir, loadConfig, saveConfig, validateName, type DeploymentConfig } from "./config";

const sample: DeploymentConfig = {
  version: 1,
  name: "sandbox",
  accountId: "111111111111",
  region: "us-east-1",
  profile: "cdwallet-sandbox",
  stackName: "CdWallet",
  apiUrl: "https://abc.execute-api.us-east-1.amazonaws.com",
  bucketName: "bucket",
  tableName: "table",
  adminToken: "cda_secret",
  monthlyBudgetUsd: 10,
  deployedAt: "2026-11-07T12:00:00.000Z",
};

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "cdwallet-test-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("config files", () => {
  it("round-trips a config", async () => {
    await saveConfig(sample, dir);
    expect(await loadConfig("sandbox", dir)).toEqual(sample);
  });

  it("returns undefined when there is no config yet", async () => {
    expect(await loadConfig("nothing", dir)).toBeUndefined();
  });

  it("keeps the file private to the owner", async () => {
    await saveConfig(sample, dir);
    const mode = (await stat(path.join(dir, "sandbox.json"))).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("leaves no temp file behind and creates the folder", async () => {
    const nested = path.join(dir, "a", "b");
    await saveConfig(sample, nested);
    await expect(readFile(path.join(nested, "sandbox.json.tmp"))).rejects.toThrow();
  });

  it("reports a corrupt file clearly instead of crashing", async () => {
    await writeFile(path.join(dir, "bad.json"), "{nope");
    await expect(loadConfig("bad", dir)).rejects.toThrow(/not a valid CD Wallet config/);
  });

  it("rejects names that could escape the folder", () => {
    for (const name of ["../x", "a/b", "", "UPPER", "-lead"]) expect(() => validateName(name)).toThrow();
    expect(validateName("my-test-1")).toBe("my-test-1");
  });

  it("uses ~/.cdwallet unless CDWALLET_HOME is set", () => {
    expect(configDir({}, "/home/m")).toBe("/home/m/.cdwallet");
    expect(configDir({ CDWALLET_HOME: "/tmp/x" }, "/home/m")).toBe("/tmp/x");
  });
});
