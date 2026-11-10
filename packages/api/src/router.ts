import {
  API_LIMITS,
  AUDIO_CONTAINERS,
  formatPairingCode,
  isPairingCode,
  normalizePairingCode,
  type AddTrackResponse,
  type ApiErrorBody,
  type CheckTracksResponse,
  type ClaimPairingResponse,
  type CreatePairingResponse,
  type CreateUploadResponse,
  type LibraryResponse,
  type ListDevicesResponse,
  type StreamUrlsResponse,
} from "@cdwallet/shared";
import { authenticate, requireRole, sha256Hex, type Principal } from "./auth";
import { HttpError } from "./errors";
import { artKey, audioKey } from "./keys";
import { newDeviceCredentials, newPairingCode, type RandomBytes } from "./pairing";
import type { Storage } from "./storage";
import { toTrack, type Store } from "./store";
import {
  hashField,
  parseAddTrack,
  parseCheckTracks,
  parseClaimPairing,
  parseCreatePairing,
  parseCreateUpload,
  parseSince,
  parseStreamUrls,
} from "./validate";

export interface HttpRequest {
  method: string;
  path: string;
  /** Header names lowercased. */
  headers: Record<string, string | undefined>;
  query: Record<string, string | undefined>;
  body?: string;
}

export interface HttpResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export interface Deps {
  store: Store;
  storage: Storage;
  now: () => Date;
  /** Source of randomness for codes and tokens; tests replace it. */
  random?: RandomBytes;
  /** Tracks per /library page. */
  libraryPageSize?: number;
  /**
   * How many versions back each /library call reaches. The version index is eventually
   * consistent, so a change committed a moment ago might not be listed yet; the next sync
   * picks it up because of this overlap.
   */
  libraryOverlap?: number;
}

export const UPLOAD_URL_TTL_SECONDS = 15 * 60;
const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_OVERLAP = 25;
const DEVICE_ID = /^[0-9a-f]{16}$/;

function json(statusCode: number, value: unknown): HttpResponse {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  };
}

function errorResponse(status: number, code: string, message: string): HttpResponse {
  const body: ApiErrorBody = { error: { code, message } };
  return json(status, body);
}

function parseJson(body: string | undefined): unknown {
  if (!body) throw new HttpError(400, "invalid_request", "Request body is required");
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new HttpError(400, "invalid_request", "Request body is not valid JSON");
  }
}

const inSeconds = (deps: Deps, seconds: number): string => new Date(deps.now().getTime() + seconds * 1000).toISOString();

export async function route(req: HttpRequest, deps: Deps): Promise<HttpResponse> {
  try {
    return await dispatch(req, deps);
  } catch (err) {
    if (err instanceof HttpError) return errorResponse(err.status, err.code, err.message);
    console.error("Unhandled error", err);
    return errorResponse(500, "internal", "Something went wrong");
  }
}

async function dispatch(req: HttpRequest, deps: Deps): Promise<HttpResponse> {
  const method = req.method.toUpperCase();
  const path = req.path.replace(/\/+$/, "") || "/";
  const key = `${method} ${path}`;

  if (key === "GET /health") return json(200, { ok: true, service: "cd-wallet" });

  // Pairing is how a phone gets its first token, so this is the one route that needs none.
  if (key === "POST /pairing/claim") return claimPairing(req, deps);

  const principal = await authenticate(req.headers.authorization, deps.store, deps.now());
  const require = (...roles: Array<Principal["role"]>) => requireRole(principal, roles);

  switch (key) {
    case "POST /tracks/check":
      require("admin");
      return checkTracks(req, deps);
    case "POST /uploads":
      require("admin");
      return createUpload(req, deps);
    case "POST /tracks":
      require("admin");
      return addTrack(req, deps);
    case "GET /library":
      require("admin", "device");
      return library(req, deps);
    case "POST /stream-urls":
      require("admin", "device");
      return streamUrls(req, deps);
    case "POST /pairing":
      require("admin");
      return createPairing(req, deps);
    case "GET /devices":
      require("admin");
      return listDevices(deps);
  }

  const art = /^\/art\/([^/]+)$/.exec(path);
  if (method === "GET" && art) {
    require("admin", "device");
    return coverArt(decodeURIComponent(art[1] ?? ""), deps);
  }

  const device = /^\/devices\/([^/]+)$/.exec(path);
  if (method === "DELETE" && device) {
    require("admin");
    return revokeDevice(decodeURIComponent(device[1] ?? ""), deps);
  }

  throw new HttpError(404, "not_found", "No such route");
}

async function checkTracks(req: HttpRequest, deps: Deps): Promise<HttpResponse> {
  const { hashes } = parseCheckTracks(parseJson(req.body));
  const live = await deps.store.findLiveHashes(hashes);
  const missing = [...new Set(hashes)].filter((hash) => !live.has(hash));
  const body: CheckTracksResponse = { missing };
  return json(200, body);
}

async function createUpload(req: HttpRequest, deps: Deps): Promise<HttpResponse> {
  const { hash, sizeBytes, artHash, container = "mp3" } = parseCreateUpload(parseJson(req.body));
  const expiresInSeconds = UPLOAD_URL_TTL_SECONDS;
  const contentType = AUDIO_CONTAINERS[container].contentType;

  const audioUrl = await deps.storage.presignPut({
    key: audioKey(hash, container),
    contentType,
    contentLength: sizeBytes,
    expiresInSeconds,
  });
  const body: CreateUploadResponse = {
    container,
    audio: { url: audioUrl, headers: { "content-type": contentType } },
    expiresAt: inSeconds(deps, expiresInSeconds),
  };

  if (artHash && !(await deps.storage.objectExists(artKey(artHash)))) {
    const artUrl = await deps.storage.presignPut({
      key: artKey(artHash),
      contentType: "image/jpeg",
      expiresInSeconds,
    });
    body.art = { url: artUrl, headers: { "content-type": "image/jpeg" } };
  }
  return json(200, body);
}

