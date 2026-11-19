import 'server-only';

/**
 * API adresas. Kreipiamasi tik iš web Next.js serverio (puslapiai ir Server Actions),
 * todėl užtenka serverio kintamojo API_URL. NEXT_PUBLIC_API_URL paliktas suderinamumui.
 */
export const API_URL =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** Visas klaidos atsakymo body (`code`, `details`, `issues`), jei API grąžino JSON. */
    public readonly body: unknown = null,
  ) {
    super(message);
  }

  get code(): string | undefined {
    const code = (this.body as { code?: unknown } | null)?.code;
    return typeof code === 'string' ? code : undefined;
  }
}

function messageFrom(body: unknown, status: number): string {
  const message = (body as { message?: unknown } | null)?.message;
  if (typeof message === 'string') return message;
  return `Užklausa nepavyko (${status})`;
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  headers?: Record<string, string>;
}

/** Kreipinys į API be talpinimo. Ne 2xx atsakymas virsta ApiError. */
export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
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
  return (await res.json()) as T;
}
