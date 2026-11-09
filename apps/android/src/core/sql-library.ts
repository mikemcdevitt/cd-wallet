import type { Track } from "@cdwallet/shared";
import {
  albumKey,
  artistKey,
  artistOf,
  searchTerms,
  toLibraryTrack,
  type AlbumSummary,
  type ArtistSummary,
  type LibraryQueries,
  type LibraryTrack,
} from "./library";
import type { LibrarySink } from "./sync";

/** The little bit of SQLite the library needs. expo-sqlite implements it in the app; Node's sqlite in tests. */
export interface SqlDb {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: Array<string | number | null>): Promise<void>;
  all<T>(sql: string, params?: Array<string | number | null>): Promise<T[]>;
  transaction(fn: () => Promise<void>): Promise<void>;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album_artist TEXT,
  album TEXT NOT NULL,
  track_no INTEGER,
  disc_no INTEGER,
  year INTEGER,
  duration_sec REAL NOT NULL,
  art_hash TEXT,
  album_key TEXT NOT NULL,
  artist_key TEXT NOT NULL,
  artist_display TEXT NOT NULL,
  search_text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tracks_album ON tracks (album_key);
CREATE INDEX IF NOT EXISTS tracks_artist ON tracks (artist_key);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
`;

interface TrackRow {
  id: string;
  title: string;
  artist: string;
  album_artist: string | null;
  album: string;
  track_no: number | null;
  disc_no: number | null;
  year: number | null;
  duration_sec: number;
  art_hash: string | null;
}

const rowToTrack = (r: TrackRow): LibraryTrack => ({
  id: r.id,
  title: r.title,
  artist: r.artist,
  albumArtist: r.album_artist ?? undefined,
  album: r.album,
  trackNo: r.track_no ?? undefined,
  discNo: r.disc_no ?? undefined,
  year: r.year ?? undefined,
  durationSec: r.duration_sec,
  artHash: r.art_hash ?? undefined,
});

/** Escapes LIKE wildcards so searching for "100%" or "a_b" matches literally. */
const likePattern = (term: string) => `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

function searchClause(query: string | undefined, params: Array<string | number | null>): string {
  const terms = searchTerms(query ?? "");
  for (const t of terms) params.push(likePattern(t));
  return terms.map(() => "search_text LIKE ? ESCAPE '\\'").join(" AND ");
}

export class SqlLibrary implements LibraryQueries, LibrarySink {
  constructor(private readonly db: SqlDb) {}

  static async open(db: SqlDb): Promise<SqlLibrary> {
    await db.exec(SCHEMA);
    return new SqlLibrary(db);
  }

  async getVersion(): Promise<number> {
    const rows = await this.db.all<{ value: string }>("SELECT value FROM meta WHERE key = 'version'");
    return rows[0] ? Number(rows[0].value) : 0;
  }

  async applyChanges(change: { tracks: Track[]; deletedIds: string[]; version: number }): Promise<void> {
    await this.db.transaction(async () => {
      for (const t of change.tracks) {
        const lt = toLibraryTrack(t);
        await this.db.run(
          `INSERT OR REPLACE INTO tracks (id, title, artist, album_artist, album, track_no, disc_no, year, duration_sec, art_hash,
             album_key, artist_key, artist_display, search_text)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            lt.id,
            lt.title,
            lt.artist,
            lt.albumArtist ?? null,
            lt.album,
            lt.trackNo ?? null,
            lt.discNo ?? null,
            lt.year ?? null,
            lt.durationSec,
            lt.artHash ?? null,
            albumKey(lt),
            artistKey(lt),
            artistOf(lt),
            `${lt.title} ${lt.artist} ${lt.album}`.toLowerCase(),
          ],
        );
      }
      for (const id of change.deletedIds) await this.db.run("DELETE FROM tracks WHERE id = ?", [id]);
      await this.db.run("INSERT OR REPLACE INTO meta (key, value) VALUES ('version', ?)", [String(change.version)]);
    });
  }

  async reset(): Promise<void> {
    await this.db.transaction(async () => {
      await this.db.run("DELETE FROM tracks");
      await this.db.run("DELETE FROM meta");
    });
  }

  async count(): Promise<number> {
    const rows = await this.db.all<{ n: number }>("SELECT COUNT(*) AS n FROM tracks");
    return rows[0]?.n ?? 0;
  }

  async tracks(opts: { query?: string; albumKey?: string; artistKey?: string; limit?: number } = {}): Promise<LibraryTrack[]> {
    const params: Array<string | number | null> = [];
    const where: string[] = [];
    const search = searchClause(opts.query, params);
    if (search) where.push(search);
    if (opts.albumKey) {
      where.push("album_key = ?");
      params.push(opts.albumKey);
    }
    if (opts.artistKey) {
      where.push("artist_key = ?");
      params.push(opts.artistKey);
    }
    // Inside an album, play in disc and track order; elsewhere, alphabetical by title.
    const order = opts.albumKey
      ? "COALESCE(disc_no, 1), COALESCE(track_no, 9999), title COLLATE NOCASE"
      : "title COLLATE NOCASE, artist COLLATE NOCASE";
    let sql = `SELECT * FROM tracks ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ${order}`;
    if (opts.limit) {
      sql += " LIMIT ?";
      params.push(opts.limit);
    }
    return (await this.db.all<TrackRow>(sql, params)).map(rowToTrack);
  }

  async albums(opts: { query?: string; artistKey?: string } = {}): Promise<AlbumSummary[]> {
    const params: Array<string | number | null> = [];
    const where: string[] = [];
    const search = searchClause(opts.query, params);
    if (search) where.push(search);
    if (opts.artistKey) {
      where.push("artist_key = ?");
      params.push(opts.artistKey);
    }
    const rows = await this.db.all<{
      album_key: string;
      album: string;
      artist: string;
      year: number | null;
      art_hash: string | null;
      n: number;
    }>(
      `SELECT album_key, MIN(album) AS album, MIN(artist_display) AS artist, MIN(year) AS year, MIN(art_hash) AS art_hash, COUNT(*) AS n
       FROM tracks ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       GROUP BY album_key ORDER BY MIN(album) COLLATE NOCASE, MIN(artist_display) COLLATE NOCASE`,
      params,
    );
    return rows.map((r) => ({
      key: r.album_key,
      album: r.album,
      artist: r.artist,
      year: r.year ?? undefined,
      artHash: r.art_hash ?? undefined,
      trackCount: r.n,
    }));
  }

  async artists(opts: { query?: string } = {}): Promise<ArtistSummary[]> {
    const params: Array<string | number | null> = [];
    const search = searchClause(opts.query, params);
    const rows = await this.db.all<{ artist_key: string; artist: string; albums: number; n: number }>(
      `SELECT artist_key, MIN(artist_display) AS artist, COUNT(DISTINCT album_key) AS albums, COUNT(*) AS n
       FROM tracks ${search ? `WHERE ${search}` : ""}
       GROUP BY artist_key ORDER BY MIN(artist_display) COLLATE NOCASE`,
      params,
    );
    return rows.map((r) => ({ key: r.artist_key, artist: r.artist, albumCount: r.albums, trackCount: r.n }));
  }
}
