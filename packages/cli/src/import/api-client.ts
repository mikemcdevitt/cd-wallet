import { createReadStream } from "node:fs";
import * as http from "node:http";
import * as https from "node:https";
import {
  API_LIMITS,
  type AddTrackResponse,
  type ApiErrorBody,
  type CheckTracksResponse,
  type CreateUploadRequest,
  type CreateUploadResponse,
  type TrackMetadata,
} from "@cdwallet/shared";
import { CliError } from "../errors";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Retries network errors and 5xx answers a few times; anything else fails straight away. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 500): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retryable = err instanceof ApiError ? err.retryable : !(err instanceof CliError);
      if (!retryable || attempt >= attempts) throw err;
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }
}

export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly retryDelayMs = 500,
  ) {}

  private request<T>(method: string, path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      let res: Response;
      try {
        res = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: {
            authorization: `Bearer ${this.token}`,
            ...(body !== undefined ? { "content-type": "application/json" } : {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
      } catch (err) {
        throw new ApiError(0, "network", `could not reach the server (${(err as Error).message})`, true);
      }
      const text = await res.text();
      if (res.status === 401 || res.status === 403) {
        throw new CliError(
          "The server rejected the saved admin token. If you redeployed or reset it, run `cdwallet deploy` or `cdwallet reset-token`.",
        );
      }
      if (!res.ok) {
        let code = "error";
        let message = text.slice(0, 200);
        try {
          const parsed = JSON.parse(text) as ApiErrorBody;
          code = parsed.error.code;
          message = parsed.error.message;
        } catch {
          /* keep the raw text */
        }
        throw new ApiError(res.status, code, message, res.status >= 500);
      }
      return JSON.parse(text) as T;
    }, 3, this.retryDelayMs);
  }

  /** Which of these hashes the library does not have yet. */
  async check(hashes: string[]): Promise<string[]> {
    const missing: string[] = [];
    const size = API_LIMITS.checkTracksMaxHashes;
    for (let i = 0; i < hashes.length; i += size) {
      const res = await this.request<CheckTracksResponse>("POST", "/tracks/check", { hashes: hashes.slice(i, i + size) });
      missing.push(...res.missing);
    }
    return missing;
  }

  createUpload(request: CreateUploadRequest): Promise<CreateUploadResponse> {
    return this.request("POST", "/uploads", request);
  }

  addTrack(metadata: TrackMetadata): Promise<AddTrackResponse> {
    return this.request("POST", "/tracks", metadata);
  }
}

export type UploadBody = { kind: "file"; path: string; size: number } | { kind: "bytes"; data: Uint8Array };

/**
 * PUTs to a presigned URL. Uses node's http(s) directly because the signed URL needs an exact
 * Content-Length, which fetch does not let us set for a streamed body.
 */
export function putBody(
  url: string,
  headers: Record<string, string>,
  body: UploadBody,
  retryDelayMs = 500,
): Promise<void> {
  const size = body.kind === "file" ? body.size : body.data.byteLength;
  const attempt = () =>
    new Promise<void>((resolve, reject) => {
      const target = new URL(url);
      const transport = target.protocol === "http:" ? http : https;
      const req = transport.request(
        target,
        { method: "PUT", headers: { ...headers, "content-length": String(size) } },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            const status = res.statusCode ?? 0;
            if (status >= 200 && status < 300) return resolve();
            const detail = Buffer.concat(chunks).toString("utf8").slice(0, 200);
            reject(new ApiError(status, "upload_failed", `upload was rejected (${status}) ${detail}`.trim(), status >= 500));
          });
        },
      );
      req.on("error", (err) => reject(new ApiError(0, "network", `upload failed (${err.message})`, true)));
      if (body.kind === "file") {
        const stream = createReadStream(body.path);
        stream.on("error", (err) => req.destroy(err));
        stream.pipe(req);
      } else {
        req.end(body.data);
      }
    });
  return withRetry(attempt, 3, retryDelayMs);
}
