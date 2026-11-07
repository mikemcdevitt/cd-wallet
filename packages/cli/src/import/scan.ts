import { readdir } from "node:fs/promises";
import * as path from "node:path";

/**
 * All .mp3 files under `root`, sorted. Skips hidden files and folders (which also covers
 * macOS `._` resource-fork files) and does not follow symlinked folders.
 */
export async function findMp3s(root: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if ((entry.isFile() || entry.isSymbolicLink()) && /\.mp3$/i.test(entry.name)) found.push(full);
    }
  }
  await walk(root);
  return found.sort((a, b) => a.localeCompare(b));
}
