import type {
  ApiErrorBody,
  ClaimPairingRequest,
  ClaimPairingResponse,
  LibraryResponse,
  StreamUrlsResponse,
} from "@cdwallet/shared";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiClientOptions {
  apiUrl: string;
  /** Device token. Omit for the one unauthenticated call (pairing). */
  token?: string;
  fetch?: typeof fetch;
  /** Give up on a request after this long. Default 15 seconds. */
  timeoutMs?: number;
}

export interface ApiClient {
  readonly apiUrl: string;
  library(since: number): Promise<LibraryResponse>;
  streamUrls(trackIds: string[]): Promise<StreamUrlsResponse>;
  claimPairing(code: string, deviceName: string): Promise<ClaimPairingResponse>;
  /** Address of the cover art endpoint, which needs the Authorization header. */
  artUrl(artHash: string): string;
  authHeaders(): Record<string, string>;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const apiUrl = options.apiUrl.replace(/\/+$/, "");
  const doFetch = options.fetch ?? fetch;

  const authHeaders = (): Record<string, string> => (options.token ? { authorization: `Bearer ${options.token}` } : {});

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    const timeoutMs = options.timeoutMs ?? 15_000;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      res = await doFetch(`${apiUrl}${path}`, {
        method,
        headers: { ...authHeaders(), ...(body === undefined ? {} : { "content-type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (timedOut) {
        throw new ApiError(0, "timeout", `${apiUrl} didn't answer within ${Math.round(timeoutMs / 1000)} seconds. Check the address and that this phone can reach it.`);
      }
      throw new ApiError(0, "network", `Could not reach ${apiUrl}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      let parsed: Partial<ApiErrorBody> | undefined;
      try {
        parsed = (await res.json()) as Partial<ApiErrorBody>;
      } catch {
        // not JSON (for example a gateway error page)
      }
      throw new ApiError(res.status, parsed?.error?.code ?? "http_error", parsed?.error?.message ?? `Server returned ${res.status}`);
    }
    return (await res.json()) as T;
  }

  return {
    apiUrl,
    authHeaders,
    artUrl: (artHash) => `${apiUrl}/art/${encodeURIComponent(artHash)}`,
    library: (since) => request<LibraryResponse>("GET", `/library?since=${Math.max(0, Math.floor(since))}`),
    streamUrls: (trackIds) => request<StreamUrlsResponse>("POST", "/stream-urls", { trackIds }),
    claimPairing: (code, deviceName) =>
      request<ClaimPairingResponse>("POST", "/pairing/claim", { code, deviceName } satisfies ClaimPairingRequest),
  };
}

/** Plain-language text for an error shown to the owner. */
export function describeApiError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "invalid_code") return "That pairing code didn't work. It may have expired or already been used. Make a new one on your computer.";
    if (err.status === 401 || err.status === 403) return "This phone is no longer allowed to use your library. Pair it again.";
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

export function isAuthRevoked(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 401 || err.status === 403);
}
