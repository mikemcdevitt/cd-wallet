import { stat } from "node:fs/promises";
import * as path from "node:path";
import { API_LIMITS, guessFromPath, type TrackMetadata } from "@cdwallet/shared";
import { parseFile, type IAudioMetadata } from "music-metadata";
import { sha256Buffer, sha256File } from "./hash";

export interface ScannedTrack {
  filePath: string;
  metadata: TrackMetadata;
  /** True when title, artist or album had to be guessed from folder names. */
  untagged: boolean;
  /** True when the file has cover art that is not a JPEG (not imported yet). */
  artSkipped: boolean;
}

const MAX_TEXT = 500;

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.replace(/\0/g, "").trim();
  return trimmed ? trimmed.slice(0, MAX_TEXT) : undefined;
}

const isJpeg = (data: Uint8Array): boolean => data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;

function int(value: number | null | undefined, min: number, max: number): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

function frontCover(parsed: IAudioMetadata) {
  const pictures = parsed.common.picture ?? [];
  return pictures.find((p) => /front/i.test(p.type ?? "")) ?? pictures[0];
}

/** Path shown to the user and used to guess names: relative to the imported folder's parent, with "/". */
export function displayPath(filePath: string, root: string): string {
  return path.relative(path.dirname(root), filePath).split(path.sep).join("/");
}

export async function readTrack(filePath: string, root: string): Promise<ScannedTrack> {
  const info = await stat(filePath);
  if (info.size === 0) throw new Error("the file is empty");
  if (info.size > API_LIMITS.maxAudioBytes) {
    throw new Error(`the file is larger than ${API_LIMITS.maxAudioBytes / 1024 / 1024} MB`);
  }

  const [hash, parsed] = await Promise.all([
    sha256File(filePath),
    parseFile(filePath, { duration: true }).catch((err: unknown) => {
      throw new Error(`could not read it as an MP3 (${(err as Error).message})`);
    }),
  ]);
  if (parsed.format.container !== "MPEG") throw new Error("it is not an MP3 file");

  const originalPath = displayPath(filePath, root);
  const guess = guessFromPath(originalPath);
  const { common, format } = parsed;

  const title = clean(common.title);
  const artist = clean(common.artist) ?? clean(common.albumartist);
  const album = clean(common.album);
  const untagged = !title || !artist || !album;

  const cover = frontCover(parsed);
  const artHash = cover && isJpeg(cover.data) ? sha256Buffer(cover.data) : undefined;

  const metadata: TrackMetadata = {
    hash,
    title: title ?? guess.title,
    artist: artist ?? guess.artist,
    album: album ?? guess.album,
    durationSec: Math.min(Math.max(format.duration ?? 0, 0), 24 * 3600),
    sizeBytes: info.size,
    metaSource: untagged ? "folder" : "tags",
    originalPath: originalPath.slice(-2000),
  };

  const albumArtist = clean(common.albumartist);
  const genre = clean(common.genre?.[0])?.slice(0, 200);
  const trackNo = int(common.track.no, 0, 9999) ?? (title ? undefined : guess.trackNo);
  const discNo = int(common.disk.no, 0, 999);
  const year = int(common.year, 0, 9999);
  const bitrate = typeof format.bitrate === "number" && format.bitrate > 0 ? Math.round(format.bitrate) : undefined;
  if (albumArtist) metadata.albumArtist = albumArtist;
  if (genre) metadata.genre = genre;
  if (trackNo !== undefined) metadata.trackNo = trackNo;
  if (discNo !== undefined) metadata.discNo = discNo;
  if (year !== undefined) metadata.year = year;
  if (bitrate !== undefined) metadata.bitrate = bitrate;
  if (artHash) metadata.artHash = artHash;

  return { filePath, metadata, untagged, artSkipped: Boolean(cover) && !artHash };
}

/** Reads the JPEG cover again at upload time, so cover bytes are never held for the whole library. */
export async function loadCoverJpeg(filePath: string, expectedHash: string): Promise<Uint8Array> {
  const cover = frontCover(await parseFile(filePath));
  if (!cover || !isJpeg(cover.data) || sha256Buffer(cover.data) !== expectedHash) {
    throw new Error("the cover art changed while importing");
  }
  return cover.data;
}
