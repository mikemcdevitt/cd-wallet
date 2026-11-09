import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { TrackMetadata } from "@cdwallet/shared";
import { parseBuffer } from "music-metadata";
import { startLocalApi } from "../testing/local-api";
import { makeMp3 } from "../testing/mp3";

const COVERS_B64 = ["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"] as const;

const ALBUMS = [
  { artist: "The Bromthymol Blues Band", album: "Skateboarding Sessions", year: 2008, songs: ["Skateboarding", "Kickflip Blues", "Grind Rail", "Half Pipe Hymn", "Ollie Out", "Bail"] },
  { artist: "Night Garden", album: "Lanterns", year: 2015, songs: ["Lanterns", "Moth Wings", "Slow Orchard", "Glow", "Hush"] },
  { artist: "Night Garden", album: "Roots", year: 2019, songs: ["Roots", "Underground River", "Soil"] },
  { artist: "Marguerite Vane", album: "Postcards from Nowhere", year: 2011, songs: ["Departures", "Gate 12", "Layover", "Windowseat", "Arrival Hall", "Taxi Home"] },
  { artist: "Various Artists", album: "Road Trip Mix", year: 2020, songs: ["Open Highway", "Gas Station Coffee", "Mile Marker 40", "Sunroof"], compilation: true },
];
const GUESTS = ["Dune Radio", "Little Hollow", "Cassette Ghosts", "The Sundial Club"];

/** Same audio, different bytes: a unique ID3v1 tag at the end makes each file hash differently. */
function variant(audio: Buffer, label: string): Buffer {
  const tag = Buffer.alloc(128);
  tag.write("TAG", 0, "latin1");
  tag.write(label.slice(0, 30), 3, "latin1");
  return Buffer.concat([audio, tag]);
}

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

export interface DevServerOptions {
  audioPath: string;
  /** Fail if the audio file is missing, instead of using the built-in clip. */
  audioRequired: boolean;
  host: string;
  port: number;
  tracks: number;
}

export interface DevServer {
  api: Awaited<ReturnType<typeof startLocalApi>>;
  adminToken: string;
  durationSec: number;
  usingBuiltIn: boolean;
  trackCount: number;
  call: (method: string, route: string, body?: unknown) => Promise<unknown>;
  newPairingCode: () => Promise<string>;
}

/** Starts the local API and fills it with sample tracks. */
export async function startDevServer(args: DevServerOptions): Promise<DevServer> {

  const audioPath = args.audioPath;
  let audio: Buffer;
  let usingBuiltIn = false;
  try {
    audio = await readFile(audioPath);
  } catch {
    if (args.audioRequired) throw new Error(`Could not read ${audioPath}`);
    audio = makeMp3({ frames: 2000, seed: 7 });
    usingBuiltIn = true;
  }
  const durationSec = Math.round((await parseBuffer(audio).then((m) => m.format.duration).catch(() => undefined)) ?? 30);

  const adminToken = `cda_${randomBytes(32).toString("base64url")}`;
  const api = await startLocalApi(adminToken, { host: args.host, port: args.port, now: () => new Date() });
  const local = api.url;
  const call = async (method: string, route: string, body?: unknown) => {
    const res = await fetch(local + route, {
      method,
      headers: { authorization: `Bearer ${adminToken}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`${method} ${route} -> ${res.status} ${await res.text()}`);
    return res.status === 204 ? undefined : res.json();
  };

  // Sample library: albums cycle through until we have enough tracks.
  const covers = COVERS_B64.map((b) => Buffer.from(b, "base64"));
  let made = 0;
  let n = 0;
  outer: for (let round = 0; ; round++) {
    for (const [albumIndex, album] of ALBUMS.entries()) {
      for (const [i, song] of album.songs.entries()) {
        if (made >= args.tracks) break outer;
        // The first track keeps the real file untouched when it has its own tags.
        const label = `${album.album}-${song}-${round}`;
        const data = made === 0 ? audio : variant(audio, label);
        const hash = sha(data);
        const cover = covers[albumIndex % covers.length]!;
        const artHash = sha(cover);
        api.objects.set(`audio/${hash}.mp3`, data);
        api.objects.set(`art/${artHash}.jpg`, cover);
        const artist = "compilation" in album ? GUESTS[i % GUESTS.length]! : album.artist;
        const meta: TrackMetadata = {
          hash,
          title: round === 0 ? song : `${song} (${round + 1})`,
          artist,
          ...("compilation" in album ? { albumArtist: album.artist } : {}),
          album: album.album,
          trackNo: i + 1,
          year: album.year,
          genre: "Test",
          durationSec,
          bitrate: 128000,
          sizeBytes: data.length,
          artHash,
          metaSource: "tags",
          originalPath: `${album.artist}/${album.album}/${String(i + 1).padStart(2, "0")} ${song}.mp3`,
        };
        await call("POST", "/tracks", meta);
        made++;
        n++;
      }
    }
  }

  return {
    api,
    adminToken,
    durationSec,
    usingBuiltIn,
    trackCount: n,
    call,
    newPairingCode: async () => ((await call("POST", "/pairing", { deviceName: "Dev phone" })) as { code: string }).code,
  };
}
