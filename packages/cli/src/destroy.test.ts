import { mkdtemp, rm, stat } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Target } from "./aws";
import type { DestroyOps } from "./aws-destroy";
import { listConfigNames, saveConfig, type DeploymentConfig } from "./config";
import { importCommand, resolveDeploymentName } from "./deployment";
import { parseDestroyArgs, runDestroy, type DestroyDeps } from "./destroy";

const ACCOUNT = "1".repeat(12);
const target: Target = { accountId: ACCOUNT, region: "us-east-1", arn: "arn:aws:iam::111111111111:user/me" };

let home: string;
let calls: string[];
let out: string[];
let stack: string | undefined;

const config = (name: string): DeploymentConfig => ({
  version: 1, name, accountId: ACCOUNT, region: "us-east-1", stackName: "CdWallet",
  apiUrl: "https://x", bucketName: `bucket-${name}`, tableName: `table-${name}`, adminToken: "cda_x",
  monthlyBudgetUsd: 10, deployedAt: "2026-11-07T12:00:00.000Z",
});

const ops: DestroyOps = {
  stackStatus: async () => stack,
  logGroupName: async () => "/aws/lambda/CdWallet-Api-123",
  deleteStack: async () => void calls.push("deleteStack"),
  countObjects: async (b) => (calls.push(`count:${b}`), 42),
  emptyAndDeleteBucket: async (b) => (calls.push(`bucket:${b}`), 3),
  deleteTable: async (t) => void calls.push(`table:${t}`),
};

function deps(over: Partial<DestroyDeps> = {}): Partial<DestroyDeps> {
  return {
    env: { CDWALLET_HOME: home },
    log: (l) => void out.push(l),
    interactive: () => true,
    ask: async () => "",
    confirm: async () => true,
    resolveTarget: async () => target,
    opsFor: () => ops,
    ...over,
  };
}

const exists = (file: string) => stat(file).then(() => true, () => false);

beforeEach(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), "cdw-destroy-"));
  calls = [];
  out = [];
  stack = "CREATE_COMPLETE";
  await saveConfig(config("test"), home);
});
afterEach(() => rm(home, { recursive: true, force: true }));

describe("parseDestroyArgs", () => {
  it("defaults to keeping the data", () => {
    expect(parseDestroyArgs([], {})).toEqual({ deleteData: false, dryRun: false, yes: false, help: false });
  });
  it("only accepts --confirm-bucket with --delete-data", () => {
    expect(() => parseDestroyArgs(["--confirm-bucket", "b"], {})).toThrow(/--delete-data/);
    expect(parseDestroyArgs(["--delete-data", "--confirm-bucket", "b"], {}).confirmBucket).toBe("b");
  });
  it("rejects unknown flags", () => {
    expect(() => parseDestroyArgs(["--bogus"], {})).toThrow(/Usage: cdwallet destroy/);
  });
});

describe("cdwallet destroy --dry-run", () => {
  it("changes nothing and asks nothing", async () => {
    await runDestroy(["--dry-run"], deps({ interactive: () => false }));
    expect(calls).toEqual([]);
    expect(out.join("\n")).toMatch(/Dry run: nothing was changed/);
    expect(await listConfigNames(home)).toEqual(["test"]);
  });

  it("with --delete-data also counts the files, without deleting anything", async () => {
    await runDestroy(["--delete-data", "--dry-run"], deps({ interactive: () => false }));
    expect(calls).toEqual(["count:bucket-test"]);
    expect(out.join("\n")).toMatch(/holds 42 objects/);
    expect(await listConfigNames(home)).toEqual(["test"]);
  });

  it("works when the stack is already gone", async () => {
    stack = undefined;
    await runDestroy(["--delete-data", "--dry-run"], deps());
    expect(calls).toEqual(["count:bucket-test"]);
  });
});

