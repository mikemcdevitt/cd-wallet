import { createRequire } from "node:module";
import type { Track } from "@cdwallet/shared";
import type { SqlDb } from "./sql-library";

interface NodeStatement {
  run(...p: unknown[]): unknown;
  all(...p: unknown[]): unknown[];
}
interface NodeDb {
  exec(sql: string): void;
  prepare(sql: string): NodeStatement;
}

/** A SqlDb backed by Node's built-in SQLite, so the real SQL runs in tests. */
export function nodeSqlDb(): SqlDb {
  const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => NodeDb };
  const db = new DatabaseSync(":memory:");
  return {
    exec: async (sql) => db.exec(sql),
    run: async (sql, params = []) => void db.prepare(sql).run(...params),
    all: async <T>(sql: string, params: Array<string | number | null> = []) => db.prepare(sql).all(...params) as T[],
    transaction: async (fn) => {
      db.exec("BEGIN");
      try {
        await fn();
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
  };
}

export function makeTrack(n: number, over: Partial<Track> = {}): Track {
  return {
    hash: n.toString(16).padStart(64, "0"),
    title: `Song ${n}`,
    artist: "Artist",
    album: "Album",
    durationSec: 180,
    sizeBytes: 5_000_000,
    metaSource: "tags",
    originalPath: `Artist/Album/${n}.mp3`,
    addedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
