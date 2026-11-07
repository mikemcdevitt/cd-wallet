import { describe, expect, it } from "vitest";
import { CliError } from "../errors";
import { ApiError, withRetry } from "./api-client";

describe("withRetry", () => {
  it("retries server errors and then succeeds", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      if (++calls < 3) throw new ApiError(503, "busy", "busy", true);
      return "ok";
    }, 3, 1);
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("gives up after the last attempt", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw new ApiError(500, "x", "still down", true);
      }, 3, 1),
    ).rejects.toThrow("still down");
    expect(calls).toBe(3);
  });

  it("does not retry client errors or rejected tokens", async () => {
    let calls = 0;
    await expect(withRetry(async () => { calls++; throw new ApiError(409, "c", "conflict", false); }, 3, 1)).rejects.toThrow();
    await expect(withRetry(async () => { calls++; throw new CliError("bad token"); }, 3, 1)).rejects.toThrow();
    expect(calls).toBe(2);
  });
});
