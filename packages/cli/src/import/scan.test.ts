import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findMp3s } from "./scan";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "cdw-scan-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("findMp3s", () => {
  it("finds mp3s in nested folders, any case, in sorted order", async () => {
    await mkdir(path.join(root, "B", "Album"), { recursive: true });
    await mkdir(path.join(root, "A"), { recursive: true });
    await writeFile(path.join(root, "B", "Album", "2.MP3"), "x");
    await writeFile(path.join(root, "A", "1.mp3"), "x");
    expect((await findMp3s(root)).map((f) => path.relative(root, f))).toEqual([
      path.join("A", "1.mp3"),
      path.join("B", "Album", "2.MP3"),
    ]);
  });

  it("ignores other files, hidden files and hidden folders", async () => {
    await mkdir(path.join(root, ".hidden"));
    await writeFile(path.join(root, ".hidden", "a.mp3"), "x");
    await writeFile(path.join(root, "._song.mp3"), "x");
    await writeFile(path.join(root, ".DS_Store"), "x");
    await writeFile(path.join(root, "cover.jpg"), "x");
    await writeFile(path.join(root, "song.flac"), "x");
    await writeFile(path.join(root, "real.mp3"), "x");
    expect((await findMp3s(root)).map((f) => path.basename(f))).toEqual(["real.mp3"]);
  });

  it("returns nothing for an empty folder", async () => {
    expect(await findMp3s(root)).toEqual([]);
  });
});
