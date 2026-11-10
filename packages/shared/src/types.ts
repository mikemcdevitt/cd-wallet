import type { AudioContainer } from "./audio";

/** How a track's metadata was obtained at import time. */
export type MetaSource = "tags" | "folder";

/** What the importer reads from a file; the id of a track is its SHA-256 `hash`. */
export interface TrackMetadata {
  /** Lowercase hex SHA-256 of the audio file. Doubles as the track id and S3 key. */
  hash: string;
  title: string;
  artist: string;
  albumArtist?: string;
  album: string;
  trackNo?: number;
  discNo?: number;
  year?: number;
  genre?: string;
  durationSec: number;
  bitrate?: number;
  sizeBytes: number;
  /** File format. Missing means MP3, which is all that older versions of the app stored. */
  container?: AudioContainer;
  /** SHA-256 of the extracted cover art, if the file had any. */
  artHash?: string;
  metaSource: MetaSource;
  /** Path relative to the folder that was imported, using "/" separators. */
  originalPath: string;
}

/** A track as stored by the server and returned to clients. */
export interface Track extends TrackMetadata {
  /** ISO 8601 timestamps. */
  addedAt: string;
  updatedAt: string;
}

export interface Device {
  id: string;
  name: string;
  pairedAt: string;
  lastSeenAt?: string;
}
