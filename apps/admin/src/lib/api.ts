export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    throw new ApiError(res.status, `GET ${path} nepavyko (${res.status})`);
  }
  return (await res.json()) as T;
}
