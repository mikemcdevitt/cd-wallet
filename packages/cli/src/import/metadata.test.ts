import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeM4a } from "../testing/m4a";
import { fakeJpeg, fakePng, makeMp3 } from "../testing/mp3";
import { sha256Buffer, sha256File } from "./hash";
import { displayPath, loadCoverJpeg, readTrack, UnsupportedAudioError } from "./metadata";

let base: string;
let root: string;
beforeEach(async () => {
  base = await mkdtemp(path.join(os.tmpdir(), "cdw-meta-"));
  root = path.join(base, "Music");
  await mkdir(root);
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

async function put(rel: string, data: Buffer): Promise<string> {
  const file = path.join(root, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
  return file;
}

describe("readTrack", () => {
  it("reads tags, size, duration and the file hash", async () => {
    const data = makeMp3({
      title: "Airbag", artist: "Radiohead", album: "OK Computer", albumArtist: "Radiohead",
      track: "1/12", year: "1997", genre: "Rock", cover: fakeJpeg(),
    });
    const file = await put("Radiohead/OK Computer/01 Airbag.mp3", data);

    const track = await readTrack(file, root);
    expect(track.untagged).toBe(false);
    expect(track.metadata).toMatchObject({
      hash: await sha256File(file),
      title: "Airbag", artist: "Radiohead", album: "OK Computer", albumArtist: "Radiohead",
      trackNo: 1, year: 1997, genre: "Rock", metaSource: "tags",
      sizeBytes: data.length, artHash: sha256Buffer(fakeJpeg()),
      originalPath: "Music/Radiohead/OK Computer/01 Airbag.mp3",
    });
    expect(track.metadata.durationSec).toBeGreaterThan(0.5);
    expect(track.metadata.durationSec).toBeLessThan(2);
    expect(track.metadata.bitrate).toBe(128000);
  });

  it("guesses names from folders when there are no tags", async () => {
    const file = await put("Beck/Odelay/03 - Devils Haircut.mp3", makeMp3({ seed: 3 }));
    const track = await readTrack(file, root);
    expect(track.untagged).toBe(true);
    expect(track.metadata).toMatchObject({
      title: "Devils Haircut", artist: "Beck", album: "Odelay", trackNo: 3, metaSource: "folder",
    });
  });

  it("fills only the missing fields from folders", async () => {
    const file = await put("Beck/Odelay/04 Where Its At.mp3", makeMp3({ title: "Where It's At", seed: 4 }));
    const track = await readTrack(file, root);
    expect(track.untagged).toBe(true);
    expect(track.metadata).toMatchObject({ title: "Where It's At", artist: "Beck", album: "Odelay", metaSource: "folder" });
  });

  it("uses the album artist when there is no artist tag", async () => {
    const file = await put("x/y/z.mp3", makeMp3({ title: "T", album: "A", albumArtist: "AA", seed: 5 }));
    expect((await readTrack(file, root)).metadata.artist).toBe("AA");
  });

  it("skips non-JPEG cover art but still imports the track", async () => {
    const file = await put("a/b/c.mp3", makeMp3({ title: "T", artist: "A", album: "B", cover: fakePng(), coverMime: "image/png", seed: 6 }));
    const track = await readTrack(file, root);
    expect(track.artSkipped).toBe(true);
    expect(track.metadata.artHash).toBeUndefined();
  });

  it("gives different hashes to different audio and the same hash to identical files", async () => {
    const a = await readTrack(await put("a.mp3", makeMp3({ seed: 1 })), root);
    const b = await readTrack(await put("b.mp3", makeMp3({ seed: 2 })), root);
    const c = await readTrack(await put("c.mp3", makeMp3({ seed: 1 })), root);
    expect(a.metadata.hash).not.toBe(b.metadata.hash);
    expect(a.metadata.hash).toBe(c.metadata.hash);
  });

  it("rejects empty files and files that are not MP3s", async () => {
    await expect(readTrack(await put("empty.mp3", Buffer.alloc(0)), root)).rejects.toThrow(/empty/);
    await expect(readTrack(await put("junk.mp3", Buffer.from("this is not audio at all, just text".repeat(50))), root)).rejects.toThrow(/MP3/);
  });
});

describe("readTrack with M4A files", () => {
  it("reads tags, duration, cover and marks the track as m4a", async () => {
    const data = makeM4a({
      title: "Airbag", artist: "Radiohead", album: "OK Computer", albumArtist: "Radiohead",
      track: [1, 12], year: "1997", genre: "Rock", cover: fakeJpeg(), frames: 100,
    });
    const file = await put("Radiohead/OK Computer/01 Airbag.m4a", data);

    const track = await readTrack(file, root);
    expect(track.untagged).toBe(false);
    expect(track.metadata).toMatchObject({
      hash: await sha256File(file),
      container: "m4a",
      title: "Airbag", artist: "Radiohead", album: "OK Computer", albumArtist: "Radiohead",
      trackNo: 1, year: 1997, genre: "Rock", metaSource: "tags",
      sizeBytes: data.length, artHash: sha256Buffer(fakeJpeg()),
      originalPath: "Music/Radiohead/OK Computer/01 Airbag.m4a",
    });
    expect(track.metadata.durationSec).toBeCloseTo((100 * 1024) / 44100, 1);
    expect(Buffer.from(await loadCoverJpeg(file, sha256Buffer(fakeJpeg())))).toEqual(Buffer.from(fakeJpeg()));
  });

  it("guesses names from folders when an M4A has no tags", async () => {
    const file = await put("Beck/Odelay/03 - Devils Haircut.m4a", makeM4a({ seed: 3 }));
    const track = await readTrack(file, root);
    expect(track.untagged).toBe(true);
    expect(track.metadata).toMatchObject({ title: "Devils Haircut", artist: "Beck", album: "Odelay", trackNo: 3, container: "m4a" });
  });

  it("leaves `container` off for MP3s, so they look the way they always have", async () => {
    const track = await readTrack(await put("a.mp3", makeMp3({ seed: 1 })), root);
    expect(track.metadata.container).toBeUndefined();
  });

  it("reports a file whose name does not match its contents as a failure, never importing it under the wrong format", async () => {
    // The tag reader picks its parser from the extension, so these cannot be read as what they really are.
    for (const [name, data] of [["really-m4a.mp3", makeM4a({ seed: 4 })], ["really-mp3.m4a", makeMp3({ seed: 4 })]] as const) {
      const err = await readTrack(await put(name, data), root).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err).not.toBeInstanceOf(UnsupportedAudioError);
    }
  });

  it("skips Apple Lossless files as unsupported", async () => {
    const file = await put("a/b/lossless.m4a", makeM4a({ codec: "alac", seed: 5 }));
    const err = await readTrack(file, root).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnsupportedAudioError);
    expect((err as Error).message).toMatch(/Apple Lossless/);
  });

  it("skips copy-protected iTunes files, by extension or by their unreadable audio", async () => {
    for (const name of ["a/b/bought.m4p", "a/b/bought-renamed.m4a"]) {
      const err = await readTrack(await put(name, makeM4a({ codec: "drms", title: "T", seed: 6 })), root).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(UnsupportedAudioError);
      expect((err as Error).message).toMatch(/DRM/);
    }
    // An .m4p we cannot even parse is still reported as DRM, not as a read error.
    const unreadable = await readTrack(await put("a/b/garbled.m4p", Buffer.from("not a real file".repeat(40))), root).catch((e: unknown) => e);
    expect(unreadable).toBeInstanceOf(UnsupportedAudioError);
  });

  it("still treats an unreadable file named .m4a as a failure, not an unsupported one", async () => {
    const err = await readTrack(await put("junk.m4a", Buffer.from("this is not audio at all, just text".repeat(50))), root).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(UnsupportedAudioError);
  });
});

describe("displayPath and covers", () => {
  it("shows paths from the imported folder's own name, with slashes", () => {
    expect(displayPath(path.join(root, "A", "B", "c.mp3"), root)).toBe("Music/A/B/c.mp3");
  });

  it("reloads a cover only if it is still the one that was hashed", async () => {
    const file = await put("a.mp3", makeMp3({ cover: fakeJpeg(), seed: 9 }));
    expect(Buffer.from(await loadCoverJpeg(file, sha256Buffer(fakeJpeg())))).toEqual(Buffer.from(fakeJpeg()));
    await expect(loadCoverJpeg(file, "0".repeat(64))).rejects.toThrow(/changed/);
  });
});