describe("cdwallet destroy", () => {
  it("removes only the stack by default and keeps the settings", async () => {
    await runDestroy(["--yes"], deps());
    expect(calls).toEqual(["deleteStack"]);
    expect(await listConfigNames(home)).toEqual(["test"]);
    expect(out.join("\n")).toMatch(/Kept:[\s\S]*bucket-test/);
  });

  it("asks before removing the stack and cancels on no", async () => {
    await runDestroy([], deps({ confirm: async () => false }));
    expect(calls).toEqual([]);
  });

  it("refuses to run without a terminal unless told to", async () => {
    await expect(runDestroy([], deps({ interactive: () => false }))).rejects.toThrow(/--yes/);
    expect(calls).toEqual([]);
  });

  it("says so when the stack is already gone", async () => {
    stack = undefined;
    await runDestroy(["--yes"], deps());
    expect(calls).toEqual([]);
    expect(out.join("\n")).toMatch(/already gone/);
  });

  it("refuses when the credentials point at another account", async () => {
    await expect(
      runDestroy(["--yes"], deps({ resolveTarget: async () => ({ ...target, accountId: "2".repeat(12) }) })),
    ).rejects.toThrow(/was set up in account/);
    expect(calls).toEqual([]);
  });

  it("needs the saved settings to know what to delete", async () => {
    await expect(runDestroy(["--name", "nope", "--yes"], deps())).rejects.toThrow(/No saved deployment/);
  });

  describe("--delete-data", () => {
    it("is cancelled unless the bucket name is typed exactly, even with --yes", async () => {
      await runDestroy(["--delete-data", "--yes"], deps({ ask: async () => "yes" }));
      expect(calls).toEqual([]);
      expect(await listConfigNames(home)).toEqual(["test"]);
    });

    it("deletes everything, in order, and removes the settings after typing the bucket name", async () => {
      await runDestroy(["--delete-data"], deps({ ask: async () => "bucket-test" }));
      expect(calls).toEqual(["deleteStack", "bucket:bucket-test", "table:table-test"]);
      expect(await listConfigNames(home)).toEqual([]);
      expect(out.join("\n")).toMatch(/aws logs delete-log-group --log-group-name \/aws\/lambda\/CdWallet-Api-123/);
    });

    it("works without a terminal when --confirm-bucket matches", async () => {
      await runDestroy(["--delete-data", "--confirm-bucket", "bucket-test"], deps({ interactive: () => false }));
      expect(calls).toContain("table:table-test");
    });

    it("rejects a wrong --confirm-bucket before touching anything", async () => {
      await expect(runDestroy(["--delete-data", "--confirm-bucket", "other"], deps())).rejects.toThrow(/does not match/);
      expect(calls).toEqual([]);
    });

    it("refuses without a terminal or --confirm-bucket", async () => {
      await expect(runDestroy(["--delete-data"], deps({ interactive: () => false }))).rejects.toThrow(/--confirm-bucket/);
    });

    it("finishes the cleanup after an earlier stack-only destroy", async () => {
      stack = undefined;
      await runDestroy(["--delete-data", "--confirm-bucket", "bucket-test"], deps());
      expect(calls).toEqual(["bucket:bucket-test", "table:table-test"]);
      expect(await exists(path.join(home, "test.json"))).toBe(false);
    });
  });
});

describe("resolveDeploymentName", () => {
  it("prefers an explicit name or CDWALLET_NAME", async () => {
    expect(await resolveDeploymentName("a", {}, home)).toBe("a");
    expect(await resolveDeploymentName(undefined, { CDWALLET_NAME: "b" }, home)).toBe("b");
  });
  it("uses the only saved deployment when there is no default", async () => {
    expect(await resolveDeploymentName(undefined, {}, home)).toBe("test");
  });
  it("prefers default when it exists", async () => {
    await saveConfig(config("default"), home);
    expect(await resolveDeploymentName(undefined, {}, home)).toBe("default");
  });
  it("asks for --name when several are saved and none is default", async () => {
    await saveConfig(config("other"), home);
    await expect(resolveDeploymentName(undefined, {}, home)).rejects.toThrow(/other, test/);
  });
  it("falls back to default when nothing is saved", async () => {
    const empty = path.join(home, "none");
    expect(await resolveDeploymentName(undefined, {}, empty)).toBe("default");
  });
});

describe("importCommand", () => {
  it("includes --name only when needed", () => {
    expect(importCommand("default")).toBe("pnpm cdwallet import ~/Music");
    expect(importCommand("test")).toBe("pnpm cdwallet import ~/Music --name test");
  });
});
