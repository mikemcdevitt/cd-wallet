import { describe, expect, it } from "vitest";
import { initialWindow, shuffled, tracksToLoadNext } from "./queue";

describe("queue window", () => {
  it("starts at the chosen track and holds at most 20", () => {
    expect(initialWindow(100, 30)).toEqual({ start: 30, end: 50 });
    expect(initialWindow(10, 3)).toEqual({ start: 3, end: 10 });
    expect(initialWindow(10, 99)).toEqual({ start: 9, end: 10 });
    expect(initialWindow(0, 0)).toEqual({ start: 0, end: 0 });
  });

  it("waits until playback nears the end of what's loaded", () => {
    const base = { queueLength: 100, windowStart: 0, loadedCount: 20 };
    expect(tracksToLoadNext({ ...base, playingOffset: 5 })).toBe(0);
    expect(tracksToLoadNext({ ...base, playingOffset: 16 })).toBe(20);
  });

  it("loads only what's left and stops at the end", () => {
    expect(tracksToLoadNext({ queueLength: 25, windowStart: 0, loadedCount: 20, playingOffset: 18 })).toBe(5);
    expect(tracksToLoadNext({ queueLength: 20, windowStart: 0, loadedCount: 20, playingOffset: 19 })).toBe(0);
  });
});

describe("shuffled", () => {
  const items = Array.from({ length: 20 }, (_, i) => i);
  const seeded = () => {
    let x = 42;
    return () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296);
  };

  it("keeps every item exactly once and leaves the original alone", () => {
    const copy = [...items];
    const out = shuffled(items, seeded());
    expect([...out].sort((a, b) => a - b)).toEqual(items);
    expect(items).toEqual(copy);
    expect(out).not.toEqual(items);
  });

  it("starts with the chosen item when asked", () => {
    const out = shuffled(items, seeded(), 7);
    expect(out[0]).toBe(7);
    expect([...out].sort((a, b) => a - b)).toEqual(items);
  });

  it("is repeatable for the same random source and handles tiny lists", () => {
    expect(shuffled(items, seeded())).toEqual(shuffled(items, seeded()));
    expect(shuffled([], seeded())).toEqual([]);
    expect(shuffled([1], seeded())).toEqual([1]);
    expect(shuffled([1, 2], seeded(), 5)).toHaveLength(2);
  });
});
