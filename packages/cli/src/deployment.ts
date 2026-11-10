import { configDir, listConfigNames, loadConfig, validateName, type DeploymentConfig } from "./config";
import { CliError } from "./errors";
import { ApiClient } from "./import/api-client";

/**
 * Which saved deployment a command means. An explicit name (flag or CDWALLET_NAME) always wins.
 * Without one, use "default", or the only saved deployment if there is no "default".
 */
export async function resolveDeploymentName(
  name: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  dir: string = configDir(env),
): Promise<string> {
  const explicit = name ?? env.CDWALLET_NAME;
  if (explicit) return validateName(explicit);
  const saved = await listConfigNames(dir);
  if (saved.length === 0 || saved.includes("default")) return "default";
  if (saved.length === 1) return saved[0]!;
  throw new CliError(`Several deployments are saved (${saved.join(", ")}). Choose one with --name <name>.`);
}

/** The saved deployment a command should talk to, or a clear message about running deploy first. */
export async function requireDeployment(
  name: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Promise<DeploymentConfig> {
  const dir = configDir(env);
  const deployment = await resolveDeploymentName(name, env, dir);
  const config = await loadConfig(deployment, dir);
  if (!config) throw new CliError(`No saved deployment named "${deployment}". Run \`cdwallet deploy\` first.`);
  return config;
}

/** The command that imports into a deployment, with --name only when it is needed. */
export function importCommand(name: string): string {
  return `pnpm cdwallet import ~/Music${name === "default" ? "" : ` --name ${name}`}`;
}

export const clientFor = (config: DeploymentConfig): ApiClient => new ApiClient(config.apiUrl, config.adminToken);
