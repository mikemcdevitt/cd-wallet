import { parseArgs } from "node:util";
import { validateName, type DeploymentConfig } from "./config";
import { CliError } from "./errors";

export interface DeployOptions {
  name: string;
  profile?: string;
  region?: string;
  ownerEmail?: string;
  monthlyBudgetUsd?: number;
  maintainerAccountId?: string;
  yes: boolean;
  help: boolean;
}

export const DEFAULT_BUDGET_USD = 10;

export const DEPLOY_HELP = `Usage: cdwallet deploy [options]

Creates or updates CD Wallet in your AWS account.

Options:
  --profile <name>            AWS profile to use (default: $AWS_PROFILE, then the default chain)
  --region <region>           AWS region (default: the profile's region)
  --name <name>               Name for this deployment's saved settings (default: "default")
  --owner-email <email>       Where to send monthly budget alerts
  --budget <usd>              Monthly budget in USD (default: ${DEFAULT_BUDGET_USD})
  --maintainer-account <id>   Let this AWS account assume a read-only support role
  -y, --yes                   Skip the confirmation prompt
  -h, --help                  Show this help
`;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseDeployArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): DeployOptions {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        profile: { type: "string" },
        region: { type: "string" },
        name: { type: "string" },
        "owner-email": { type: "string" },
        budget: { type: "string" },
        "maintainer-account": { type: "string" },
        yes: { type: "boolean", short: "y" },
        help: { type: "boolean", short: "h" },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (err) {
    throw new CliError(`${(err as Error).message}\n\n${DEPLOY_HELP}`);
  }

  const options: DeployOptions = {
    name: validateName(values.name ?? env.CDWALLET_NAME ?? "default"),
    yes: values.yes ?? false,
    help: values.help ?? false,
  };

  const profile = values.profile ?? env.AWS_PROFILE;
  if (profile) options.profile = profile;
  if (values.region) options.region = values.region;

  if (values["owner-email"] !== undefined) {
    if (!EMAIL.test(values["owner-email"])) throw new CliError("--owner-email must be an email address");
    options.ownerEmail = values["owner-email"];
  }
  if (values.budget !== undefined) {
    const budget = Number(values.budget);
    if (!Number.isFinite(budget) || budget <= 0) throw new CliError("--budget must be a positive number of USD");
    options.monthlyBudgetUsd = budget;
  }
  if (values["maintainer-account"] !== undefined) {
    if (!/^\d{12}$/.test(values["maintainer-account"])) {
      throw new CliError("--maintainer-account must be a 12-digit AWS account ID");
    }
    options.maintainerAccountId = values["maintainer-account"];
  }
  return options;
}

export interface EffectiveSettings {
  ownerEmail?: string;
  monthlyBudgetUsd: number;
  maintainerAccountId?: string;
}

/** Flags win, then what the last deploy used, then defaults. */
export function effectiveSettings(options: DeployOptions, saved?: DeploymentConfig): EffectiveSettings {
  const ownerEmail = options.ownerEmail ?? saved?.ownerEmail;
  const maintainerAccountId = options.maintainerAccountId ?? saved?.maintainerAccountId;
  return {
    monthlyBudgetUsd: options.monthlyBudgetUsd ?? saved?.monthlyBudgetUsd ?? DEFAULT_BUDGET_USD,
    ...(ownerEmail ? { ownerEmail } : {}),
    ...(maintainerAccountId ? { maintainerAccountId } : {}),
  };
}
