export interface Mp3Options {
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  /** Track number as it appears in the tag, e.g. "3" or "3/12". */
  track?: string;
  year?: string;
  genre?: string;
  cover?: Uint8Array;
  coverMime?: string;
  /** Number of audio frames (about 26 ms each). */
  frames?: number;
  /** Changes the audio bytes so two files do not hash the same. */
  seed?: number;
}

/** A tiny but valid JPEG-looking cover (music-metadata only needs the bytes, not a decodable image). */
export const fakeJpeg = (seed = 1): Uint8Array => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, seed, 0x00, 0x10, 0xff, 0xd9]);
export const fakePng = (): Uint8Array => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

const synchsafe = (n: number): Buffer =>
  Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]);

function frame(id: string, data: Buffer): Buffer {
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  return Buffer.concat([Buffer.from(id, "latin1"), size, Buffer.from([0, 0]), data]);
}

const textFrame = (id: string, text: string): Buffer =>
  frame(id, Buffer.concat([Buffer.from([0]), Buffer.from(text, "latin1")]));

/** Builds a small MP3 (MPEG-1 Layer III, 128 kbps, 44.1 kHz) with an optional ID3v2.3 tag. */
export function makeMp3(options: Mp3Options = {}): Buffer {
  const frames: Buffer[] = [];
  if (options.title) frames.push(textFrame("TIT2", options.title));
  if (options.artist) frames.push(textFrame("TPE1", options.artist));
  if (options.album) frames.push(textFrame("TALB", options.album));
  if (options.albumArtist) frames.push(textFrame("TPE2", options.albumArtist));
  if (options.track) frames.push(textFrame("TRCK", options.track));
  if (options.year) frames.push(textFrame("TYER", options.year));
  if (options.genre) frames.push(textFrame("TCON", options.genre));
  if (options.cover) {
    const mime = options.coverMime ?? "image/jpeg";
    frames.push(
      frame(
        "APIC",
        Buffer.concat([Buffer.from([0]), Buffer.from(mime, "latin1"), Buffer.from([0, 3, 0]), Buffer.from(options.cover)]),
      ),
    );
  }

  const body = Buffer.concat(frames);
  const tag = frames.length > 0 ? Buffer.concat([Buffer.from("ID3"), Buffer.from([3, 0, 0]), synchsafe(body.length), body]) : Buffer.alloc(0);

  const audioFrame = Buffer.alloc(417, (options.seed ?? 1) % 200);
  audioFrame.set([0xff, 0xfb, 0x90, 0x00], 0);
  return Buffer.concat([tag, ...Array.from({ length: options.frames ?? 40 }, () => audioFrame)]);
}
