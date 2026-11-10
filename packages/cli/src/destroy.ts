import { parseArgs } from "node:util";
import { awsDestroyOps, type DestroyOps } from "./aws-destroy";
import { resolveTarget, type Target } from "./aws";
import { STACK_NAME } from "./cdk";
import { configDir, configPath, loadConfig, removeConfig } from "./config";
import { resolveDeploymentName } from "./deployment";
import { CliError } from "./errors";
import { ask, confirm, isInteractive } from "./prompt";

export const DESTROY_HELP = `Usage: cdwallet destroy [options]

Removes CD Wallet from your AWS account.

By default only the stack (API and Lambda) is removed. Your music bucket and database are
kept, so nothing you own is lost, and \`cdwallet deploy\` brings the app back with the same data.

With --delete-data, everything is removed for good: every uploaded song, the database, the
bucket, and this computer's saved settings. Paired phones stop working. This cannot be undone.

Options:
  --delete-data            Also delete the bucket, the database and the saved settings
  --confirm-bucket <name>  With --delete-data: the bucket's name, instead of typing it when asked
  --dry-run                Show what would be removed, and how many files, then stop
  --profile <name>         AWS profile to use (default: $AWS_PROFILE, then the saved one)
  --region <region>        AWS region (default: the saved one, then the profile's)
  --name <name>            Which deployment to use (default: "default", or the only saved one)
  -y, --yes                Skip the confirmation prompt (not enough on its own with --delete-data)
  -h, --help               Show this help
`;

export interface DestroyOptions {
  name?: string;
  profile?: string;
  region?: string;
  deleteData: boolean;
  dryRun: boolean;
  confirmBucket?: string;
  yes: boolean;
  help: boolean;
}

export function parseDestroyArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): DestroyOptions {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        profile: { type: "string" },
        region: { type: "string" },
        name: { type: "string" },
        "delete-data": { type: "boolean" },
        "dry-run": { type: "boolean" },
        "confirm-bucket": { type: "string" },
        yes: { type: "boolean", short: "y" },
        help: { type: "boolean", short: "h" },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (err) {
    throw new CliError(`${(err as Error).message}\n\n${DESTROY_HELP}`);
  }
  const profile = values.profile ?? env.AWS_PROFILE;
  const options: DestroyOptions = {
    deleteData: values["delete-data"] ?? false,
    dryRun: values["dry-run"] ?? false,
    yes: values.yes ?? false,
    help: values.help ?? false,
  };
  if (values.name) options.name = values.name;
  if (profile) options.profile = profile;
  if (values.region) options.region = values.region;
  if (values["confirm-bucket"]) {
    if (!options.deleteData) throw new CliError("--confirm-bucket only makes sense together with --delete-data.");
    options.confirmBucket = values["confirm-bucket"];
  }
  return options;
}

/** Everything `destroy` touches outside its own logic, so tests can replace it. */
export interface DestroyDeps {
  env: NodeJS.ProcessEnv;
  log: (line: string) => void;
  interactive: () => boolean;
  ask: (question: string) => Promise<string>;
  confirm: (question: string) => Promise<boolean>;
  resolveTarget: (profile?: string, region?: string) => Promise<Target>;
  opsFor: (target: Target, stackName: string) => DestroyOps;
}

const realDeps = (): DestroyDeps => ({
  env: process.env,
  log: (line) => console.log(line),
  interactive: isInteractive,
  ask,
  confirm,
  resolveTarget,
  opsFor: awsDestroyOps,
});

