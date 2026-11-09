/**
 * Pairing codes are 12 characters from Crockford's base32 alphabet (no I, L, O or U),
 * shown as XXXX-XXXX-XXXX. They are one-time and expire after five minutes.
 */
export const PAIRING_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const PAIRING_CODE_LENGTH = 12;

/** Uppercases, drops dashes and spaces, and fixes look-alike letters (O to 0, I and L to 1). */
export function normalizePairingCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

export function isPairingCode(normalized: string): boolean {
  return normalized.length === PAIRING_CODE_LENGTH && [...normalized].every((c) => PAIRING_ALPHABET.includes(c));
}

export function formatPairingCode(normalized: string): string {
  return normalized.match(/.{1,4}/g)?.join("-") ?? normalized;
}

export interface PairingPayload {
  /** The deployment's API address. */
  api: string;
  /** A pairing code, in any spelling normalizePairingCode accepts. */
  code: string;
}

/** What the QR code holds. Opening it on the phone starts the app's pairing screen. */
export function buildPairingLink(payload: PairingPayload): string {
  const query = new URLSearchParams({ api: payload.api, code: formatPairingCode(normalizePairingCode(payload.code)) });
  return `cdwallet://pair?${query.toString()}`;
}

export function parsePairingLink(link: string): PairingPayload | undefined {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== "cdwallet:" || url.hostname !== "pair") return undefined;
  const api = url.searchParams.get("api");
  const code = normalizePairingCode(url.searchParams.get("code") ?? "");
  if (!api || !isPairingCode(code)) return undefined;
  try {
    const parsed = new URL(api);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return undefined;
  } catch {
    return undefined;
  }
  return { api: api.replace(/\/+$/, ""), code };
}
