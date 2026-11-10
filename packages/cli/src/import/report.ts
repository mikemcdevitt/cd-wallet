export interface Failure {
  file: string;
  reason: string;
}

export interface ImportResult {
  dryRun: boolean;
  root: string;
  filesFound: number;
  totalBytes: number;
  untagged: string[];
  artSkipped: number;
  duplicatesInFolder: number;
  alreadyInLibrary: number;
  added: number;
  /** Files that are fine but cannot be imported (copy-protected, Apple Lossless). Retrying will not help. */
  skipped: Failure[];
  failures: Failure[];
}

export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}

const list = (items: string[], max = 10): string[] => [
  ...items.slice(0, max).map((item) => `    ${item}`),
  ...(items.length > max ? [`    ...and ${items.length - max} more`] : []),
];

export function formatResult(r: ImportResult): string {
  const lines: string[] = [];
  lines.push(`Found ${r.filesFound} audio file${r.filesFound === 1 ? "" : "s"} (${formatBytes(r.totalBytes)}) in ${r.root}`);

  if (r.untagged.length > 0) {
    lines.push(`  ${r.untagged.length} missing tags: names guessed from folders and marked "Untagged"`);
    lines.push(...list(r.untagged));
  }
  if (r.duplicatesInFolder > 0) lines.push(`  ${r.duplicatesInFolder} duplicate file${r.duplicatesInFolder === 1 ? "" : "s"} (identical audio): kept once`);
  if (r.artSkipped > 0) lines.push(`  ${r.artSkipped} with non-JPEG cover art: imported without art for now`);

  if (r.dryRun) {
    lines.push("", "Dry run: nothing was uploaded.");
  } else {
    lines.push("");
    if (r.added === 0 && r.failures.length === 0) lines.push("Nothing new to import.");
    else lines.push(`Added ${r.added} track${r.added === 1 ? "" : "s"}.`);
    if (r.alreadyInLibrary > 0) lines.push(`${r.alreadyInLibrary} already in your library.`);
  }

  if (r.skipped.length > 0) {
    lines.push("", `${r.skipped.length} file${r.skipped.length === 1 ? "" : "s"} skipped (not supported):`);
    lines.push(...list(r.skipped.map((f) => `${f.file}: ${f.reason}`), 20));
  }

  if (r.failures.length > 0) {
    lines.push("", `${r.failures.length} file${r.failures.length === 1 ? "" : "s"} could not be imported:`);
    lines.push(...list(r.failures.map((f) => `${f.file}: ${f.reason}`), 20));
    if (!r.dryRun) lines.push("", "Run the same command again to retry them.");
  }
  return lines.join("\n");
}
