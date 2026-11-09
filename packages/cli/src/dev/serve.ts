import { networkInterfaces } from "node:os";
import * as path from "node:path";
import * as readline from "node:readline";
import { buildPairingLink, formatPairingCode } from "@cdwallet/shared";
import QRCode from "qrcode";
import { startDevServer } from "./server";

/**
 * `pnpm dev:api`: a throwaway CD Wallet server on your own computer, for trying the Android app
 * before (or without) deploying to AWS. It runs the real API code with an in-memory database and a
 * fake S3. Everything is forgotten when you stop it.
 */

const USAGE = `Usage: pnpm dev:api [--audio <file.mp3>] [--port <n>] [--tracks <n>]

  --audio   An MP3 to use for every track (default: .dev/test.mp3, else a built-in silent-ish clip)
  --port    Port to listen on (default 8787)
  --tracks  How many sample tracks to create, 1-60 (default 24)`;

function parseArgs(argv: string[]) {
  const out = { audio: undefined as string | undefined, port: 8787, tracks: 24 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    if (a === "--help" || a === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else if (a === "--audio" && v) (out.audio = v), i++;
    else if (a === "--port" && v) (out.port = Number(v)), i++;
    else if (a === "--tracks" && v) (out.tracks = Math.max(1, Math.min(60, Number(v)))), i++;
    else throw new Error(`Unknown option: ${a}\n\n${USAGE}`);
  }
  if (!Number.isInteger(out.port) || out.port < 1 || out.port > 65535) throw new Error("--port must be a number from 1 to 65535");
  if (!Number.isInteger(out.tracks)) throw new Error("--tracks must be a whole number");
  return out;
}


function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i): i is NonNullable<typeof i> => !!i && i.family === "IPv4" && !i.internal)
    .map((i) => i.address);
}


async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(process.env.INIT_CWD ?? process.cwd());
  const server = await startDevServer({
    audioPath: args.audio ? path.resolve(repoRoot, args.audio) : path.join(repoRoot, ".dev", "test.mp3"),
    audioRequired: !!args.audio,
    host: "0.0.0.0",
    port: args.port,
    tracks: args.tracks,
  });
  const { api, usingBuiltIn, durationSec } = server;
  const n = server.trackCount;
  const audioPath = args.audio ?? "test.mp3";
  const call = server.call;
  const addresses = [`http://10.0.2.2:${args.port}  (Android emulator)`, ...lanAddresses().map((ip) => `http://${ip}:${args.port}  (phone on your Wi-Fi)`)];

  async function showCode() {
    const { code } = (await call("POST", "/pairing", { deviceName: "Dev phone" })) as { code: string };
    console.log(`\nPairing code (good for 5 minutes): ${formatPairingCode(code.replace(/-/g, ""))}`);
    const lan = lanAddresses()[0];
    if (lan) {
      const link = buildPairingLink({ api: `http://${lan}:${args.port}`, code });
      console.log(await QRCode.toString(link, { type: "terminal", small: true }));
      console.log(`QR for a phone on your Wi-Fi. For the emulator, type the 10.0.2.2 address and the code.`);
    }
    console.log("Press Enter for a new code, Ctrl-C to stop.");
  }

  console.log(`\nCD Wallet dev server is running with ${n} sample tracks (${usingBuiltIn ? "built-in test clip" : path.basename(audioPath)}, ${durationSec}s each).`);
  if (usingBuiltIn) console.log("Tip: put a real MP3 at .dev/test.mp3 (git-ignored) or pass --audio <file> to hear actual music.");
  console.log("\nPhone plugged in with USB? Run  adb reverse tcp:" + args.port + " tcp:" + args.port + "  then use  http://localhost:" + args.port + "  (works without Wi-Fi).");
  console.log("\nAPI address to type into the app:");
  for (const a of addresses) console.log(`  ${a}`);
  console.log("\nThis is a throwaway server: restarting it forgets paired phones (the app will ask you to pair again).");
  await showCode();

  const rl = readline.createInterface({ input: process.stdin });
  rl.on("line", () => void showCode().catch((e) => console.error(e)));
  const stop = () => void api.close().then(() => process.exit(0));
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
