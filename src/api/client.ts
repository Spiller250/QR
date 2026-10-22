import type { ApiErrorBody } from '../../shared/types';

const SESSION_KEY = 'veriq.session';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const session = {
  get(): string | null {
    try {
      return localStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  },
  set(token: string | null) {
    try {
      if (token) localStorage.setItem(SESSION_KEY, token);
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      /* storage unavailable — session lasts for this page only */
    }
  },
};

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

type Query = Record<string, string | number | boolean | undefined | null>;

function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return `/api${path}${qs ? `?${qs}` : ''}`;
}

async function request<T>(
  method: string,
  path: string,
  opts: { body?: unknown; query?: Query; raw?: boolean; headers?: Record<string, string> } = {},
): Promise<T> {
  const headers: Record<string, string> = { ...opts.headers };
  const token = session.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the VERIQ API. Is the server running (npm run dev)?');
  }

  // Only an expired/invalid operator session signs the user out — not an app-key rejection from /verify.
  if (res.status === 401 && path !== '/auth/login' && !path.startsWith('/verify')) onUnauthorized?.();
  if (!res.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(res.status, body?.error.code ?? 'HTTP_ERROR', body?.error.message ?? `Request failed (${res.status})`, body?.error.fields);
  }
  if (opts.raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body: body ?? {} }),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, { body }),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, { body }),
  raw: (path: string, query?: Query) => request<Response>('GET', path, { query, raw: true }),
  /** POST /api/verify as the built-in web scanner (authorized client). */
  verify: <T>(body: unknown) => request<T>('POST', '/verify', { body, headers: APP_KEY ? { 'X-App-Key': APP_KEY } : {} }),
};

/**
 * App key of the built-in web scanner, injected at build time (VITE_APP_KEY).
 * Anything in a web bundle is readable by users — this identifies the client, it is not a secret.
 */
export const APP_KEY: string | undefined = import.meta.env.VITE_APP_KEY || undefined;

/**
 * Calls /api/verify the way a regular camera app or third-party scanner would: without an
 * app key. Used by the Live Demo to show the rejection. Returns status and body verbatim.
 */
export async function verifyWithoutAppKey(payload: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch('/api/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload }) });
  return { status: res.status, body: await res.json().catch(() => null) };
}
