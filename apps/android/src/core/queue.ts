import { API_LIMITS } from "@cdwallet/shared";

/**
 * A long queue can't all be signed at once (the server signs 20 at a time and each URL
 * expires), so the player holds a window of the queue and extends it as playback moves on.
 */
export const QUEUE_WINDOW = API_LIMITS.streamUrlsMaxTracks;
const LOOKAHEAD = 3;

/** Index range [start, end) of queue positions to load first when playing `startIndex`. */
export function initialWindow(queueLength: number, startIndex: number): { start: number; end: number } {
  const start = Math.min(Math.max(0, startIndex), Math.max(0, queueLength - 1));
  return { start, end: Math.min(queueLength, start + QUEUE_WINDOW) };
}

/**
 * Given how many tracks are loaded and which one is playing (both counted from the window
 * start), returns how many more queue positions to load now, or 0 if it's too early.
 */
export function tracksToLoadNext(opts: { queueLength: number; windowStart: number; loadedCount: number; playingOffset: number }): number {
  const nextPos = opts.windowStart + opts.loadedCount;
  const remainingInQueue = opts.queueLength - nextPos;
  if (remainingInQueue <= 0) return 0;
  const loadedAhead = opts.loadedCount - opts.playingOffset - 1;
  if (loadedAhead > LOOKAHEAD) return 0;
  return Math.min(QUEUE_WINDOW, remainingInQueue);
}
