import { stat } from "node:fs/promises";
import * as path from "node:path";
import { configDir, loadConfig } from "../config";
import { resolveDeploymentName } from "../deployment";
import { CliError } from "../errors";
import { ApiClient, putBody } from "./api-client";
import { loadCoverJpeg, readTrack, type ScannedTrack } from "./metadata";
import { IMPORT_HELP, parseImportArgs } from "./options";
import { mapPool } from "./pool";
import { formatResult, type Failure, type ImportResult } from "./report";
import { findMp3s } from "./scan";

export interface ImportIo {
  env?: NodeJS.ProcessEnv;
  log?: (line: string) => void;
  /** Live progress on one line; turned off in tests and when output is not a terminal. */
  progress?: boolean;
}

function progressReporter(enabled: boolean) {
  return (label: string, done: number, total: number): void => {
    if (!enabled) return;
    process.stdout.write(`\r${label} ${done}/${total}${done === total ? "\n" : ""}`);
  };
}

async function scanFolder(root: string, files: string[], concurrency: number, report: (done: number) => void) {
  const tracks: ScannedTrack[] = [];
  const failures: Failure[] = [];
  let done = 0;
  await mapPool(files, concurrency, async (file) => {
    try {
      tracks.push(await readTrack(file, root));
    } catch (err) {
      failures.push({ file: path.relative(root, file), reason: (err as Error).message });
    }
    report(++done);
  });
  // Work finished in any order; restore the folder order.
  const order = new Map(files.map((f, i) => [f, i]));
  tracks.sort((a, b) => (order.get(a.filePath) ?? 0) - (order.get(b.filePath) ?? 0));
  return { tracks, failures };
}

export async function runImport(argv: string[], io: ImportIo = {}): Promise<ImportResult> {
  const env = io.env ?? process.env;
  const log = io.log ?? ((line: string) => console.log(line));
  const progress = progressReporter(io.progress ?? Boolean(process.stdout.isTTY));

  const options = parseImportArgs(argv, env);
  if (options.help) {
    log(IMPORT_HELP);
    return emptyResult(true, "");
  }

  const root = options.folder;
  try {
    if (!(await stat(root)).isDirectory()) throw new Error("not a folder");
  } catch {
    throw new CliError(`${root} is not a folder I can read.`);
  }

  // Load the deployment first so a missing deploy fails before a long scan.
  const dir = configDir(env);
  const name = options.dryRun || options.nameExplicit ? options.name : await resolveDeploymentName(undefined, env, dir);
  const config = options.dryRun ? undefined : await loadConfig(name, dir);
  if (!options.dryRun && !config) {
    throw new CliError(`No saved deployment named "${name}". Run \`cdwallet deploy\` first.`);
  }

  const files = await findMp3s(root);
  const scan = await scanFolder(root, files, options.concurrency, (done) => progress("Reading files", done, files.length));

  // Identical audio files (same hash) are imported once.
  const seen = new Set<string>();
  const unique: ScannedTrack[] = [];
  for (const track of scan.tracks) {
    if (seen.has(track.metadata.hash)) continue;
    seen.add(track.metadata.hash);
    unique.push(track);
  }

  const result: ImportResult = {
    dryRun: options.dryRun,
    root,
    filesFound: files.length,
    totalBytes: scan.tracks.reduce((sum, t) => sum + t.metadata.sizeBytes, 0),
    untagged: unique.filter((t) => t.untagged).map((t) => t.metadata.originalPath),
    artSkipped: unique.filter((t) => t.artSkipped).length,
    duplicatesInFolder: scan.tracks.length - unique.length,
    alreadyInLibrary: 0,
    added: 0,
    failures: [...scan.failures],
  };

  if (!options.dryRun && config) {
    const client = new ApiClient(config.apiUrl, config.adminToken);
    const missing = new Set(await client.check(unique.map((t) => t.metadata.hash)));
    const todo = unique.filter((t) => missing.has(t.metadata.hash));
    result.alreadyInLibrary = unique.length - todo.length;

    let done = 0;
    await mapPool(todo, options.concurrency, async (track) => {
      const { metadata, filePath } = track;
      try {
        const upload = await client.createUpload({
          hash: metadata.hash,
          sizeBytes: metadata.sizeBytes,
          ...(metadata.artHash ? { artHash: metadata.artHash } : {}),
        });
        await putBody(upload.audio.url, upload.audio.headers ?? {}, { kind: "file", path: filePath, size: metadata.sizeBytes });
        if (upload.art && metadata.artHash) {
          const cover = await loadCoverJpeg(filePath, metadata.artHash);
          await putBody(upload.art.url, upload.art.headers ?? {}, { kind: "bytes", data: cover });
        }
        await client.addTrack(metadata);
        result.added++;
      } catch (err) {
        // A rejected token stops everything; any other problem only fails this file.
        if (err instanceof CliError) throw err;
        result.failures.push({ file: metadata.originalPath, reason: (err as Error).message });
      }
      progress("Uploading", ++done, todo.length);
    });
  }

  log(formatResult(result));
  return result;
}

function emptyResult(dryRun: boolean, root: string): ImportResult {
  return {
    dryRun, root, filesFound: 0, totalBytes: 0, untagged: [], artSkipped: 0,
    duplicatesInFolder: 0, alreadyInLibrary: 0, added: 0, failures: [],
  };
}
