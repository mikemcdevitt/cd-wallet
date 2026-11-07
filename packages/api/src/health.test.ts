import { describe, expect, it } from "vitest";
import { handler } from "./health";

describe("health handler", () => {
  it("returns 200 with ok: true", async () => {
    const res = await handler();
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, service: "cd-wallet" });
  });
});
