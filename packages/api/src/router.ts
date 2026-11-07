import type {
  AddTrackResponse,
  ApiErrorBody,
  CheckTracksResponse,
  CreateUploadResponse,
  LibraryResponse,
} from "@cdwallet/shared";
import { authenticate, requireRole } from "./auth";
import { HttpError } from "./errors";
import { artKey, audioKey } from "./keys";
import type { Storage } from "./storage";
import { toTrack, type Store } from "./store";
import { parseAddTrack, parseCheckTracks, parseCreateUpload, parseSince } from "./validate";

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
  const key = `${req.method.toUpperCase()} ${req.path.replace(/\/+$/, "") || "/"}`;

  if (key === "GET /health") return json(200, { ok: true, service: "cd-wallet" });

  const principal = await authenticate(req.headers.authorization, deps.store);

  switch (key) {
    case "POST /tracks/check":
      requireRole(principal, ["admin"]);
      return checkTracks(req, deps);
    case "POST /uploads":
      requireRole(principal, ["admin"]);
      return createUpload(req, deps);
    case "POST /tracks":
      requireRole(principal, ["admin"]);
      return addTrack(req, deps);
    case "GET /library":
      requireRole(principal, ["admin", "device"]);
      return library(req, deps);
    default:
      throw new HttpError(404, "not_found", "No such route");
  }
}

async function checkTracks(req: HttpRequest, deps: Deps): Promise<HttpResponse> {
  const { hashes } = parseCheckTracks(parseJson(req.body));
  const live = await deps.store.findLiveHashes(hashes);
  const missing = [...new Set(hashes)].filter((hash) => !live.has(hash));
  const body: CheckTracksResponse = { missing };
  return json(200, body);
}

async function createUpload(req: HttpRequest, deps: Deps): Promise<HttpResponse> {
  const { hash, sizeBytes, artHash } = parseCreateUpload(parseJson(req.body));
  const expiresInSeconds = UPLOAD_URL_TTL_SECONDS;

  const audioUrl = await deps.storage.presignPut({
    key: audioKey(hash),
    contentType: "audio/mpeg",
    contentLength: sizeBytes,
    expiresInSeconds,
  });
  const body: CreateUploadResponse = {
    audio: { url: audioUrl, headers: { "content-type": "audio/mpeg" } },
    expiresAt: new Date(deps.now().getTime() + expiresInSeconds * 1000).toISOString(),
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

  if (!(await deps.storage.objectExists(audioKey(meta.hash)))) {
    throw new HttpError(409, "audio_not_uploaded", "Upload the audio file before adding the track");
  }
  if (meta.artHash && !(await deps.storage.objectExists(artKey(meta.artHash)))) {
    throw new HttpError(409, "art_not_uploaded", "Upload the cover art before adding the track");
  }

  const write = {
    meta,
    audioKey: audioKey(meta.hash),
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
