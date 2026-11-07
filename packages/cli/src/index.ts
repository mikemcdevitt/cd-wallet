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

const [command] = process.argv.slice(2);

if (!command || command === "--help" || command === "-h") {
  usage();
} else if (command in COMMANDS) {
  console.error(`cdwallet ${command}: not implemented yet.`);
  process.exitCode = 1;
} else {
  console.error(`Unknown command: ${command}\n`);
  usage();
  process.exitCode = 1;
}
