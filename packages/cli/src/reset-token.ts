import { parseArgs } from "node:util";
import { replaceAdminTokenHash, resolveTarget, stackOutputs, type Target } from "./aws";
import { STACK_NAME, parseStackOutputs, type StackOutputs } from "./cdk";
import { configDir, loadConfig, saveConfig, type DeploymentConfig } from "./config";
import { CliError } from "./errors";
import { resolveDeploymentName } from "./deployment";
import { DEFAULT_BUDGET_USD } from "./options";
import { confirm, isInteractive } from "./prompt";
import { generateAdminToken, hashToken } from "./tokens";

export const RESET_HELP = `Usage: cdwallet reset-token [options]

Creates a new admin token and replaces the one stored in AWS. Use it if the token was lost,
if you are setting up a second computer, or if you think the token leaked. Other computers
using the old token stop working. Paired phones are not affected.

Options:
  --profile <name>   AWS profile to use (default: $AWS_PROFILE, then the saved one)
  --region <region>  AWS region (default: the saved one, then the profile's)
  --name <name>      Which deployment to use (default: "default")
  -y, --yes          Skip the confirmation prompt
  -h, --help         Show this help
`;

/** The settings to save after a reset, reusing what is known about this deployment. */
export function configAfterReset(
  name: string,
  target: Target,
  outputs: StackOutputs,
  token: string,
  saved: DeploymentConfig | undefined,
  now: Date = new Date(),
): DeploymentConfig {
  return {
    version: 1,
    name,
    accountId: target.accountId,
    region: target.region,
    ...(target.profile ? { profile: target.profile } : {}),
    stackName: STACK_NAME,
    apiUrl: outputs.apiUrl,
    bucketName: outputs.bucketName,
    tableName: outputs.tableName,
    adminToken: token,
    monthlyBudgetUsd: saved?.monthlyBudgetUsd ?? DEFAULT_BUDGET_USD,
    ...(saved?.ownerEmail ? { ownerEmail: saved.ownerEmail } : {}),
    ...(saved?.maintainerAccountId ? { maintainerAccountId: saved.maintainerAccountId } : {}),
    deployedAt: saved?.deployedAt ?? now.toISOString(),
  };
}

export async function runResetToken(argv: string[]): Promise<void> {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        profile: { type: "string" },
        region: { type: "string" },
        name: { type: "string" },
        yes: { type: "boolean", short: "y" },
        help: { type: "boolean", short: "h" },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (err) {
    throw new CliError(`${(err as Error).message}\n\n${RESET_HELP}`);
  }
  if (values.help) {
    console.log(RESET_HELP);
    return;
  }

  const dir = configDir();
  const name = await resolveDeploymentName(values.name, process.env, dir);
  const saved = await loadConfig(name, dir);

  console.log("Checking your AWS credentials...");
  const target = await resolveTarget(values.profile ?? process.env.AWS_PROFILE ?? saved?.profile, values.region ?? saved?.region);
  if (saved && (saved.accountId !== target.accountId || saved.region !== target.region)) {
    throw new CliError(
      `The deployment "${name}" was set up in account ${saved.accountId} (${saved.region}), ` +
        `but your credentials point at account ${target.accountId} (${target.region}).\n` +
        "Check --profile and --region, or use --name for a different deployment.",
    );
  }

  const outputs = await stackOutputs(target, STACK_NAME);
  if (!outputs) {
    throw new CliError(`No CD Wallet stack found in account ${target.accountId} (${target.region}). Run \`cdwallet deploy\` first.`);
  }
  const stack = parseStackOutputs(outputs);

  console.log(`\nAbout to replace the admin token for account ${target.accountId} (${target.region}).\nAnything using the old token, such as another computer, will stop working. Paired phones keep working.`);
  if (!values.yes) {
    if (!isInteractive()) throw new CliError("Not a terminal, so cannot ask for confirmation. Pass --yes to continue.");
    if (!(await confirm("\nContinue?"))) {
      console.log("Cancelled. Nothing was changed.");
      return;
    }
  }

  const token = generateAdminToken();
  // Save the new token before AWS switches to it, so a failure in between can never lose it.
  const file = await saveConfig(configAfterReset(name, target, stack, token, saved), dir);
  await replaceAdminTokenHash(target, stack.tableName, hashToken(token));
  console.log(`\nDone. New admin token saved to ${file} (keep it private).`);
}
