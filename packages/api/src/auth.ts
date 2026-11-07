import { createHash, timingSafeEqual } from "node:crypto";
import { HttpError } from "./errors";
import type { Store } from "./store";

/** Admin tokens look like `cda_<random>`; device tokens like `cdd_<deviceId>.<random>`. */
export const ADMIN_PREFIX = "cda_";
export const DEVICE_PREFIX = "cdd_";

export type Role = "admin" | "device";
export interface Principal {
  role: Role;
  deviceId?: string;
}

export const sha256Hex = (value: string): string => createHash("sha256").update(value).digest("hex");

function hashMatches(token: string, expectedHex: string | undefined): boolean {
  if (!expectedHex) return false;
  const actual = Buffer.from(sha256Hex(token), "hex");
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function authenticate(
  authorization: string | undefined,
  store: Store,
): Promise<Principal | undefined> {
  const match = /^Bearer\s+(\S+)$/i.exec(authorization ?? "");
  const token = match?.[1];
  if (!token) return undefined;

  if (token.startsWith(ADMIN_PREFIX)) {
    const settings = await store.getSettings();
    return hashMatches(token, settings.adminTokenHash) ? { role: "admin" } : undefined;
  }

  if (token.startsWith(DEVICE_PREFIX)) {
    const deviceId = token.slice(DEVICE_PREFIX.length).split(".")[0];
    if (!deviceId) return undefined;
    const device = await store.getDevice(deviceId);
    return device && hashMatches(token, device.tokenHash) ? { role: "device", deviceId } : undefined;
  }

  return undefined;
}

/** Throws 401 for no/invalid credentials and 403 for a valid token with too little power. */
export function requireRole(principal: Principal | undefined, allowed: Role[]): Principal {
  if (!principal) throw new HttpError(401, "unauthorized", "Missing or invalid token");
  if (!allowed.includes(principal.role)) {
    throw new HttpError(403, "forbidden", "This token cannot do that");
  }
  return principal;
}
