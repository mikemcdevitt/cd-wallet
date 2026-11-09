import { isPairingCode, normalizePairingCode, parsePairingLink } from "@cdwallet/shared";
import { createApiClient } from "./api-client";

export interface Credentials {
  apiUrl: string;
  deviceId: string;
  deviceToken: string;
}

/** Where the phone keeps its credentials (the OS keystore in the real app). */
export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

const KEY = "cdwallet.credentials";

export async function loadCredentials(store: SecretStore): Promise<Credentials | undefined> {
  const raw = await store.get(KEY);
  if (!raw) return undefined;
  try {
    const c = JSON.parse(raw) as Partial<Credentials>;
    if (c.apiUrl && c.deviceId && c.deviceToken) return { apiUrl: c.apiUrl, deviceId: c.deviceId, deviceToken: c.deviceToken };
  } catch {
    // fall through: treat a damaged entry as "not paired"
  }
  return undefined;
}

export const saveCredentials = (store: SecretStore, c: Credentials) => store.set(KEY, JSON.stringify(c));
export const clearCredentials = (store: SecretStore) => store.delete(KEY);

export interface PairingInput {
  apiUrl: string;
  code: string;
}

/** Accepts a scanned or pasted `cdwallet://pair?...` link. */
export function parsePairingText(text: string): PairingInput | undefined {
  const link = parsePairingLink(text);
  return link ? { apiUrl: link.api, code: link.code } : undefined;
}

/** Fields typed in by hand. Returns an error message, or the cleaned-up input. */
export function validateManualPairing(apiUrl: string, code: string): PairingInput | string {
  let url: URL;
  try {
    url = new URL(apiUrl.trim());
  } catch {
    return "Enter the full API address, starting with https://";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "Enter the full API address, starting with https://";
  const normalized = normalizePairingCode(code);
  if (!isPairingCode(normalized)) return "A pairing code has 12 letters and numbers, like ABCD-EFGH-JKMN.";
  return { apiUrl: apiUrl.trim().replace(/\/+$/, ""), code: normalized };
}

/** Trades a one-time code for this phone's device token and stores it. */
export async function claimAndStore(
  input: PairingInput,
  deviceName: string,
  store: SecretStore,
  fetchImpl?: typeof fetch,
): Promise<Credentials> {
  const client = createApiClient({ apiUrl: input.apiUrl, fetch: fetchImpl });
  const res = await client.claimPairing(input.code, deviceName.trim().slice(0, 100) || "Android phone");
  const credentials: Credentials = { apiUrl: client.apiUrl, deviceId: res.deviceId, deviceToken: res.deviceToken };
  await saveCredentials(store, credentials);
  return credentials;
}
