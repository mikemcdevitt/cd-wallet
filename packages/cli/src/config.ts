import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { CliError } from "./errors";

/** Everything the CLI needs to talk to one deployment. Contains the admin token: keep it private. */
export interface DeploymentConfig {
  version: 1;
  name: string;
  accountId: string;
  region: string;
  profile?: string;
  stackName: string;
  apiUrl: string;
  bucketName: string;
  tableName: string;
  adminToken: string;
  /** Remembered so a re-deploy keeps the same budget alert and maintainer role. */
  ownerEmail?: string;
  monthlyBudgetUsd: number;
  maintainerAccountId?: string;
  deployedAt: string;
}

const NAME = /^[a-z0-9][a-z0-9-]{0,30}$/;

export function validateName(name: string): string {
  if (!NAME.test(name)) {
    throw new CliError(`Invalid deployment name "${name}". Use lowercase letters, digits and dashes (max 31).`);
  }
  return name;
}

/** `~/.cdwallet` by default; set CDWALLET_HOME to keep the files somewhere else. */
export function configDir(env: NodeJS.ProcessEnv = process.env, home: string = os.homedir()): string {
  return env.CDWALLET_HOME ? path.resolve(env.CDWALLET_HOME) : path.join(home, ".cdwallet");
}

export const configPath = (name: string, dir: string): string => path.join(dir, `${validateName(name)}.json`);

export async function loadConfig(name: string, dir: string): Promise<DeploymentConfig | undefined> {
  const file = configPath(name, dir);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
  try {
    const parsed = JSON.parse(raw) as DeploymentConfig;
    if (parsed.version !== 1 || typeof parsed.adminToken !== "string") throw new Error("unexpected shape");
    return parsed;
  } catch {
    throw new CliError(`${file} is not a valid CD Wallet config. Fix or remove it, then try again.`);
  }
}

export async function saveConfig(config: DeploymentConfig, dir: string): Promise<string> {
  const file = configPath(config.name, dir);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  // Write to a temp file first so a crash can never leave a half-written token file behind.
  const tmp = `${file}.tmp`;
  await writeFile(tmp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, file);
  return file;
}
