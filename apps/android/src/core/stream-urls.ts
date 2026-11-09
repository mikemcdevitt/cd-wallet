import { API_LIMITS } from "@cdwallet/shared";
import type { ApiClient } from "./api-client";

interface Cached {
  url: string;
  expiresAtMs: number;
}

/**
 * Hands out signed stream URLs, asking the server in batches of up to 20 and reusing a URL
 * until it is close to expiring.
 */
export class StreamUrlResolver {
  private cache = new Map<string, Cached>();

  constructor(
    private readonly client: Pick<ApiClient, "streamUrls">,
    private readonly now: () => number = Date.now,
    /** Fetch a fresh URL when less than this much time is left. */
    private readonly minRemainingMs = 5 * 60 * 1000,
  ) {}

  /** Returns a URL for every id, in the same order. */
  async resolve(trackIds: string[]): Promise<string[]> {
    const stale = [...new Set(trackIds)].filter((id) => !this.fresh(id));
    for (let i = 0; i < stale.length; i += API_LIMITS.streamUrlsMaxTracks) {
      const batch = stale.slice(i, i + API_LIMITS.streamUrlsMaxTracks);
      const res = await this.client.streamUrls(batch);
      for (const u of res.urls) this.cache.set(u.trackId, { url: u.url, expiresAtMs: Date.parse(u.expiresAt) });
    }
    return trackIds.map((id) => {
      const hit = this.cache.get(id);
      if (!hit) throw new Error(`The server did not return a stream address for track ${id}.`);
      return hit.url;
    });
  }

  private fresh(id: string): boolean {
    const hit = this.cache.get(id);
    return !!hit && hit.expiresAtMs - this.now() > this.minRemainingMs;
  }
}
