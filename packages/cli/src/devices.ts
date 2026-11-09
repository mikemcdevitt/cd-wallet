import type { Device } from "@cdwallet/shared";
import { parseArgs } from "node:util";
import { clientFor, requireDeployment } from "./deployment";
import { CliError } from "./errors";

export const DEVICES_HELP = `Usage: cdwallet devices [options]
       cdwallet devices revoke <id> [options]

Lists the phones paired with your library, or signs one out. A revoked phone loses access
immediately; you can pair it again later.

Options:
  --name <name>   Which deployment to use (default: "default")
  -h, --help      Show this help
`;

const stamp = (iso: string | undefined): string => (iso ? iso.replace("T", " ").slice(0, 16) + " UTC" : "never");

export function formatDevices(devices: Device[]): string {
  if (devices.length === 0) return "No phones are paired. Run `cdwallet pair` to add one.";
  const rows = devices.map((d) => [d.name, d.id, stamp(d.pairedAt), stamp(d.lastSeenAt)]);
  const header = ["Name", "ID", "Paired", "Last used"];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ").trimEnd();
  return [line(header), ...rows.map(line)].join("\n");
}

/** Accepts the full id or any unambiguous start of it (4+ characters). */
export function resolveDeviceId(devices: Device[], typed: string): string {
  const wanted = typed.trim().toLowerCase();
  const matches = devices.filter((d) => d.id === wanted || (wanted.length >= 4 && d.id.startsWith(wanted)));
  if (matches.length === 1 && matches[0]) return matches[0].id;
  if (matches.length > 1) throw new CliError(`"${typed}" matches more than one phone. Type more of the ID.`);
  throw new CliError(`No paired phone matches "${typed}". Run \`cdwallet devices\` to see the list.`);
}

export async function runDevices(
  argv: string[],
  io: { env?: NodeJS.ProcessEnv; log?: (line: string) => void } = {},
): Promise<void> {
  const env = io.env ?? process.env;
  const log = io.log ?? ((line: string) => console.log(line));

  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: { name: { type: "string" }, help: { type: "boolean", short: "h" } },
      strict: true,
      allowPositionals: true,
    });
  } catch (err) {
    throw new CliError(`${(err as Error).message}\n\n${DEVICES_HELP}`);
  }
  const [action, target, ...extra] = parsed.positionals;
  if (parsed.values.help) {
    log(DEVICES_HELP);
    return;
  }
  if (extra.length > 0 || (action && action !== "revoke" && action !== "list")) {
    throw new CliError(`Unknown arguments.\n\n${DEVICES_HELP}`);
  }

  const client = clientFor(await requireDeployment(parsed.values.name, env));
  const devices = await client.listDevices();

  if (action === "revoke") {
    if (!target) throw new CliError(`Tell me which phone to revoke, for example: cdwallet devices revoke 1a2b3c4d\n\n${DEVICES_HELP}`);
    const id = resolveDeviceId(devices, target);
    const device = devices.find((d) => d.id === id);
    await client.revokeDevice(id);
    log(`Revoked ${device?.name ?? id}. It can no longer reach your library.`);
    return;
  }
  log(formatDevices(devices));
}
