import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CliError } from "./errors";
import type { EffectiveSettings } from "./options";

export const STACK_NAME = "CdWallet";
const infraDir = fileURLToPath(new URL("../../infra", import.meta.url));

/** CDK context values that configure the stack (see packages/infra/bin/app.ts). */
export function contextArgs(settings: EffectiveSettings): string[] {
  return [
    "-c",
    `monthlyBudgetUsd=${settings.monthlyBudgetUsd}`,
    ...(settings.ownerEmail ? ["-c", `ownerEmail=${settings.ownerEmail}`] : []),
    ...(settings.maintainerAccountId ? ["-c", `maintainerAccountId=${settings.maintainerAccountId}`] : []),
  ];
}

export interface StackOutputs {
  apiUrl: string;
  bucketName: string;
  tableName: string;
}

/** Reads the file written by `cdk deploy --outputs-file`. */
export function parseStackOutputs(json: unknown, stackName: string = STACK_NAME): StackOutputs {
  const outputs = (json as Record<string, Record<string, unknown> | undefined> | null)?.[stackName];
  const apiUrl = outputs?.ApiUrl;
  const bucketName = outputs?.BucketName;
  const tableName = outputs?.TableName;
  if (typeof apiUrl !== "string" || typeof bucketName !== "string" || typeof tableName !== "string") {
    throw new CliError("The deploy finished but the stack did not report its URL, bucket and table.");
  }
  return { apiUrl: apiUrl.replace(/\/+$/, ""), bucketName, tableName };
}

export function runCdk(args: string[], target: { profile?: string; region: string }): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["exec", "cdk", ...args], {
      cwd: infraDir,
      stdio: "inherit",
      env: {
        ...process.env,
        AWS_REGION: target.region,
        AWS_DEFAULT_REGION: target.region,
        ...(target.profile ? { AWS_PROFILE: target.profile } : {}),
      },
    });
    child.on("error", (err) =>
      reject(new CliError(`Could not run pnpm (${err.message}). Run this from a checkout with pnpm installed.`)),
    );
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new CliError(`cdk exited with code ${code ?? "unknown"}.`)),
    );
  });
}
