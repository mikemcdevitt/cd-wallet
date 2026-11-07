import { mkdtemp, readFile, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { planAdminToken } from "./admin-token";
import { installAdminTokenHash, isBootstrapped, readAdminTokenHash, resolveTarget, stackStatus } from "./aws";
import { contextArgs, parseStackOutputs, runCdk, STACK_NAME } from "./cdk";
import { configDir, configPath, loadConfig, saveConfig, type DeploymentConfig } from "./config";
import { CliError } from "./errors";
import { DEPLOY_HELP, effectiveSettings, parseDeployArgs } from "./options";
import { ask, confirm, isInteractive } from "./prompt";
import { hashToken } from "./tokens";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function runDeploy(argv: string[]): Promise<void> {
  const options = parseDeployArgs(argv);
  if (options.help) {
    console.log(DEPLOY_HELP);
    return;
  }

  const dir = configDir();
  const saved = await loadConfig(options.name, dir);

  console.log("Checking your AWS credentials...");
  const target = await resolveTarget(options.profile ?? saved?.profile, options.region ?? saved?.region);

  if (saved && (saved.accountId !== target.accountId || saved.region !== target.region)) {
    throw new CliError(
      `The deployment "${options.name}" was set up in account ${saved.accountId} (${saved.region}), ` +
        `but your credentials point at account ${target.accountId} (${target.region}).\n` +
        "Check --profile and --region, or use --name to keep a separate deployment.",
    );
  }

  let settings = effectiveSettings(options, saved);
  if (!settings.ownerEmail && !options.yes && isInteractive()) {
    const email = await ask("Email for monthly budget alerts (leave blank to skip): ");
    if (email && !EMAIL.test(email)) throw new CliError("That does not look like an email address.");
    if (email) settings = { ...settings, ownerEmail: email };
  }

  const existing = await stackStatus(target, STACK_NAME);
  const needsBootstrap = !(await isBootstrapped(target));

  console.log(`
About to ${existing ? "update" : "create"} CD Wallet:
  Account   ${target.accountId}
  Identity  ${target.arn}
  Region    ${target.region}
  Settings  ${configPath(options.name, dir)}
  Budget    $${settings.monthlyBudgetUsd}/month${settings.ownerEmail ? `, alerts to ${settings.ownerEmail}` : " (no alert email: you will not be warned about costs)"}${settings.maintainerAccountId ? `\n  Support   account ${settings.maintainerAccountId} may assume a read-only role` : ""}
${needsBootstrap ? "  This account needs CDK's one-time setup first (a small staging bucket and roles).\n" : ""}
This sets up a private S3 bucket for your music, a database, and an API. The bucket and
database are kept if you ever remove the stack, so your music cannot be deleted by accident.`);

  if (!options.yes) {
    if (!isInteractive()) throw new CliError("Not a terminal, so cannot ask for confirmation. Pass --yes to continue.");
    if (!(await confirm("\nContinue?"))) {
      console.log("Cancelled. Nothing was changed.");
      return;
    }
  }

  const runTarget = { region: target.region, ...(target.profile ? { profile: target.profile } : {}) };
  if (needsBootstrap) {
    await runCdk(["bootstrap", `aws://${target.accountId}/${target.region}`], runTarget);
  }

  const tmp = await mkdtemp(path.join(os.tmpdir(), "cdwallet-"));
  let outputs;
  try {
    const outputsFile = path.join(tmp, "outputs.json");
    await runCdk(
      ["deploy", STACK_NAME, "--require-approval", "never", "--outputs-file", outputsFile, ...contextArgs(settings)],
      runTarget,
    );
    outputs = parseStackOutputs(JSON.parse(await readFile(outputsFile, "utf8")) as unknown);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }

  const plan = planAdminToken(saved?.adminToken, await readAdminTokenHash(target, outputs.tableName));
  const config: DeploymentConfig = {
    version: 1,
    name: options.name,
    accountId: target.accountId,
    region: target.region,
    ...(target.profile ? { profile: target.profile } : {}),
    stackName: STACK_NAME,
    apiUrl: outputs.apiUrl,
    bucketName: outputs.bucketName,
    tableName: outputs.tableName,
    adminToken: plan.token,
    monthlyBudgetUsd: settings.monthlyBudgetUsd,
    ...(settings.ownerEmail ? { ownerEmail: settings.ownerEmail } : {}),
    ...(settings.maintainerAccountId ? { maintainerAccountId: settings.maintainerAccountId } : {}),
    deployedAt: new Date().toISOString(),
  };
  // Save the token before telling AWS about it, so a failure in between can never lose it.
  const file = await saveConfig(config, dir);
  if (plan.install) await installAdminTokenHash(target, outputs.tableName, hashToken(plan.token));

  console.log(`\nDeployed.\n  API     ${outputs.apiUrl}\n  Bucket  ${outputs.bucketName}\n  Saved   ${file} (contains your admin token; keep it private)`);
  await checkHealth(outputs.apiUrl);
  console.log("\nNext: cdwallet import ~/Music");
}

async function checkHealth(apiUrl: string): Promise<void> {
  try {
    const res = await fetch(`${apiUrl}/health`);
    console.log(res.ok ? "  Health  OK" : `  Health  unexpected status ${res.status}`);
  } catch {
    console.log("  Health  could not reach the API yet; try again in a minute");
  }
}
