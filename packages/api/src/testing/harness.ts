import { sha256Hex } from "../auth";
import { route, type Deps, type HttpResponse } from "../router";
import { FakeStorage, MemoryStore } from "./memory-store";

export const ADMIN = "cda_test-admin-token";
export const hash = (n: number): string => n.toString(16).padStart(64, "0");

export interface CallOptions {
  token?: string | null;
  body?: unknown;
  rawBody?: string;
  query?: Record<string, string>;
}

/** A store, a fake S3, a clock you can move, and a `call` helper. */
export function makeHarness(start = "2026-11-07T12:00:00.000Z") {
  const store = new MemoryStore();
  const storage = new FakeStorage();
  store.setAdminTokenHash(sha256Hex(ADMIN));

  let clock = new Date(start);
  let counter = 0;
  const deps: Deps = {
    store,
    storage,
    now: () => clock,
    // Counts up so every code and token is different, but predictable.
    random: (size) => Buffer.from(Array.from({ length: size }, () => counter++ % 256)),
    libraryOverlap: 0,
  };

  async function call(method: string, path: string, opts: CallOptions = {}): Promise<HttpResponse> {
    const token = opts.token === undefined ? ADMIN : opts.token;
    const body = opts.rawBody ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body));
    return route(
      {
        method,
        path,
        headers: token ? { authorization: `Bearer ${token}` } : {},
        query: opts.query ?? {},
        ...(body !== undefined ? { body } : {}),
      },
      deps,
    );
  }

  /** Add a track the way the CLI would: audio uploaded, then registered. */
  async function addTrack(n: number, extra: Record<string, unknown> = {}): Promise<HttpResponse> {
    storage.objects.add(`audio/${hash(n)}.${extra.container === "m4a" ? "m4a" : "mp3"}`);
    return call("POST", "/tracks", {
      body: {
        hash: hash(n), title: `Song ${n}`, artist: "Artist", album: "Album", durationSec: 200,
        sizeBytes: 4_000_000, metaSource: "tags", originalPath: `Artist/Album/${n}.mp3`, ...extra,
      },
    });
  }

  return {
    store,
    storage,
    deps,
    call,
    addTrack,
    advance: (ms: number) => {
      clock = new Date(clock.getTime() + ms);
    },
    now: () => clock,
  };
}

export const parse = <T>(res: HttpResponse): T => JSON.parse(res.body) as T;
