import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { CliError } from "../errors";
import { ApiError, putBody, withRetry } from "./api-client";

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

describe("putBody", () => {
  it("reports an expired link as url_expired without retrying the same link", async () => {
    let requests = 0;
    const server = http.createServer((req, res) => {
      requests++;
      req.resume();
      req.on("end", () =>
        res.writeHead(403).end("<Error><Code>AccessDenied</Code><Message>Request has expired</Message></Error>"),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/x`;
      const err = await putBody(url, {}, { kind: "bytes", data: new Uint8Array([1, 2, 3]) }, 1).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe("url_expired");
      expect(requests).toBe(1);
    } finally {
      server.close();
    }
  });
});
