import { parseArgs } from "node:util";
import { API_LIMITS, buildPairingLink } from "@cdwallet/shared";
import QRCode from "qrcode";
import { clientFor, requireDeployment } from "./deployment";
import { CliError } from "./errors";

export const PAIR_HELP = `Usage: cdwallet pair [options]

Shows a QR code to pair the Android app with your library. Open the app, choose to add a
library, and scan it. The code works once and expires after five minutes.

Options:
  --name <name>          Which deployment to use (default: "default")
  --device-name <name>   A label for the phone, if the app does not send its own
  --no-wait              Print the code and exit instead of waiting for the phone
  -h, --help             Show this help
`;

export interface PairIo {
  env?: NodeJS.ProcessEnv;
  log?: (line: string) => void;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

export const renderQr = (text: string): Promise<string> => QRCode.toString(text, { type: "terminal", small: true });

export async function runPair(argv: string[], io: PairIo = {}): Promise<void> {
  const env = io.env ?? process.env;
  const log = io.log ?? ((line: string) => console.log(line));
  const now = io.now ?? (() => new Date());
  const sleep = io.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        name: { type: "string" },
        "device-name": { type: "string" },
        "no-wait": { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (err) {
    throw new CliError(`${(err as Error).message}\n\n${PAIR_HELP}`);
  }
  if (values.help) {
    log(PAIR_HELP);
    return;
  }

  const config = await requireDeployment(values.name, env);
  const client = clientFor(config);

  const known = new Set((await client.listDevices()).map((d) => d.id));
  const pairing = await client.createPairing(values["device-name"]);
  const link = buildPairingLink({ api: config.apiUrl, code: pairing.code });

  log(await renderQr(link));
  log(`Scan this with the CD Wallet app.\n\n  Code  ${pairing.code}\n  Link  ${link}\n`);
  log("The code works once and expires in five minutes.");
  if (values["no-wait"]) return;

  log("Waiting for the phone...");
  const deadline = Date.parse(pairing.expiresAt);
  while (now().getTime() < deadline) {
    await sleep(2000);
    const added = (await client.listDevices()).find((d) => !known.has(d.id));
    if (added) {
      log(`\nPaired: ${added.name} (${added.id})`);
      return;
    }
  }
  throw new CliError(`The code expired before a phone used it. Run \`cdwallet pair\` again (codes last ${API_LIMITS.pairingCodeTtlSeconds / 60} minutes).`);
}
