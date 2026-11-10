import { AsyncLocalStorage } from "node:async_hooks";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { MemoryStore, route, sha256Hex, type PresignPutRequest, type Storage } from "@cdwallet/api";

export interface LocalApi {
  url: string;
  store: MemoryStore;
  /** Everything "uploaded to S3", by key. */
  objects: Map<string, Buffer>;
  /** Number of PUTs received. */
  puts: () => number;
  close: () => Promise<void>;
}

/**
 * The real API handlers behind a local HTTP server, with an in-memory database and a fake S3
 * that enforces the same exact-size and content-type rules as a signed URL.
 */
export interface LocalApiOptions {
  /** Interface to listen on. Default 127.0.0.1; use 0.0.0.0 to reach it from a phone. */
  host?: string;
  /** Default: any free port. */
  port?: number;
  /** Clock for the API. Default: a fixed time, which keeps tests repeatable. */
  now?: () => Date;
}

export async function startLocalApi(adminToken: string, options: LocalApiOptions = {}): Promise<LocalApi> {
  const store = new MemoryStore();
  store.setAdminTokenHash(sha256Hex(adminToken));
  const objects = new Map<string, Buffer>();
  const expected = new Map<string, PresignPutRequest>();
  let origin = "";
  let putCount = 0;
  // Signed links point back at whatever address the caller used (an emulator reaches us as 10.0.2.2).
  const requestOrigin = new AsyncLocalStorage<string>();
  const currentOrigin = () => requestOrigin.getStore() ?? origin;

  const storage: Storage = {
    objectExists: async (key) => objects.has(key),
    presignPut: async (request) => {
      expected.set(request.key, request);
      return `${currentOrigin()}/s3/${request.key}`;
    },
    presignGet: async (key) => `${currentOrigin()}/s3/${key}`,
  };

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const reqOrigin = `http://${req.headers.host ?? origin.replace("http://", "")}`;
      const url = new URL(req.url ?? "/", reqOrigin);

      if (url.pathname.startsWith("/s3/") && (req.method === "GET" || req.method === "HEAD")) {
        const data = objects.get(url.pathname.slice(4));
        if (!data) {
          res.writeHead(404).end();
          return;
        }
        const type = url.pathname.endsWith(".jpg") ? "image/jpeg" : url.pathname.endsWith(".m4a") ? "audio/mp4" : "audio/mpeg";
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
        if (range) {
          const start = range[1] ? Number(range[1]) : Math.max(0, data.length - Number(range[2]));
          const end = range[1] && range[2] ? Math.min(Number(range[2]), data.length - 1) : data.length - 1;
          if (start > end || start >= data.length) {
            res.writeHead(416, { "content-range": `bytes */${data.length}` }).end();
            return;
          }
          res.writeHead(206, {
            "content-type": type,
            "accept-ranges": "bytes",
            "content-range": `bytes ${start}-${end}/${data.length}`,
            "content-length": end - start + 1,
          });
          res.end(req.method === "HEAD" ? undefined : data.subarray(start, end + 1));
          return;
        }
        res.writeHead(200, { "content-type": type, "accept-ranges": "bytes", "content-length": data.length });
        res.end(req.method === "HEAD" ? undefined : data);
        return;
      }

      if (url.pathname.startsWith("/s3/") && req.method === "PUT") {
        putCount++;
        const key = url.pathname.slice(4);
        const rule = expected.get(key);
        const sizeOk = rule?.contentLength === undefined || rule.contentLength === body.length;
        const typeOk = !rule || req.headers["content-type"] === rule.contentType;
        if (!rule || !sizeOk || !typeOk) {
          res.writeHead(403).end("SignatureDoesNotMatch");
          return;
        }
        objects.set(key, body);
        res.writeHead(200).end();
        return;
      }

      void requestOrigin.run(reqOrigin, () => route(
        {
          method: req.method ?? "GET",
          path: url.pathname,
          headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
          query: Object.fromEntries(url.searchParams),
          ...(body.length > 0 ? { body: body.toString("utf8") } : {}),
        },
        { store, storage, now: options.now ?? (() => new Date("2026-11-07T12:00:00Z")), libraryOverlap: 0 },
      ).then((out) => res.writeHead(out.statusCode, out.headers).end(out.body)));
    });
  });

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, options.host ?? "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    url: origin,
    store,
    objects,
    puts: () => putCount,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
