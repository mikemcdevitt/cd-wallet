import type { Track } from "@cdwallet/shared";

/** The part of a track the app keeps on the phone. */
export interface LibraryTrack {
  id: string;
  title: string;
  artist: string;
  albumArtist?: string;
  album: string;
  trackNo?: number;
  discNo?: number;
  year?: number;
  durationSec: number;
  artHash?: string;
}

export interface AlbumSummary {
  key: string;
  album: string;
  artist: string;
  year?: number;
  artHash?: string;
  trackCount: number;
}

export interface ArtistSummary {
  key: string;
  artist: string;
  albumCount: number;
  trackCount: number;
}

export function toLibraryTrack(t: Track): LibraryTrack {
  return {
    id: t.hash,
    title: t.title,
    artist: t.artist,
    albumArtist: t.albumArtist,
    album: t.album,
    trackNo: t.trackNo,
    discNo: t.discNo,
    year: t.year,
    durationSec: t.durationSec,
    artHash: t.artHash,
  };
}

const norm = (s: string) => s.trim().toLowerCase();

/** Compilations stay together under the album artist; otherwise albums group by track artist. */
export const artistOf = (t: Pick<LibraryTrack, "artist" | "albumArtist">) => t.albumArtist?.trim() || t.artist;
export const albumKey = (t: Pick<LibraryTrack, "artist" | "albumArtist" | "album">) => `${norm(artistOf(t))}\u0001${norm(t.album)}`;
export const artistKey = (t: Pick<LibraryTrack, "artist" | "albumArtist">) => norm(artistOf(t));

/** Searching looks at title, artist and album, ignoring case; every word must match. */
export function searchTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export interface LibraryQueries {
  tracks(opts?: { query?: string; albumKey?: string; artistKey?: string; limit?: number }): Promise<LibraryTrack[]>;
  albums(opts?: { query?: string; artistKey?: string }): Promise<AlbumSummary[]>;
  artists(opts?: { query?: string }): Promise<ArtistSummary[]>;
  count(): Promise<number>;
}
