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
 * A failed API call, carrying the server's error envelope so the UI can show the message the
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

export type QueryValue = string | number | boolean | undefined | null;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, QueryValue>;
  /** Auth endpoints opt out: they carry no access token and must not trigger a refresh. */
  anonymous?: boolean;
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(`${apiBase}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    // Empty strings are dropped, not sent. The filter UI uses '' for "any", and a bare
    // `?status=` would fail the API's zod enum validation with a 400.
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/** Turn a non-2xx response into an ApiClientError, tolerating non-JSON bodies. */
async function readError(res: Response): Promise<ApiClientError> {
  let payload: ApiErrorPayload = {
    code: 'HTTP_ERROR',
    message: `Request failed (HTTP ${String(res.status)})`,
  };
  try {
    const body: unknown = await res.json();
    const parsed = ApiErrorResponseSchema.safeParse(body);
    if (parsed.success) payload = parsed.data.error;
  } catch {
    // Not JSON — a proxy error page, a dropped connection, or an empty body. Keep the
    // generic message rather than masking the status code.
  }
  return new ApiClientError(res.status, payload);
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
    setTokens(tokens);
    return true;
  } catch {
    return false;
  }
}

/**
 * Exchange the stored refresh token for a fresh pair.
 *
 * SAFETY-CRITICAL: single-flight. The API ROTATES refresh tokens and treats reuse of an
 * already-rotated token as theft, revoking the entire token family. The dashboard fires
 * several requests at once (list + drivers + vehicles + admins), so they can all see a 401
 * in the same tick — without this guard they would each POST the same refresh token, and the
 * second one through would log the admin out and look like an attack in the audit trail.
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

  // Reads the access token at call time, so the replay below picks up the refreshed one.
  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (!opts.anonymous) {
      const token = getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    return fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  };

  const res = await send();
  if (res.status !== 401 || opts.anonymous) return res;

  // Access tokens live 15 minutes; an admin keeps this dashboard open all day. Refresh and
  // replay so the expiry is invisible to them.
  const refreshed = await refreshSession();
  if (!refreshed) {
    notifySessionEnded();
    return res;
  }

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
 * loud error naming the bad field, instead of `undefined` propagating into the UI and
 * rendering a blank cell that nobody notices for a week. Unknown extra fields are stripped,
 * so the API can add fields without breaking a deployed dashboard.
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
      message: 'The server returned a response this app does not understand.',
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

/** Pull the server-suggested filename out of Content-Disposition (CORS-exposed by the API). */
function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  return match?.[1] ?? null;
}

/**
 * Download a binary response (the Excel export) through the same auth + refresh path, and
 * hand it to the browser's downloader.
 */
export async function download(
  path: string,
  opts: RequestOptions,
  fallbackName: string,
): Promise<void> {
  const res = await fetchRaw(path, opts);
  if (!res.ok) throw await readError(res);

  const blob = await res.blob();
  const name = filenameFromDisposition(res.headers.get('Content-Disposition')) ?? fallbackName;
  const href = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Revoking synchronously can cancel the download in some browsers; give it a moment.
    window.setTimeout(() => {
      URL.revokeObjectURL(href);
    }, 10_000);
  }
}
