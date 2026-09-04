import { z } from 'zod';
import {
  apiSuccess,
  ApiErrorResponseSchema,
  AuthTokensSchema,
  type ApiErrorPayload,
} from '@driver-complaint/shared-types';
import { apiBase } from '../config/env';
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
 * Request deadlines, because the driver is on a truck on 3G.
 *
 * React Native's fetch has no timeout of its own: a request that stalls mid-handshake hangs
 * forever, and the driver sits looking at a spinner with no way to retry. The upload budget is
 * far longer — a 2 MB photo over a weak uplink legitimately takes a minute.
 */
const REQUEST_TIMEOUT_MS = 20_000;
const UPLOAD_TIMEOUT_MS = 120_000;

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
      message: 'The connection is too slow to finish this. Move to better signal and try again.',
      details: null,
    });
  }
  return new ApiClientError(0, {
    code: 'NETWORK_ERROR',
    message: 'No connection to the server. Check your signal and try again.',
    details: err instanceof Error ? err.message : null,
  });
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

/** Send one request, transparently refreshing an expired access token and replaying once. */
async function fetchRaw(path: string, opts: RequestOptions): Promise<Response> {
  const url = buildUrl(path, opts.query);
  const isMultipart = opts.body instanceof FormData;
  const timeoutMs = opts.timeoutMs ?? (isMultipart ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS);

  // Reads the access token at call time, so the replay below picks up the refreshed one.
  const send = async (): Promise<Response> => {
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

    try {
      return await fetch(url, {
        method: opts.method ?? 'GET',
        headers,
        body: isMultipart
          ? (opts.body as FormData)
          : opts.body === undefined
            ? undefined
            : JSON.stringify(opts.body),
        signal: controller.signal,
      });
    } catch (err) {
      throw networkError(err, timedOut);
    } finally {
      clearTimeout(timer);
    }
  };

  const res = await send();
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
  const replay = await send();
  // A 401 on a freshly-minted token is not an expiry — the account was deactivated, or the
  // token family was revoked. End the session rather than looping.
  if (replay.status === 401) notifySessionEnded();
  return replay;
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
      message: 'This version of the app does not understand the server’s reply. Update the app.',
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
