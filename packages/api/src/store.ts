import type { Track, TrackMetadata } from "@cdwallet/shared";

/** A track as kept in the database: the public shape plus sync bookkeeping. */
export interface StoredTrack extends Track {
  /** Library version at which this track last changed (added, changed or deleted). */
  version: number;
  /** Set when the track was soft-deleted; clients are told to drop it. */
  deletedAt?: string;
}

export interface Settings {
  /** SHA-256 (hex) of the admin token. Unset until `cdwallet deploy` stores it. */
  adminTokenHash?: string;
  /** Bumped by one on every library change. Starts at 0. */
  libraryVersion: number;
}

export interface DeviceRecord {
  id: string;
  name: string;
  /** SHA-256 (hex) of the full device token. */
  tokenHash: string;
  pairedAt: string;
  lastSeenAt?: string;
}

export interface TrackWrite {
  meta: TrackMetadata;
  audioKey: string;
  artKey?: string;
  /** ISO 8601. */
  now: string;
}

export interface AddResult {
  track: StoredTrack;
  /** False when the track was already in the library (nothing changed). */
  created: boolean;
  libraryVersion: number;
}

export interface LibraryPage {
  /** Version the client can pass as `since` next time. */
  version: number;
  /** Changed tracks in version order, deleted ones included. */
  tracks: StoredTrack[];
  hasMore: boolean;
}

export interface Store {
  getSettings(): Promise<Settings>;
  getDevice(id: string): Promise<DeviceRecord | undefined>;
  /** Which of these hashes are in the library and not deleted. */
  findLiveHashes(hashes: string[]): Promise<Set<string>>;
  /** Idempotent by hash. A previously deleted track is brought back. */
  addTrack(write: TrackWrite): Promise<AddResult>;
  /** Tracks whose version is greater than `after`, oldest change first. */
  listChanges(after: number, limit: number): Promise<LibraryPage>;
}

export function toTrack(stored: StoredTrack): Track {
  const { version: _version, deletedAt: _deletedAt, ...track } = stored;
  return track;
}
