import 'server-only';

/**
 * API adresas. Tik serveryje: naršyklė admin veiksmams į API nesikreipia,
 * tai daro admin Next.js serveris su sesijos tokenu iš savo cookie.
 */
export const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export interface ApiIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** Visas klaidos atsakymo body (pvz., `code`, `issues`), jei API grąžino JSON. */
    public readonly body: unknown = null,
  ) {
    super(message);
  }

  /** Klaidos kodas iš API (pvz., SLUG_TAKEN), jei yra. */
  get code(): string | undefined {
    const code = (this.body as { code?: unknown } | null)?.code;
    return typeof code === 'string' ? code : undefined;
  }

  /** ZodValidationPipe klaidos (400), jei yra. */
  get issues(): ApiIssue[] {
    const issues = (this.body as { issues?: unknown } | null)?.issues;
    return Array.isArray(issues)
      ? issues.filter(
          (i): i is ApiIssue => !!i && typeof i.path === 'string' && typeof i.message === 'string',
        )
      : [];
  }
}

function messageFrom(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const { message } = body as { message: unknown };
    if (typeof message === 'string') return message;
    if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
  }
  return `Užklausa nepavyko (${status})`;
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Admino sesijos tokenas (Authorization: Bearer). */
  token?: string;
  headers?: Record<string, string>;
}

/** Kreipinys į API. Ne 2xx atsakymas virsta ApiError su API (lietuvišku) pranešimu. */
export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
  });

  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    throw new ApiError(res.status, messageFrom(body, res.status), body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