async function addTrack(req: HttpRequest, deps: Deps): Promise<HttpResponse> {
  const meta = parseAddTrack(parseJson(req.body));

  const key = audioKey(meta.hash, meta.container);
  if (!(await deps.storage.objectExists(key))) {
    throw new HttpError(409, "audio_not_uploaded", "Upload the audio file before adding the track");
  }
  if (meta.artHash && !(await deps.storage.objectExists(artKey(meta.artHash)))) {
    throw new HttpError(409, "art_not_uploaded", "Upload the cover art before adding the track");
  }

  const write = {
    meta,
    audioKey: key,
    now: deps.now().toISOString(),
    ...(meta.artHash ? { artKey: artKey(meta.artHash) } : {}),
  };
  const result = await deps.store.addTrack(write);
  const body: AddTrackResponse = { track: toTrack(result.track), libraryVersion: result.libraryVersion };
  return json(result.created ? 201 : 200, body);
}

async function library(req: HttpRequest, deps: Deps): Promise<HttpResponse> {
  const since = parseSince(req.query.since);
  const overlap = deps.libraryOverlap ?? DEFAULT_OVERLAP;
  const pageSize = deps.libraryPageSize ?? DEFAULT_PAGE_SIZE;

  const page = await deps.store.listChanges(Math.max(0, since - overlap), pageSize);
  const body: LibraryResponse = {
    version: page.version,
    tracks: page.tracks.filter((t) => !t.deletedAt).map(toTrack),
    deletedIds: page.tracks.filter((t) => t.deletedAt).map((t) => t.hash),
    hasMore: page.hasMore,
  };
  return json(200, body);
}

/** Short-lived download links for playing. Tracks that are unknown or deleted are left out. */
async function streamUrls(req: HttpRequest, deps: Deps): Promise<HttpResponse> {
  const { trackIds } = parseStreamUrls(parseJson(req.body));
  const liveKeys = await deps.store.findLiveAudioKeys(trackIds);
  const ttl = API_LIMITS.streamUrlTtlSeconds;
  const expiresAt = inSeconds(deps, ttl);

  const urls = await Promise.all(
    [...new Set(trackIds)]
      .flatMap((trackId) => {
        const key = liveKeys.get(trackId);
        return key === undefined ? [] : [{ trackId, key }];
      })
      .map(async ({ trackId, key }) => ({ trackId, url: await deps.storage.presignGet(key, ttl), expiresAt })),
  );
  const body: StreamUrlsResponse = { urls };
  return json(200, body);
}

async function coverArt(artHash: string, deps: Deps): Promise<HttpResponse> {
  hashField(artHash, "artHash");
  if (!(await deps.storage.objectExists(artKey(artHash)))) {
    throw new HttpError(404, "not_found", "No such cover");
  }
  const url = await deps.storage.presignGet(artKey(artHash), API_LIMITS.streamUrlTtlSeconds);
  return { statusCode: 302, headers: { location: url, "cache-control": "private, max-age=300" }, body: "" };
}

async function createPairing(req: HttpRequest, deps: Deps): Promise<HttpResponse> {
  const { deviceName } = parseCreatePairing(req.body ? parseJson(req.body) : undefined);
  const code = newPairingCode(deps.random);
  const expiresAt = inSeconds(deps, API_LIMITS.pairingCodeTtlSeconds);

  await deps.store.createPairing({
    codeHash: sha256Hex(code),
    expiresAt,
    ...(deviceName ? { deviceName } : {}),
  });
  const body: CreatePairingResponse = { code: formatPairingCode(code), expiresAt };
  return json(201, body);
}

async function claimPairing(req: HttpRequest, deps: Deps): Promise<HttpResponse> {
  const { code, deviceName } = parseClaimPairing(parseJson(req.body));
  const normalized = normalizePairingCode(code);
  const claimed = isPairingCode(normalized) ? await deps.store.claimPairing(sha256Hex(normalized), deps.now()) : undefined;
  // One answer for malformed, unknown, used and expired codes, so a guesser learns nothing.
  if (!claimed) throw new HttpError(400, "invalid_code", "That pairing code is not valid or has expired");

  const { id, token } = newDeviceCredentials(deps.random);
  await deps.store.createDevice({
    id,
    name: deviceName ?? claimed.deviceName ?? "Phone",
    tokenHash: sha256Hex(token),
    pairedAt: deps.now().toISOString(),
  });
  const body: ClaimPairingResponse = { deviceId: id, deviceToken: token };
  return json(201, body);
}

async function listDevices(deps: Deps): Promise<HttpResponse> {
  const devices = await deps.store.listDevices();
  const body: ListDevicesResponse = {
    devices: devices.map(({ tokenHash: _tokenHash, ...device }) => device),
  };
  return json(200, body);
}

async function revokeDevice(id: string, deps: Deps): Promise<HttpResponse> {
  if (!DEVICE_ID.test(id) || !(await deps.store.deleteDevice(id))) {
    throw new HttpError(404, "not_found", "No such device");
  }
  return { statusCode: 204, headers: {}, body: "" };
}
