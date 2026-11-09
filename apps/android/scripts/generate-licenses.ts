/**
 * Writes src/licenses/licenses.generated.json from the app's production dependencies.
 *   pnpm licenses:generate   rewrite the file
 *   pnpm licenses:check      fail if the file is out of date (used by CI)
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { buildLicenseData, serialize, type PnpmLicenseEntry } from "../src/licenses/build";

const appDir = path.resolve(import.meta.dirname, "..");
const outFile = path.join(appDir, "src", "licenses", "licenses.generated.json");
const check = process.argv.includes("--check");

const raw = execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], { cwd: appDir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const groups = JSON.parse(raw) as Record<string, PnpmLicenseEntry[]>;
const entries = Object.values(groups).flat();

const data = buildLicenseData(entries, readFileSync(path.resolve(appDir, "../../LICENSE"), "utf8"));
const next = serialize(data);

const missing = data.packages.filter((p) => p.texts.length === 0);
if (check) {
  const current = existsSync(outFile) ? readFileSync(outFile, "utf8") : "";
  if (current !== next) {
    console.error("src/licenses/licenses.generated.json is out of date. Run: pnpm --filter @cdwallet/android licenses:generate");
    process.exit(1);
  }
  console.log(`Licenses file is up to date (${data.packages.length} packages).`);
} else {
  writeFileSync(outFile, next);
  console.log(`Wrote ${data.packages.length} packages and ${Object.keys(data.texts).length} distinct license texts.`);
  if (missing.length) console.log(`${missing.length} packages shipped no license file (the app shows their SPDX license name instead).`);
}
