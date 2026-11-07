import { CliError } from "./errors";
import { generateAdminToken, hashToken } from "./tokens";

export interface TokenPlan {
  token: string;
  /** True when the server does not have this token's hash yet. */
  install: boolean;
}

/**
 * Decides what to do about the admin token on a deploy:
 *  - token saved here and server agrees: nothing to do (a redeploy)
 *  - token saved here, server has none: install it (an earlier deploy stopped halfway)
 *  - no token saved here, server has none: make a new one (first deploy)
 *  - anything else is a mismatch we refuse to paper over
 */
export function planAdminToken(
  savedToken: string | undefined,
  serverHash: string | undefined,
  generate: () => string = generateAdminToken,
): TokenPlan {
  if (savedToken) {
    if (serverHash === undefined) return { token: savedToken, install: true };
    if (serverHash !== hashToken(savedToken)) {
      throw new CliError(
        "The admin token saved on this computer does not match the one in AWS.\n" +
          "Use `cdwallet reset-token` to set a new one.",
      );
    }
    return { token: savedToken, install: false };
  }
  if (serverHash !== undefined) {
    throw new CliError(
      "This deployment already has an admin token, but it is not saved on this computer.\n" +
        "Use `cdwallet reset-token` to set a new one.",
    );
  }
  return { token: generate(), install: true };
}
