import { describeError } from "./errors";
import { runDeploy } from "./deploy";
import { runImport } from "./import/run";

const COMMANDS: Record<string, string> = {
  deploy: "Create or update the CD Wallet stack in your AWS account",
  import: "Upload MP3s from a folder (safe to re-run; --dry-run to preview)",
  pair: "Print a QR code to pair the Android app",
  devices: "List or revoke paired phones",
  "reset-token": "Replace the admin token",
  destroy: "Remove the stack (your bucket is kept unless you say otherwise)",
};

function usage(): void {
  console.log("Usage: cdwallet <command>\n");
  for (const [name, text] of Object.entries(COMMANDS)) {
    console.log(`  ${name.padEnd(12)} ${text}`);
  }
}

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;

  if (!command || command === "--help" || command === "-h") {
    usage();
  } else if (command === "deploy") {
    await runDeploy(rest);
  } else if (command === "import") {
    const result = await runImport(rest);
    if (result.failures.length > 0) process.exitCode = 1;
  } else if (command in COMMANDS) {
    console.error(`cdwallet ${command}: not implemented yet.`);
    process.exitCode = 1;
  } else {
    console.error(`Unknown command: ${command}\n`);
    usage();
    process.exitCode = 1;
  }
}

main(process.argv.slice(2)).catch((err: unknown) => {
  const message = describeError(err);
  console.error(message === undefined ? err : `Error: ${message}`);
  process.exitCode = 1;
});
