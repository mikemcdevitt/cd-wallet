import { describe, expect, it } from "vitest";
import { formatBytes, formatResult, type ImportResult } from "./report";

const base: ImportResult = {
  dryRun: false, root: "/m/Music", filesFound: 3, totalBytes: 3 * 1024 * 1024, untagged: [],
  artSkipped: 0, duplicatesInFolder: 0, alreadyInLibrary: 0, added: 3, skipped: [], failures: [],
};

describe("formatBytes", () => {
  it("scales units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 ** 3)).toBe("5.0 GB");
  });
});

describe("formatResult", () => {
  it("summarises a successful import", () => {
    const text = formatResult(base);
    expect(text).toContain("Found 3 audio files (3.0 MB) in /m/Music");
    expect(text).toContain("Added 3 tracks.");
  });

  it("says when there is nothing new", () => {
    const text = formatResult({ ...base, added: 0, alreadyInLibrary: 3 });
    expect(text).toContain("Nothing new to import.");
    expect(text).toContain("3 already in your library.");
  });

  it("explains a dry run and lists untagged files, truncating long lists", () => {
    const untagged = Array.from({ length: 12 }, (_, i) => `Music/x/${i}.mp3`);
    const text = formatResult({ ...base, dryRun: true, added: 0, untagged });
    expect(text).toContain("12 missing tags");
    expect(text).toContain("...and 2 more");
    expect(text).toContain("Dry run: nothing was uploaded.");
    expect(text).not.toContain("Added");
  });

  it("lists failures and tells the user how to retry", () => {
    const text = formatResult({ ...base, added: 2, failures: [{ file: "bad.mp3", reason: "the file is empty" }] });
    expect(text).toContain("1 file could not be imported:");
    expect(text).toContain("bad.mp3: the file is empty");
    expect(text).toContain("Run the same command again");
  });

  it("lists unsupported files as skipped, without telling the user to retry them", () => {
    const text = formatResult({
      ...base,
      skipped: [{ file: "Bought/01 Song.m4p", reason: "it is copy-protected (DRM) and cannot be played outside Apple apps" }],
    });
    expect(text).toContain("1 file skipped (not supported):");
    expect(text).toContain("Bought/01 Song.m4p: it is copy-protected (DRM)");
    expect(text).not.toContain("Run the same command again");
  });

  it("mentions duplicates and skipped art", () => {
    const text = formatResult({ ...base, duplicatesInFolder: 2, artSkipped: 4 });
    expect(text).toContain("2 duplicate files");
    expect(text).toContain("4 with non-JPEG cover art");
  });
});
