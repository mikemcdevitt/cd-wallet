import { describe, expect, it } from "vitest";
import { mapPool } from "./pool";

describe("mapPool", () => {
  it("never runs more than the limit at once and does every item", async () => {
    let running = 0;
    let peak = 0;
    const seen: number[] = [];
    await mapPool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      seen.push(n);
      running--;
    });
    expect(peak).toBe(3);
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("stops starting new work after a failure and reports it", async () => {
    const started: number[] = [];
    await expect(
      mapPool([1, 2, 3, 4, 5, 6], 1, async (n) => {
        started.push(n);
        if (n === 2) throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(started).toEqual([1, 2]);
  });

  it("handles an empty list", async () => {
    await mapPool([], 4, async () => {});
  });
});
