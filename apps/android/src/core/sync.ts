import type { Track } from "@cdwallet/shared";
import type { ApiClient } from "./api-client";

/** Where synced library changes are written. */
export interface LibrarySink {
  getVersion(): Promise<number>;
  /** Applies one page atomically: upsert tracks, remove deleted ids, then record `version`. */
  applyChanges(change: { tracks: Track[]; deletedIds: string[]; version: number }): Promise<void>;
  /** Forgets everything (used if the server's library restarted from scratch). */
  reset(): Promise<void>;
}

export interface SyncResult {
  version: number;
  pages: number;
  tracksReceived: number;
  wasReset: boolean;
}

export async function syncLibrary(
  client: Pick<ApiClient, "library">,
  sink: LibrarySink,
  onProgress?: (tracksReceived: number) => void,
): Promise<SyncResult> {
  let since = await sink.getVersion();
  let pages = 0;
  let tracksReceived = 0;
  let wasReset = false;

  for (;;) {
    const res = await client.library(since);
    if (res.version < since) {
      // The server is behind us: it is a different or rebuilt library. Start over once.
      if (wasReset) throw new Error("The server's library version keeps going backwards.");
      await sink.reset();
      since = 0;
      wasReset = true;
      pages = 0;
      tracksReceived = 0;
      continue;
    }
    if (res.hasMore && res.version <= since) throw new Error("The server said there is more, but did not move forward.");
    await sink.applyChanges({ tracks: res.tracks, deletedIds: res.deletedIds, version: res.version });
    pages += 1;
    tracksReceived += res.tracks.length;
    onProgress?.(tracksReceived);
    since = res.version;
    if (!res.hasMore) return { version: since, pages, tracksReceived, wasReset };
  }
}
