export interface FolderGuess {
  artist: string;
  album: string;
  title: string;
  trackNo?: number;
}

const TRACK_PREFIX = /^(\d{1,3})\s*(?:[-._)]\s*|\s+)(.+)$/;

/**
 * Guess metadata from a path like `Artist/Album/01 - Title.mp3`, used when a
 * file has no usable ID3 tags. Only the last three path segments matter.
 */
export function guessFromPath(relativePath: string): FolderGuess {
  const segments = relativePath.split(/[\\/]+/).filter(Boolean);
  const file = segments.pop() ?? "";
  const stem = file.replace(/\.[^./\\]+$/, "").trim();

  let title = stem;
  let trackNo: number | undefined;
  const match = TRACK_PREFIX.exec(stem);
  if (match) {
    trackNo = Number(match[1]);
    title = (match[2] ?? stem).trim();
  }

  const album = segments.pop() ?? "Unknown Album";
  const artist = segments.pop() ?? "Unknown Artist";

  const guess: FolderGuess = { artist, album, title: title || "Untitled" };
  if (trackNo !== undefined) guess.trackNo = trackNo;
  return guess;
}
