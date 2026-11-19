import 'server-only';
import { webEnv } from './env';

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

/** Per daug bandymų (API 429): rodoma vietoje, ne klaidos puslapis. */
export const TOO_MANY_REQUESTS_MESSAGE = 'Per daug bandymų. Pabandykite po kelių minučių.';

export interface ApiRequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Kreipinys į API be talpinimo. Ne 2xx atsakymas virsta ApiError. API adresas: API_URL
 * (tik serveryje: naršyklė į API nesikreipia; produkcijoje privalomas, žr. env.ts).
 */
export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${webEnv().apiUrl}${path}`, {
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
