import { readdir } from "node:fs/promises";
import * as path from "node:path";

/** Extensions the importer looks at. `.m4p` is copy-protected iTunes audio, found only so it can be reported. */
const AUDIO_FILE = /\.(mp3|m4a|m4p)$/i;

/**
 * All audio files (.mp3, .m4a) under `root`, sorted, plus `.m4p` files so they can be reported as
 * unsupported. Skips hidden files and folders (which also covers macOS `._` resource-fork files)
 * and does not follow symlinked folders.
 */
export async function findAudioFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if ((entry.isFile() || entry.isSymbolicLink()) && AUDIO_FILE.test(entry.name)) found.push(full);
    }
  }
  await walk(root);
  return found.sort((a, b) => a.localeCompare(b));
}
