// Build-time only (Node). Not imported by the app.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import * as path from "node:path";
import type { LicenseData, LicensePackage } from "./data";

/** One line of `pnpm licenses list --json`, flattened across license groups. */
export interface PnpmLicenseEntry {
  name: string;
  versions: string[];
  paths: string[];
  license: string;
  homepage?: string;
}

const LICENSE_FILE = /^(licen[sc]e|copying|notice)([.\-_].*)?$/i;

export function findLicenseFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && LICENSE_FILE.test(e.name))
    .map((e) => e.name)
    .sort();
}

/**
 * Packages that only install on certain operating systems or CPUs are native build tools
 * (esbuild, lightningcss and the like). Which ones are present differs between a Mac and CI, so
 * leaving them out keeps the generated file the same everywhere.
 */
export function isPlatformBinary(dir: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as { os?: unknown; cpu?: unknown };
    return pkg.os !== undefined || pkg.cpu !== undefined;
  } catch {
    return false;
  }
}

const normalize = (text: string) => text.replace(/\r\n?/g, "\n").trim();
const textId = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 10);

export function buildLicenseData(entries: PnpmLicenseEntry[], appLicense: string): LicenseData {
  const texts: Record<string, string> = {};
  const packages: LicensePackage[] = [];

  for (const entry of entries) {
    entry.versions.forEach((version, i) => {
      const dir = entry.paths[i];
      if (!dir || isPlatformBinary(dir)) return;
      const ids: string[] = [];
      for (const file of findLicenseFiles(dir)) {
        const text = normalize(readFileSync(path.join(dir, file), "utf8"));
        if (!text) continue;
        const id = textId(text);
        texts[id] = text;
        if (!ids.includes(id)) ids.push(id);
      }
      packages.push({
        name: entry.name,
        version,
        license: entry.license,
        ...(entry.homepage ? { homepage: entry.homepage } : {}),
        texts: ids,
      });
    });
  }

  packages.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version, undefined, { numeric: true }));
  const sortedTexts = Object.fromEntries(Object.entries(texts).sort(([a], [b]) => a.localeCompare(b)));
  return { appLicense: normalize(appLicense), texts: sortedTexts, packages };
}

export const serialize = (data: LicenseData): string => `${JSON.stringify(data, null, 1)}\n`;
