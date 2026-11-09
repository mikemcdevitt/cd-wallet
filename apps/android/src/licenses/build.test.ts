import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { buildLicenseData, findLicenseFiles, isPlatformBinary, serialize, type PnpmLicenseEntry } from "./build";
import { noTextNote, textsFor } from "./data";

const root = mkdtempSync(path.join(tmpdir(), "licenses-"));

function pkg(name: string, files: Record<string, string>, manifest: object = {}): string {
  const dir = path.join(root, name.replace("/", "__") + Math.random().toString(36).slice(2, 6));
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, ...manifest }));
  for (const [file, text] of Object.entries(files)) writeFileSync(path.join(dir, file), text);
  return dir;
}

const MIT = "MIT License\n\nCopyright (c) Someone\n\nPermission is hereby granted...";

describe("license data", () => {
  it("finds license files by their usual names", () => {
    const dir = pkg("a", { LICENSE: "x", "LICENSE.md": "x", "license.txt": "x", NOTICE: "x", COPYING: "x", "README.md": "x", "licenses-list.json": "x" });
    expect(findLicenseFiles(dir)).toEqual(["COPYING", "LICENSE", "LICENSE.md", "NOTICE", "license.txt"]);
  });

  it("stores identical license text once, even with Windows line endings", () => {
    const a = pkg("a", { LICENSE: MIT });
    const b = pkg("b", { LICENSE: MIT.replace(/\n/g, "\r\n") + "\n\n" });
    const entries: PnpmLicenseEntry[] = [
      { name: "a", versions: ["1.0.0"], paths: [a], license: "MIT" },
      { name: "b", versions: ["2.0.0"], paths: [b], license: "MIT" },
    ];
    const data = buildLicenseData(entries, "app license");
    expect(Object.keys(data.texts)).toHaveLength(1);
    expect(data.packages[0]?.texts).toEqual(data.packages[1]?.texts);
    expect(textsFor(data, data.packages[0]!)[0]).toBe(MIT);
  });

  it("keeps every version of a package and sorts the list", () => {
    const v1 = pkg("z", { LICENSE: "one" });
    const v2 = pkg("z", { LICENSE: "two" });
    const other = pkg("b", { LICENSE: "three" });
    const data = buildLicenseData(
      [
        { name: "z", versions: ["10.0.0", "2.0.0"], paths: [v2, v1], license: "MIT" },
        { name: "b", versions: ["1.0.0"], paths: [other], license: "ISC", homepage: "https://example.com" },
      ],
      "x",
    );
    expect(data.packages.map((p) => `${p.name}@${p.version}`)).toEqual(["b@1.0.0", "z@2.0.0", "z@10.0.0"]);
    expect(data.packages[0]?.homepage).toBe("https://example.com");
  });

  it("collects both LICENSE and NOTICE for a package", () => {
    const dir = pkg("apache", { LICENSE: "apache text", NOTICE: "notice text" });
    const data = buildLicenseData([{ name: "apache", versions: ["1.0.0"], paths: [dir], license: "Apache-2.0" }], "x");
    expect(textsFor(data, data.packages[0]!).sort()).toEqual(["apache text", "notice text"]);
  });

  it("leaves out OS- and CPU-specific binaries so the file is the same on every machine", () => {
    const native = pkg("tool-darwin-arm64", { LICENSE: "x" }, { os: ["darwin"], cpu: ["arm64"] });
    const normal = pkg("tool", { LICENSE: "x" });
    expect(isPlatformBinary(native)).toBe(true);
    expect(isPlatformBinary(normal)).toBe(false);
    const data = buildLicenseData(
      [
        { name: "tool-darwin-arm64", versions: ["1.0.0"], paths: [native], license: "MIT" },
        { name: "tool", versions: ["1.0.0"], paths: [normal], license: "MIT" },
      ],
      "x",
    );
    expect(data.packages.map((p) => p.name)).toEqual(["tool"]);
  });

  it("keeps packages that ship no license file and says so", () => {
    const dir = pkg("bare", {});
    const data = buildLicenseData([{ name: "bare", versions: ["1.0.0"], paths: [dir], license: "MIT" }], "x");
    expect(data.packages[0]?.texts).toEqual([]);
    expect(noTextNote(data.packages[0]!)).toContain("licensed under MIT");
  });

  it("produces the same output however the input is ordered", () => {
    const a = pkg("a", { LICENSE: "A" });
    const b = pkg("b", { LICENSE: "B" });
    const ea: PnpmLicenseEntry = { name: "a", versions: ["1.0.0"], paths: [a], license: "MIT" };
    const eb: PnpmLicenseEntry = { name: "b", versions: ["1.0.0"], paths: [b], license: "MIT" };
    expect(serialize(buildLicenseData([ea, eb], "x"))).toBe(serialize(buildLicenseData([eb, ea], "x")));
  });
});
