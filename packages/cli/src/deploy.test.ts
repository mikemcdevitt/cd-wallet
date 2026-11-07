import { describe, expect, it } from "vitest";
import { planAdminToken } from "./admin-token";
import { describeError } from "./errors";
import { contextArgs, parseStackOutputs } from "./cdk";
import type { DeploymentConfig } from "./config";
import { effectiveSettings, parseDeployArgs } from "./options";
import { hashToken } from "./tokens";

describe("parseDeployArgs", () => {
  it("has sensible defaults", () => {
    expect(parseDeployArgs([], {})).toEqual({ name: "default", yes: false, help: false });
  });

  it("reads flags and falls back to AWS_PROFILE and CDWALLET_NAME", () => {
    const opts = parseDeployArgs(
      ["--region", "us-west-2", "--owner-email", "me@example.com", "--budget", "25", "--maintainer-account", "123456789012", "-y"],
      { AWS_PROFILE: "p", CDWALLET_NAME: "sandbox" },
    );
    expect(opts).toEqual({
      name: "sandbox",
      profile: "p",
      region: "us-west-2",
      ownerEmail: "me@example.com",
      monthlyBudgetUsd: 25,
      maintainerAccountId: "123456789012",
      yes: true,
      help: false,
    });
  });

  it("prefers --profile over AWS_PROFILE", () => {
    expect(parseDeployArgs(["--profile", "a"], { AWS_PROFILE: "b" }).profile).toBe("a");
  });

  it("rejects bad values with a clear message", () => {
    expect(() => parseDeployArgs(["--owner-email", "nope"], {})).toThrow(/email/);
    expect(() => parseDeployArgs(["--budget", "-5"], {})).toThrow(/budget/);
    expect(() => parseDeployArgs(["--budget", "abc"], {})).toThrow(/budget/);
    expect(() => parseDeployArgs(["--maintainer-account", "123"], {})).toThrow(/12-digit/);
    expect(() => parseDeployArgs(["--bogus"], {})).toThrow(/Usage: cdwallet deploy/);
    expect(() => parseDeployArgs(["--name", "../x"], {})).toThrow(/Invalid deployment name/);
  });
});

describe("effectiveSettings", () => {
  const saved = {
    ownerEmail: "old@example.com",
    monthlyBudgetUsd: 30,
    maintainerAccountId: "999999999999",
  } as DeploymentConfig;

  it("defaults to a $10 budget with no email", () => {
    expect(effectiveSettings(parseDeployArgs([], {}))).toEqual({ monthlyBudgetUsd: 10 });
  });

  it("keeps what the last deploy used, so a redeploy does not remove the budget alert", () => {
    expect(effectiveSettings(parseDeployArgs([], {}), saved)).toEqual({
      ownerEmail: "old@example.com",
      monthlyBudgetUsd: 30,
      maintainerAccountId: "999999999999",
    });
  });

  it("lets flags override saved settings", () => {
    const next = effectiveSettings(parseDeployArgs(["--owner-email", "new@example.com", "--budget", "5"], {}), saved);
    expect(next.ownerEmail).toBe("new@example.com");
    expect(next.monthlyBudgetUsd).toBe(5);
  });
});

describe("cdk helpers", () => {
  it("builds context flags only for settings that are set", () => {
    expect(contextArgs({ monthlyBudgetUsd: 10 })).toEqual(["-c", "monthlyBudgetUsd=10"]);
    expect(contextArgs({ monthlyBudgetUsd: 10, ownerEmail: "a@b.co", maintainerAccountId: "123456789012" })).toEqual([
      "-c", "monthlyBudgetUsd=10", "-c", "ownerEmail=a@b.co", "-c", "maintainerAccountId=123456789012",
    ]);
  });

  it("reads stack outputs and trims the trailing slash", () => {
    const json = { CdWallet: { ApiUrl: "https://x.test/", BucketName: "b", TableName: "t" } };
    expect(parseStackOutputs(json)).toEqual({ apiUrl: "https://x.test", bucketName: "b", tableName: "t" });
  });

  it("fails clearly when outputs are missing", () => {
    expect(() => parseStackOutputs({ CdWallet: { ApiUrl: "x" } })).toThrow(/did not report/);
    expect(() => parseStackOutputs({})).toThrow(/did not report/);
    expect(() => parseStackOutputs(null)).toThrow(/did not report/);
  });
});

describe("planAdminToken", () => {
  const gen = () => "cda_new";

  it("first deploy: makes a token and installs it", () => {
    expect(planAdminToken(undefined, undefined, gen)).toEqual({ token: "cda_new", install: true });
  });

  it("redeploy: keeps the saved token, installs nothing", () => {
    expect(planAdminToken("cda_mine", hashToken("cda_mine"), gen)).toEqual({ token: "cda_mine", install: false });
  });

  it("resumes after a deploy that stopped before the hash was stored", () => {
    expect(planAdminToken("cda_mine", undefined, gen)).toEqual({ token: "cda_mine", install: true });
  });

  it("refuses when the saved token does not match AWS", () => {
    expect(() => planAdminToken("cda_mine", hashToken("cda_other"), gen)).toThrow(/reset-token/);
  });

  it("refuses when AWS has a token this computer does not know", () => {
    expect(() => planAdminToken(undefined, hashToken("cda_other"), gen)).toThrow(/reset-token/);
  });
});

describe("describeError", () => {
  it("summarises AWS errors with a hint instead of a stack trace", () => {
    const err = Object.assign(new Error("needs a subscription"), { name: "OptInRequired", $metadata: {} });
    const text = describeError(err) ?? "";
    expect(text).toContain("OptInRequired");
    expect(text).toContain("not fully activated");
  });

  it("leaves unknown errors alone", () => {
    expect(describeError(new Error("boom"))).toBeUndefined();
  });
});
