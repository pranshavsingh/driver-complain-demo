import { z } from 'zod';
import {
  apiSuccess,
  ApiErrorResponseSchema,
  AuthTokensSchema,
  type ApiErrorPayload,
} from '@driver-complaint/shared-types';
import { apiBase, apiUrl } from '../config/env';
import { getAccessToken, getRefreshToken, notifySessionEnded, setTokens } from './tokens';

/**
 * A failed API call, carrying the server's error envelope so a screen can show the message the
 * API chose and the requestId that correlates with the server logs.
 */
export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | undefined;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = payload.code;
    this.details = payload.details;
    this.requestId = payload.requestId;
  }
}

/**
 * Request timeouts and retry policy.
 *
 * The API is hosted on Render.com's free tier which spins down after ~15 min of inactivity.
 * A cold-start request will fail with a network error while the server wakes (~30–60 s).
 *
 * Strategy:
 * - Regular JSON requests: 40 s timeout, retry up to 3 times on network error.
 * - Multipart uploads: 120 s timeout, retry up to 2 times on network error.
 * - Between retries, wait exponentially: 5 s, 15 s, 30 s (capped at 30 s).
 *   This covers the Render.com ~30-60 s cold-start window without hammering the server.
 */
const REQUEST_TIMEOUT_MS = 40_000;
const UPLOAD_TIMEOUT_MS = 120_000;
/** How many times to retry a request on transient network errors (not HTTP errors). */
const MAX_RETRIES = 3;

export type QueryValue = string | number | boolean | undefined | null;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** JSON body, or a FormData for a multipart upload. */
  body?: unknown;
  query?: Record<string, QueryValue>;
  /** Auth endpoints opt out: they carry no access token and must not trigger a refresh. */
  anonymous?: boolean;
  timeoutMs?: number;
}

/**
 * Build the URL by hand rather than with `new URL()`.
 *
 * React Native ships an incomplete URL polyfill whose `searchParams` is not implemented, so
 * the dashboard's approach would silently drop every query parameter on a device.
 */
function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(query ?? {})) {
    // Empty strings are dropped, not sent: a bare `?status=` fails the API's zod enum
    // validation with a 400.
    if (value === undefined || value === null || value === '') continue;
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return pairs.length === 0 ? `${apiBase}${path}` : `${apiBase}${path}?${pairs.join('&')}`;
}

/** Turn a non-2xx response into an ApiClientError, tolerating non-JSON bodies. */
async function readError(res: Response): Promise<ApiClientError> {
  let payload: ApiErrorPayload = {
    code: 'HTTP_ERROR',
    message: `Something went wrong (error ${String(res.status)}). Please try again.`,
  };
  try {
    const body: unknown = await res.json();
    const parsed = ApiErrorResponseSchema.safeParse(body);
    if (parsed.success) payload = parsed.data.error;
  } catch {
    // Not JSON — a captive-portal login page, a proxy error, or a dropped connection. Keep
    // the generic message rather than masking the status code.
  }
  return new ApiClientError(res.status, payload);
}

/**
 * Turn a transport failure into the same error type as an API failure, with wording a driver
 * can act on. `fetch` rejects with a bare `TypeError: Network request failed` for everything
 * from airplane mode to a wrong LAN address, which is useless on screen.
 */
function networkError(err: unknown, timedOut: boolean): ApiClientError {
  if (timedOut) {
    return new ApiClientError(0, {
      code: 'NETWORK_TIMEOUT',
      message:
        'The server is taking too long to respond. Move to better signal and try again, or wait a moment for the server to wake up.',
      details: null,
    });
  }
  return new ApiClientError(0, {
    code: 'NETWORK_ERROR',
    message:
      'Cannot reach the server. Check your internet connection and try again.',
    details: err instanceof Error ? err.message : null,
  });
}

/** Sleep for `ms` milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exponential backoff delay for retry N (0-indexed).
 * Sequence: 3 s, 8 s, 15 s, 25 s — covers Render.com cold-start window.
 */
function retryDelay(attempt: number): number {
  const delays = [3_000, 8_000, 15_000, 25_000];
  return delays[Math.min(attempt, delays.length - 1)] ?? 25_000;
}

