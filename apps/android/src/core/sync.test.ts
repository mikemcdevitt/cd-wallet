import type { LibraryResponse, Track } from "@cdwallet/shared";
import { describe, expect, it } from "vitest";
import { SqlLibrary } from "./sql-library";
import { syncLibrary } from "./sync";
import { makeTrack, nodeSqlDb } from "./testing";

/** A fake server holding tracks with versions, paging like the real one. */
function fakeServer(tracks: Track[], pageSize: number, startVersion = 0) {
  let version = startVersion + tracks.length;
  const deleted: Array<{ id: string; version: number }> = [];
  const versions = new Map(tracks.map((t, i) => [t.hash, startVersion + i + 1]));
  return {
    setVersionBackwards(v: number) {
      version = v;
    },
    deleteTrack(id: string) {
      version += 1;
      versions.delete(id);
      deleted.push({ id, version });
    },
    async library(since: number): Promise<LibraryResponse> {
      const changed = tracks.filter((t) => versions.has(t.hash) && (versions.get(t.hash) ?? 0) > since).sort((a, b) => (versions.get(a.hash) ?? 0) - (versions.get(b.hash) ?? 0));
      const page = changed.slice(0, pageSize);
      const hasMore = changed.length > page.length;
      const last = page[page.length - 1];
      return {
        version: hasMore && last ? (versions.get(last.hash) ?? since) : version,
        tracks: page,
        deletedIds: deleted.filter((d) => d.version > since).map((d) => d.id),
        hasMore,
      };
    },
  };
}

describe("library sync", () => {
  it("pages through the whole library and remembers the version", async () => {
    const tracks = Array.from({ length: 25 }, (_, i) => makeTrack(i + 1));
    const lib = await SqlLibrary.open(nodeSqlDb());
    const server = fakeServer(tracks, 10);
    const result = await syncLibrary(server, lib);
    expect(result).toMatchObject({ version: 25, pages: 3, tracksReceived: 25, wasReset: false });
    expect(await lib.count()).toBe(25);
    expect(await lib.getVersion()).toBe(25);
  });

  it("picks up only what changed next time, including deletions", async () => {
    const tracks = Array.from({ length: 5 }, (_, i) => makeTrack(i + 1));
    const lib = await SqlLibrary.open(nodeSqlDb());
    const server = fakeServer(tracks, 500);
    await syncLibrary(server, lib);
    server.deleteTrack(tracks[0]!.hash);
    const second = await syncLibrary(server, lib);
    expect(second.tracksReceived).toBe(0);
    expect(await lib.count()).toBe(4);
    expect(await lib.getVersion()).toBe(6);
  });

  it("is harmless when the server resends tracks we already have", async () => {
    const tracks = [makeTrack(1), makeTrack(2)];
    const lib = await SqlLibrary.open(nodeSqlDb());
    await syncLibrary({ library: async () => ({ version: 2, tracks, deletedIds: [], hasMore: false }) }, lib);
    await syncLibrary({ library: async () => ({ version: 2, tracks, deletedIds: [], hasMore: false }) }, lib);
    expect(await lib.count()).toBe(2);
  });

  it("starts over if the server's library went backwards", async () => {
    const lib = await SqlLibrary.open(nodeSqlDb());
    await syncLibrary(fakeServer(Array.from({ length: 5 }, (_, i) => makeTrack(i + 1)), 500), lib);
    const rebuilt = fakeServer([makeTrack(100), makeTrack(101)], 500);
    const result = await syncLibrary(rebuilt, lib);
    expect(result.wasReset).toBe(true);
    expect(await lib.count()).toBe(2);
    expect(await lib.getVersion()).toBe(2);
  });

  it("refuses to loop forever on a server that doesn't advance", async () => {
    const lib = await SqlLibrary.open(nodeSqlDb());
    const stuck = { library: async (): Promise<LibraryResponse> => ({ version: 0, tracks: [], deletedIds: [], hasMore: true }) };
    await expect(syncLibrary(stuck, lib)).rejects.toThrow(/did not move forward/);
  });

  it("keeps the old library if a page fails to save", async () => {
    const lib = await SqlLibrary.open(nodeSqlDb());
    await syncLibrary(fakeServer([makeTrack(1)], 500), lib);
    const broken = makeTrack(2);
    (broken as { title: unknown }).title = null; // violates NOT NULL
    await expect(lib.applyChanges({ tracks: [makeTrack(3), broken], deletedIds: [], version: 9 })).rejects.toThrow();
    expect(await lib.count()).toBe(1);
    expect(await lib.getVersion()).toBe(1);
  });
});
