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
export async function startLocalApi(adminToken: string): Promise<LocalApi> {
  const store = new MemoryStore();
  store.setAdminTokenHash(sha256Hex(adminToken));
  const objects = new Map<string, Buffer>();
  const expected = new Map<string, PresignPutRequest>();
  let origin = "";
  let putCount = 0;

  const storage: Storage = {
    objectExists: async (key) => objects.has(key),
    presignPut: async (request) => {
      expected.set(request.key, request);
      return `${origin}/s3/${request.key}`;
    },
    presignGet: async (key) => `${origin}/s3/${key}`,
  };

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const url = new URL(req.url ?? "/", origin);

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

      void route(
        {
          method: req.method ?? "GET",
          path: url.pathname,
          headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
          query: Object.fromEntries(url.searchParams),
          ...(body.length > 0 ? { body: body.toString("utf8") } : {}),
        },
        { store, storage, now: () => new Date("2026-11-07T12:00:00Z"), libraryOverlap: 0 },
      ).then((out) => res.writeHead(out.statusCode, out.headers).end(out.body));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    url: origin,
    store,
    objects,
    puts: () => putCount,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