/**
 * Warm up the API server with a lightweight /health ping before an upload.
 *
 * Render.com free tier sleeps after ~15 min of inactivity. Sending the full multipart
 * request while the server is waking produces a "Network request failed" error in React
 * Native's HTTP stack because the TCP connection is refused. A /health ping costs almost
 * nothing, polls until the server responds or a 75 s budget elapses, and ensures the
 * real upload goes to a live server.
 */
export async function warmUpServer(): Promise<void> {
  const healthUrl = `${apiUrl}/health`;
  const deadline = Date.now() + 75_000; // 75 s wake budget
  while (Date.now() < deadline) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);
      const res = await fetch(healthUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return; // Server is awake
    } catch {
      // Server still sleeping — wait and poll again
    }
    if (Date.now() + 3_000 < deadline) {
      await sleep(3_000);
    }
  }
}

let refreshInFlight: Promise<boolean> | null = null;

async function performRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const tokens = await request(AuthTokensSchema, '/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
      anonymous: true,
    });
    await setTokens(tokens as { accessToken: string; refreshToken: string; expiresIn: number });
    return true;
  } catch {
    return false;
  }
}

/**
 * Exchange the stored refresh token for a fresh pair.
 *
 * SAFETY-CRITICAL: single-flight. The API ROTATES refresh tokens and treats reuse of an
 * already-rotated token as theft, revoking the entire token family. The home screen loads the
 * vehicle and the complaint list at once, so both can see a 401 in the same tick — without
 * this guard they would each POST the same refresh token, and the second one through would log
 * the driver out mid-shift and look like an attack in the audit trail.
 */
export async function refreshSession(): Promise<boolean> {
  refreshInFlight ??= performRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** One HTTP round-trip, with a timeout and proper error translation. */
async function sendOnce(
  url: string,
  opts: RequestOptions,
  isMultipart: boolean,
  timeoutMs: number,
): Promise<Response> {
  const headers: Record<string, string> = {};
  // Multipart deliberately has NO Content-Type header: React Native fills it in with the
  // generated multipart boundary. Setting it here produces a body multer cannot parse.
  if (opts.body !== undefined && !isMultipart) headers['Content-Type'] = 'application/json';
  if (!opts.anonymous) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  console.log(`[NET-REQ] ${opts.method ?? 'GET'} ${url}`);
  if (isMultipart && opts.body && typeof opts.body === 'object' && '_parts' in (opts.body as Record<string, unknown>)) {
    const parts = (opts.body as { _parts: [string, unknown][] })._parts;
    console.log('[NET-FORM] Fields:', parts.map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(', '));
  }

  if (isMultipart) {
    // In Expo SDK 52+ / React Native 0.86, global `fetch` is overridden by expo/fetch,
    // which throws `[Error: Unsupported FormDataPart implementation]` on native `{ uri, name, type }` parts.
    // React Native's `XMLHttpRequest` directly uses the native NetworkingModule on Android/iOS,
    // which natively streams `{ uri, name, type }` files from disk without reading into JS memory!
    return await new Promise<Response>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(opts.method ?? 'POST', url);
      xhr.timeout = timeoutMs;
      for (const [k, v] of Object.entries(headers)) {
        xhr.setRequestHeader(k, v);
      }
      xhr.onload = () => {
        const responseHeaders = new Headers();
        const allHeaders = xhr.getAllResponseHeaders() || '';
        allHeaders.split('\r\n').forEach((line) => {
          const parts = line.split(': ');
          if (parts[0]) responseHeaders.append(parts[0], parts.slice(1).join(': '));
        });
        const res = new Response(xhr.response || xhr.responseText, {
          status: xhr.status,
          statusText: xhr.statusText,
          headers: responseHeaders,
        });
        console.log(`[NET-RES] ${res.status} ${opts.method ?? 'POST'} ${url}`);
        resolve(res);
      };
      xhr.onerror = (e) => {
        console.warn(`[NET-ERR] XHR error on ${url}:`, e);
        reject(networkError(e, false));
      };
      xhr.ontimeout = () => {
        console.warn(`[NET-ERR] XHR timeout on ${url}`);
        reject(networkError(new Error('Upload timed out'), true));
      };
      xhr.send(opts.body as FormData);
    });
  }

  try {
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
    });
    console.log(`[NET-RES] ${res.status} ${opts.method ?? 'GET'} ${url}`);
    return res;
  } catch (err) {
    console.warn(`[NET-ERR] ${opts.method ?? 'GET'} ${url}:`, err);
    throw networkError(err, timedOut);
  } finally {
    clearTimeout(timer);
  }
}

