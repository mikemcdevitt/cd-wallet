import { createHash, timingSafeEqual } from "node:crypto";
import { ADMIN_TOKEN_PREFIX as ADMIN_PREFIX, DEVICE_TOKEN_PREFIX as DEVICE_PREFIX } from "@cdwallet/shared";
import { HttpError } from "./errors";
import type { Store } from "./store";


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

const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

export async function authenticate(
  authorization: string | undefined,
  store: Store,
  now: Date = new Date(),
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
    if (!device || !hashMatches(token, device.tokenHash)) return undefined;
    // "Last seen" is for the owner's device list, so hourly is plenty; a failure here must not block the request.
    const lastSeen = device.lastSeenAt ? Date.parse(device.lastSeenAt) : 0;
    if (now.getTime() - lastSeen > TOUCH_INTERVAL_MS) {
      await store.touchDevice(deviceId, now.toISOString()).catch(() => undefined);
    }
    return { role: "device", deviceId };
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
