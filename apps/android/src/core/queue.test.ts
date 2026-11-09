import { describe, expect, it } from "vitest";
import { initialWindow, tracksToLoadNext } from "./queue";

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
