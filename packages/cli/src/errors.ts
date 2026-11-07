/** An error whose message is meant to be shown to the user as is. */
export class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliError";
  }
}

const HINTS: Record<string, string> = {
  OptInRequired:
    "This AWS account is not fully activated yet. New accounts can take a while, and some need a payment method\n" +
    "or identity verification. Sign in to the account's console and look for a prompt to finish setup.",
  ExpiredToken: "Your AWS login has expired. Sign in again with `aws sso login`.",
  ExpiredTokenException: "Your AWS login has expired. Sign in again with `aws sso login`.",
  AccessDenied: "This AWS identity is not allowed to do that. Use a profile with AdministratorAccess.",
  AccessDeniedException: "This AWS identity is not allowed to do that. Use a profile with AdministratorAccess.",
};

/** Turns an AWS SDK error into a short message; anything else is returned as is. */
export function describeError(err: unknown): string | undefined {
  if (err instanceof CliError) return err.message;
  const e = err as { name?: string; Code?: string; message?: string; $metadata?: unknown } | null;
  if (e && typeof e === "object" && e.$metadata) {
    const code = e.Code ?? e.name ?? "Error";
    const hint = HINTS[code];
    return `AWS returned an error (${code}): ${e.message ?? "no details"}${hint ? `\n${hint}` : ""}`;
  }
  return undefined;
}
