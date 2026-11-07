import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeJpeg, fakePng, makeMp3 } from "../testing/mp3";
import { sha256Buffer, sha256File } from "./hash";
import { displayPath, loadCoverJpeg, readTrack } from "./metadata";

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