/** Send one request, transparently refreshing an expired access token and replaying once. */
async function fetchRaw(path: string, opts: RequestOptions): Promise<Response> {
  const url = buildUrl(path, opts.query);
  const isMultipart = Boolean(
    opts.body &&
      typeof opts.body === 'object' &&
      (opts.body instanceof FormData ||
        '_parts' in opts.body ||
        typeof (opts.body as FormData).append === 'function'),
  );
  const timeoutMs = opts.timeoutMs ?? (isMultipart ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS);
  const maxRetries = isMultipart ? MAX_RETRIES : MAX_RETRIES;

  // Retry loop for transient network errors (Render.com cold-start, flaky 3G, etc.).
  // HTTP errors (4xx, 5xx) are NOT retried — those are definitive server responses.
  let lastErr: ApiClientError | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = retryDelay(attempt - 1);
      console.warn(`[api] Network error, retrying in ${String(delay / 1000)} s (attempt ${String(attempt)}/${String(maxRetries)})...`);
      await sleep(delay);
    }
    try {
      const res = await sendOnce(url, opts, isMultipart, timeoutMs);
      if (res.status !== 401 || opts.anonymous) return res;

      // Access tokens live 15 minutes and the app stays open all shift. Refresh and replay so the
      // expiry is invisible to the driver.
      const refreshed = await refreshSession();
      if (!refreshed) {
        notifySessionEnded();
        return res;
      }

      // Replaying a multipart body is safe: the FormData holds a file URI, and React Native reads
      // the file off disk again on each send.
      const replay = await sendOnce(url, opts, isMultipart, timeoutMs);
      // A 401 on a freshly-minted token is not an expiry — the account was deactivated, or the
      // token family was revoked. End the session rather than looping.
      if (replay.status === 401) notifySessionEnded();
      return replay;
    } catch (err) {
      if (err instanceof ApiClientError) {
        // Only retry on transport-level failures (NETWORK_ERROR, NETWORK_TIMEOUT).
        // HTTP errors (ApiClientError with a real status) should not be retried.
        if (err.status === 0) {
          lastErr = err;
          continue; // Retry the loop
        }
      }
      throw err; // HTTP error or unexpected — don't retry
    }
  }

  // All retries exhausted.
  throw lastErr ?? new ApiClientError(0, {
    code: 'NETWORK_ERROR',
    message: 'Cannot reach the server after multiple attempts. Check your internet connection.',
    details: null,
  });
}

/**
 * Call the API and validate the response against its shared-types schema.
 *
 * Validating here (rather than casting) means an API/client contract drift surfaces as one
 * loud error naming the bad field, instead of `undefined` propagating into the UI. That
 * matters more on mobile than on the web: a shipped APK cannot be hot-fixed, so a mismatch
 * has to be obvious the first time it is seen in testing.
 */
export async function request<T>(
  schema: z.ZodType<T>,
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const res = await fetchRaw(path, opts);
  if (!res.ok) throw await readError(res);

  const body: unknown = await res.json();
  const envelope = apiSuccess(schema).safeParse(body);
  if (!envelope.success) {
    throw new ApiClientError(res.status, {
      code: 'MALFORMED_RESPONSE',
      message: 'This version of the app does not understand the server\u2019s reply. Update the app.',
      details: envelope.error.issues.map((i) => i.message).join('\n'),
    });
  }
  return envelope.data.data;
}

/** Call an endpoint that answers 204 No Content (logout, device de-registration). */
export async function requestNoContent(path: string, opts: RequestOptions = {}): Promise<void> {
  const res = await fetchRaw(path, opts);
  if (!res.ok) throw await readError(res);
}
