import { parseArgs } from "node:util";
import * as os from "node:os";
import * as path from "node:path";
import { validateName } from "../config";
import { CliError } from "../errors";

export interface ImportOptions {
  folder: string;
  name: string;
  /** True when the name came from --name or CDWALLET_NAME, so no fallback should be tried. */
  nameExplicit: boolean;
  dryRun: boolean;
  concurrency: number;
  help: boolean;
}

export const IMPORT_HELP = `Usage: cdwallet import <folder> [options]

Uploads the MP3 and M4A (AAC) files in <folder> (including subfolders) to your library.
Copy-protected (.m4p) and Apple Lossless files are skipped and listed at the end.
Safe to run again: files already in your library are skipped.

Options:
  --dry-run            Scan and report only; upload nothing
  --name <name>        Which deployment to use (default: "default")
  --concurrency <n>    Files to process at once, 1-16 (default: 4)
  -h, --help           Show this help
`;

export function parseImportArgs(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir(),
): ImportOptions {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        "dry-run": { type: "boolean" },
        name: { type: "string" },
        concurrency: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
      strict: true,
      allowPositionals: true,
    });
  } catch (err) {
    throw new CliError(`${(err as Error).message}\n\n${IMPORT_HELP}`);
  }
  const { values, positionals } = parsed;

  if (values.help) {
    return { folder: "", name: "default", nameExplicit: false, dryRun: false, concurrency: 4, help: true };
  }
  if (positionals.length !== 1 || !positionals[0]) {
    throw new CliError(`Tell me which folder to import, for example: cdwallet import ~/Music\n\n${IMPORT_HELP}`);
  }

  const concurrency = values.concurrency === undefined ? 4 : Number(values.concurrency);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) {
    throw new CliError("--concurrency must be a whole number from 1 to 16");
  }

  // pnpm runs the CLI from packages/cli, so relative folders are resolved from where the user typed the command.
  const typed = positionals[0] === "~" ? home : positionals[0].startsWith("~/") ? path.join(home, positionals[0].slice(2)) : positionals[0];
  return {
    folder: path.resolve(env.INIT_CWD ?? process.cwd(), typed),
    name: validateName(values.name ?? env.CDWALLET_NAME ?? "default"),
    nameExplicit: Boolean(values.name ?? env.CDWALLET_NAME),
    dryRun: values["dry-run"] ?? false,
    concurrency,
    help: false,
  };
}
