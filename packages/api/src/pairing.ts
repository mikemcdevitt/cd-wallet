import { randomBytes } from "node:crypto";
import { DEVICE_TOKEN_PREFIX, PAIRING_ALPHABET, PAIRING_CODE_LENGTH } from "@cdwallet/shared";

export type RandomBytes = (size: number) => Buffer;

/** A new 12-character pairing code (unformatted). 256 is a multiple of 32, so every character is equally likely. */
export function newPairingCode(random: RandomBytes = randomBytes): string {
  return [...random(PAIRING_CODE_LENGTH)]
    .map((byte) => PAIRING_ALPHABET[byte % PAIRING_ALPHABET.length])
    .join("");
}

/** A device id and its token, `cdd_<id>.<secret>`. Only the token's hash is stored. */
export function newDeviceCredentials(random: RandomBytes = randomBytes): { id: string; token: string } {
  const id = random(8).toString("hex");
  return { id, token: `${DEVICE_TOKEN_PREFIX}${id}.${random(32).toString("base64url")}` };
}
