import {
  API_LIMITS,
  type AddTrackRequest,
  type CheckTracksRequest,
  type CreatePairingRequest,
  type CreateUploadRequest,
  type MetaSource,
  type StreamUrlsRequest,
} from "@cdwallet/shared";
import { HttpError } from "./errors";

const HASH = /^[0-9a-f]{64}$/;
const META_SOURCES: readonly MetaSource[] = ["tags", "folder"];
export const MAX_AUDIO_BYTES = API_LIMITS.maxAudioBytes;

const bad = (message: string): never => {
  throw new HttpError(400, "invalid_request", message);
};

type Obj = Record<string, unknown>;

function asObject(value: unknown): Obj {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return bad("Request body must be a JSON object");
  }
  return value as Obj;
}

export function hashField(value: unknown, name: string): string {
  if (typeof value !== "string" || !HASH.test(value)) {
    return bad(`${name} must be a lowercase hex SHA-256 (64 characters)`);
  }
  return value;
}

function text(o: Obj, key: string, max = 500): string {
  const v = o[key];
  if (typeof v !== "string" || v.trim() === "" || v.length > max) {
    return bad(`${key} must be a non-empty string up to ${max} characters`);
  }
  return v;
}

function optText(o: Obj, key: string, max = 500): string | undefined {
  return o[key] === undefined ? undefined : text(o, key, max);
}

function num(o: Obj, key: string, min: number, max: number, integer: boolean): number {
  const v = o[key];
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) {
    return bad(`${key} must be ${integer ? "an integer" : "a number"} between ${min} and ${max}`);
  }
  return v;
}

function optInt(o: Obj, key: string, min: number, max: number): number | undefined {
  return o[key] === undefined ? undefined : num(o, key, min, max, true);
}

export function parseCheckTracks(body: unknown): CheckTracksRequest {
  const o = asObject(body);
  const hashes = o.hashes;
  if (!Array.isArray(hashes) || hashes.length > API_LIMITS.checkTracksMaxHashes) {
    return bad(`hashes must be an array of up to ${API_LIMITS.checkTracksMaxHashes} items`);
  }
  return { hashes: hashes.map((h) => hashField(h, "hashes[]")) };
}

export function parseCreateUpload(body: unknown): CreateUploadRequest {
  const o = asObject(body);
  const request: CreateUploadRequest = {
    hash: hashField(o.hash, "hash"),
    sizeBytes: num(o, "sizeBytes", 1, MAX_AUDIO_BYTES, true),
  };
  if (o.artHash !== undefined) request.artHash = hashField(o.artHash, "artHash");
  return request;
}

export function parseAddTrack(body: unknown): AddTrackRequest {
  const o = asObject(body);
  const source = o.metaSource;
  if (typeof source !== "string" || !META_SOURCES.includes(source as MetaSource)) {
    return bad(`metaSource must be one of: ${META_SOURCES.join(", ")}`);
  }

  const track: AddTrackRequest = {
    hash: hashField(o.hash, "hash"),
    title: text(o, "title"),
    artist: text(o, "artist"),
    album: text(o, "album"),
    durationSec: num(o, "durationSec", 0, 24 * 3600, false),
    sizeBytes: num(o, "sizeBytes", 1, MAX_AUDIO_BYTES, true),
    metaSource: source as MetaSource,
    originalPath: text(o, "originalPath", 2000),
  };

  const albumArtist = optText(o, "albumArtist");
  const genre = optText(o, "genre", 200);
  const trackNo = optInt(o, "trackNo", 0, 9999);
  const discNo = optInt(o, "discNo", 0, 999);
  const year = optInt(o, "year", 0, 9999);
  const bitrate = optInt(o, "bitrate", 0, 10_000_000);
  if (albumArtist !== undefined) track.albumArtist = albumArtist;
  if (genre !== undefined) track.genre = genre;
  if (trackNo !== undefined) track.trackNo = trackNo;
  if (discNo !== undefined) track.discNo = discNo;
  if (year !== undefined) track.year = year;
  if (bitrate !== undefined) track.bitrate = bitrate;
  if (o.artHash !== undefined) track.artHash = hashField(o.artHash, "artHash");
  return track;
}

export function parseSince(value: string | undefined): number {
  if (value === undefined || value === "") return 0;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return bad("since must be a non-negative integer");
  return n;
}

export function parseStreamUrls(body: unknown): StreamUrlsRequest {
  const ids = asObject(body).trackIds;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > API_LIMITS.streamUrlsMaxTracks) {
    return bad(`trackIds must be an array of 1 to ${API_LIMITS.streamUrlsMaxTracks} items`);
  }
  return { trackIds: ids.map((id) => hashField(id, "trackIds[]")) };
}

/** The pairing request may have no body at all. */
export function parseCreatePairing(body: unknown): CreatePairingRequest {
  if (body === undefined) return {};
  const name = optText(asObject(body), "deviceName", API_LIMITS.maxDeviceNameLength);
  return name === undefined ? {} : { deviceName: name };
}

export function parseClaimPairing(body: unknown): { code: string; deviceName?: string } {
  const o = asObject(body);
  if (typeof o.code !== "string" || o.code.length > 64) return bad("code must be a string");
  const deviceName = optText(o, "deviceName", API_LIMITS.maxDeviceNameLength);
  return deviceName === undefined ? { code: o.code } : { code: o.code, deviceName };
}