export async function runDestroy(argv: string[], overrides: Partial<DestroyDeps> = {}): Promise<void> {
  const deps = { ...realDeps(), ...overrides };
  const { log } = deps;
  const options = parseDestroyArgs(argv, deps.env);
  if (options.help) {
    log(DESTROY_HELP);
    return;
  }

  const dir = configDir(deps.env);
  const name = await resolveDeploymentName(options.name, deps.env, dir);
  const saved = await loadConfig(name, dir);
  if (!saved) throw new CliError(`No saved deployment named "${name}", so I do not know which bucket or database to remove.`);

  log("Checking your AWS credentials...");
  const target = await deps.resolveTarget(options.profile ?? saved.profile, options.region ?? saved.region);
  if (saved.accountId !== target.accountId || saved.region !== target.region) {
    throw new CliError(
      `The deployment "${name}" was set up in account ${saved.accountId} (${saved.region}), ` +
        `but your credentials point at account ${target.accountId} (${target.region}).\n` +
        "Check --profile and --region before removing anything.",
    );
  }

  const ops = deps.opsFor(target, STACK_NAME);
  const status = await ops.stackStatus();
  if (!status && !options.deleteData) {
    log(`The stack is already gone. Your bucket (${saved.bucketName}) and database (${saved.tableName}) are untouched.`);
    log("Run again with --delete-data to remove them as well.");
    return;
  }

  log(`\nDeployment  ${name}\nAccount     ${target.accountId} (${target.region})\nIdentity    ${target.arn}`);
  if (options.deleteData) {
    log(`
This will PERMANENTLY DELETE:
  ${status ? "The stack (API and Lambda)" : "(the stack is already gone)"}
  Bucket    ${saved.bucketName}   and every song and cover in it
  Database  ${saved.tableName}   including all paired phones
  Settings  ${configPath(name, dir)}
Your music files on this computer are not touched. This cannot be undone.`);
  } else {
    log(`
This will remove the stack (API and Lambda). Phones stop working until you deploy again.
Kept:
  Bucket    ${saved.bucketName}
  Database  ${saved.tableName}
  Settings  ${configPath(name, dir)}`);
  }

  if (options.dryRun) {
    if (options.deleteData) {
      const count = await ops.countObjects(saved.bucketName);
      log(
        count === undefined
          ? `\nThe bucket ${saved.bucketName} does not exist (already deleted).`
          : `\nThe bucket currently holds ${count} ${count === 1 ? "object" : "objects"} (songs and covers).`,
      );
    }
    log("\nDry run: nothing was changed.");
    return;
  }

  if (options.deleteData) {
    if (options.confirmBucket !== undefined) {
      if (options.confirmBucket !== saved.bucketName) {
        throw new CliError(`--confirm-bucket "${options.confirmBucket}" does not match this deployment's bucket. Nothing was changed.`);
      }
    } else {
      if (!deps.interactive()) {
        throw new CliError("Not a terminal, so cannot ask for confirmation. Pass --confirm-bucket <bucket name> to delete everything.");
      }
      const typed = await deps.ask(`\nType the bucket name (${saved.bucketName}) to delete everything: `);
      if (typed !== saved.bucketName) {
        log("That is not the bucket name. Cancelled. Nothing was changed.");
        return;
      }
    }
  } else if (!options.yes) {
    if (!deps.interactive()) throw new CliError("Not a terminal, so cannot ask for confirmation. Pass --yes to continue.");
    if (!(await deps.confirm("\nContinue?"))) {
      log("Cancelled. Nothing was changed.");
      return;
    }
  }

  // Find the log group before the stack (and so the Lambda's name) disappears.
  const logGroup = status ? await ops.logGroupName() : undefined;

  if (status) {
    log("\nRemoving the stack (this takes a minute or two)...");
    await ops.deleteStack();
    log("  Stack removed.");
  }

  if (!options.deleteData) {
    log("\nDone. Your music and library are still in your account. `cdwallet deploy` restores the app.");
    return;
  }

  log(`Emptying and deleting bucket ${saved.bucketName}...`);
  const objects = await ops.emptyAndDeleteBucket(saved.bucketName);
  log(`  Bucket deleted (${objects} ${objects === 1 ? "object" : "objects"} removed).`);
  await ops.deleteTable(saved.tableName);
  log(`  Database ${saved.tableName} deleted.`);
  await removeConfig(name, dir);
  log(`  Removed ${configPath(name, dir)}.`);

  log("\nDone. The app and your library are gone from this AWS account.");
  if (logGroup) {
    log(`Left behind: the Lambda's log group ${logGroup} (tiny, but not part of the stack). To remove it:\n  aws logs delete-log-group --log-group-name ${logGroup} --region ${target.region}`);
  }
  log("CDK's shared setup stack (CDKToolkit) is kept; other apps may use it.");
}
