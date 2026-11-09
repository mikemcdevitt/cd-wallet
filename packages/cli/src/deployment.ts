import { configDir, loadConfig, validateName, type DeploymentConfig } from "./config";
import { CliError } from "./errors";
import { ApiClient } from "./import/api-client";

/** The saved deployment a command should talk to, or a clear message about running deploy first. */
export async function requireDeployment(
  name: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Promise<DeploymentConfig> {
  const deployment = validateName(name ?? env.CDWALLET_NAME ?? "default");
  const config = await loadConfig(deployment, configDir(env));
  if (!config) throw new CliError(`No saved deployment named "${deployment}". Run \`cdwallet deploy\` first.`);
  return config;
}

export const clientFor = (config: DeploymentConfig): ApiClient => new ApiClient(config.apiUrl, config.adminToken);
