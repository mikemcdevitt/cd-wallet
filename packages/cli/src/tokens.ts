import { createHash, randomBytes } from "node:crypto";
import { ADMIN_TOKEN_PREFIX } from "@cdwallet/shared";

export const generateAdminToken = (): string => ADMIN_TOKEN_PREFIX + randomBytes(32).toString("base64url");

/** The API stores only this hash; the token itself lives in the owner's config file. */
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");
