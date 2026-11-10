export interface M4aOptions {
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  /** Track number, e.g. 3 or [3, 12]. */
  track?: number | [number, number];
  year?: string;
  genre?: string;
  cover?: Uint8Array;
  /** Number of AAC frames (1024 samples each, about 23 ms at 44.1 kHz). */
  frames?: number;
  /** Changes the audio bytes so two files do not hash the same. */
  seed?: number;
  /**
   * What the audio track claims to hold. "aac" is a normal M4A. "alac" is Apple Lossless.
   * "drms" imitates an old copy-protected iTunes purchase, whose audio entry is not a readable codec.
   */
  codec?: "aac" | "alac" | "drms";
}

const SAMPLE_RATE = 44100;
const FRAME_SAMPLES = 1024;
const SAMPLE_BYTES = 64;

const u16 = (n: number): Buffer => {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n);
  return b;
};
const u32 = (n: number): Buffer => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};
const zeros = (n: number): Buffer => Buffer.alloc(n);
const ascii = (s: string): Buffer => Buffer.from(s, "latin1");

function box(type: string, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat(parts);
  return Buffer.concat([u32(8 + body.length), Buffer.from(type, "latin1"), body]);
}
/** A box that starts with a version byte and 24 bits of flags. */
const fullBox = (type: string, flags: number, ...parts: Buffer[]): Buffer =>
  box(type, Buffer.from([0, (flags >> 16) & 0xff, (flags >> 8) & 0xff, flags & 0xff]), ...parts);

const identityMatrix = (): Buffer =>
  Buffer.concat([u32(0x10000), zeros(12), u32(0x10000), zeros(12), u32(0x40000000)]);

function tag(name: string, flags: number, payload: Buffer): Buffer {
  return box(name, box("data", u32(flags), u32(0), payload));
}
const text = (name: string, value: string): Buffer => tag(name, 1, Buffer.from(value, "utf8"));

function sampleEntry(codec: NonNullable<M4aOptions["codec"]>): Buffer {
  const entryType = codec === "aac" ? "mp4a" : codec === "alac" ? "alac" : "drms";
  const audioHeader = Buffer.concat([
    zeros(6), u16(1), // reserved, data reference index
    zeros(8), u16(2), u16(16), zeros(4), u32(SAMPLE_RATE * 65536),
  ]);
  // AAC-LC, 44.1 kHz, stereo (AudioSpecificConfig 0x1210).
  const esds = fullBox(
    "esds", 0,
    Buffer.from([0x03, 25, 0, 0, 0]),
    Buffer.from([0x04, 17, 0x40, 0x15, 0, 0, 0]), u32(0), u32(0),
    Buffer.from([0x05, 2, 0x12, 0x10]),
    Buffer.from([0x06, 1, 0x02]),
  );
  return box(entryType, audioHeader, codec === "aac" ? esds : zeros(0));
}

/**
 * Builds a tiny but valid M4A (an MP4 file with one audio track and iTunes-style tags), so tests
 * need no ffmpeg and no real music. The audio bytes are filler: the file parses and hashes, it
 * does not play.
 */
export function makeM4a(options: M4aOptions = {}): Buffer {
  const frames = options.frames ?? 50;
  const codec = options.codec ?? "aac";
  const duration = frames * FRAME_SAMPLES;

  const mdat = box("mdat", Buffer.alloc(frames * SAMPLE_BYTES, (options.seed ?? 0) % 256));
  const ftyp = box("ftyp", ascii("M4A "), u32(0), ascii("M4A "), ascii("mp42"), ascii("isom"));

  const tags: Buffer[] = [];
  if (options.title) tags.push(text("©nam", options.title));
  if (options.artist) tags.push(text("©ART", options.artist));
  if (options.album) tags.push(text("©alb", options.album));
  if (options.albumArtist) tags.push(text("aART", options.albumArtist));
  if (options.year) tags.push(text("©day", options.year));
  if (options.genre) tags.push(text("©gen", options.genre));
  if (options.track !== undefined) {
    const [no, of] = Array.isArray(options.track) ? options.track : [options.track, 0];
    tags.push(tag("trkn", 0, Buffer.concat([zeros(2), u16(no), u16(of), zeros(2)])));
  }
  if (options.cover) tags.push(tag("covr", 13, Buffer.from(options.cover)));
  const meta = fullBox("meta", 0, box("hdlr", zeros(4), zeros(4), ascii("mdir"), zeros(12), zeros(1)), box("ilst", ...tags));

  const moov = (chunkOffset: number): Buffer =>
    box(
      "moov",
      fullBox("mvhd", 0, u32(0), u32(0), u32(SAMPLE_RATE), u32(duration), u32(0x10000), u16(0x100), zeros(10), identityMatrix(), zeros(24), u32(2)),
      box(
        "trak",
        fullBox("tkhd", 3, u32(0), u32(0), u32(1), zeros(4), u32(duration), zeros(8), u16(0), u16(0), u16(0x100), zeros(2), identityMatrix(), u32(0), u32(0)),
        box(
          "mdia",
          fullBox("mdhd", 0, u32(0), u32(0), u32(SAMPLE_RATE), u32(duration), u16(0x55c4), u16(0)),
          fullBox("hdlr", 0, zeros(4), ascii("soun"), zeros(12), zeros(1)),
          box(
            "minf",
            fullBox("smhd", 0, u16(0), u16(0)),
            box("dinf", fullBox("dref", 0, u32(1), fullBox("url ", 1))),
            box(
              "stbl",
              fullBox("stsd", 0, u32(1), sampleEntry(codec)),
              fullBox("stts", 0, u32(1), u32(frames), u32(FRAME_SAMPLES)),
              fullBox("stsc", 0, u32(1), u32(1), u32(frames), u32(1)),
              fullBox("stsz", 0, u32(SAMPLE_BYTES), u32(frames)),
              fullBox("stco", 0, u32(1), u32(chunkOffset)),
            ),
          ),
        ),
      ),
      box("udta", meta),
    );

  // Metadata first, audio last (what iTunes writes): the offset of the audio is the size of everything before it.
  const audioOffset = ftyp.length + moov(0).length + 8;
  return Buffer.concat([ftyp, moov(audioOffset), mdat]);
}
