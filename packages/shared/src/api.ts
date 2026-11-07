import type { Device, Track, TrackMetadata } from "./types";

/**
 * Request and response shapes for the CD Wallet API. This file is the contract:
 * the API, the CLI and the Android app all import these types.
 *
 * Auth: "admin" routes need the owner's admin token, "device" routes accept a
 * phone's device token or the admin token. Both go in `Authorization: Bearer <token>`.
 */

export interface ApiErrorBody {
  error: { code: string; message: string };
}

/** POST /tracks/check  (admin) */
export interface CheckTracksRequest {
  /** Up to 500 hashes. */
  hashes: string[];
}
export interface CheckTracksResponse {
  /** Hashes the server does not have yet. */
  missing: string[];
}

/** POST /uploads  (admin) */
export interface CreateUploadRequest {
  hash: string;
  sizeBytes: number;
  artHash?: string;
}
export interface CreateUploadResponse {
  audio: { url: string; headers?: Record<string, string> };
  /** Present only when `artHash` was sent and that art is not stored yet. */
  art?: { url: string; headers?: Record<string, string> };
  expiresAt: string;
}

/** POST /tracks  (admin). Idempotent by hash; 409 if the audio file was never uploaded. */
export type AddTrackRequest = TrackMetadata;
export interface AddTrackResponse {
  track: Track;
  libraryVersion: number;
}

/**
 * GET /library?since=N  (device or admin)
 *
 * Returns tracks changed after version N, in pages. While `hasMore` is true, call again with
 * `since` set to the returned `version`. When it is false, store `version` and use it next
 * time. Applying a track or deletion twice is harmless, and the server may resend a few
 * recent changes, so clients should upsert by track id.
 */
export interface LibraryResponse {
  version: number;
  tracks: Track[];
  /** Ids of tracks removed since N. */
  deletedIds: string[];
  hasMore: boolean;
}

/** POST /stream-urls  (device or admin) */
export interface StreamUrlsRequest {
  /** Up to 20 track ids. */
  trackIds: string[];
}
export interface StreamUrlsResponse {
  urls: Array<{ trackId: string; url: string; expiresAt: string }>;
}

/** GET /art/{artHash}  (device or admin): 302 redirect to a presigned image URL. */

/** POST /pairing  (admin) */
export interface CreatePairingRequest {
  deviceName?: string;
}
export interface CreatePairingResponse {
  /** One-time code, valid for 5 minutes. */
  code: string;
  expiresAt: string;
}

/** POST /pairing/claim  (no token) */
export interface ClaimPairingRequest {
  code: string;
  deviceName: string;
}
export interface ClaimPairingResponse {
  deviceId: string;
  /** Long-lived read-only token. Shown once; the server keeps only its hash. */
  deviceToken: string;
}

/** GET /devices  (admin) */
export interface ListDevicesResponse {
  devices: Device[];
}
/** DELETE /devices/{id}  (admin): revokes one device. Returns 204. */

export const API_LIMITS = {
  checkTracksMaxHashes: 500,
  streamUrlsMaxTracks: 20,
  pairingCodeTtlSeconds: 300,
  /** Largest single MP3 the API will sign an upload for. */
  maxAudioBytes: 250 * 1024 * 1024,
} as const;
