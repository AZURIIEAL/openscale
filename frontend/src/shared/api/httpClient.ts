/**
 * Thin fetch wrapper every HTTP gateway adapter builds on. Centralizes the
 * control-plane base URL and JSON error handling so individual gateways
 * (HttpSystemHealthGateway, and future ones) stay one-liners.
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`POST ${path} failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}${path}`, { method: 'DELETE' });
  if (!res.ok) {
    throw new Error(`DELETE ${path} failed: ${res.status} ${res.statusText}`);
  }
}

/** Builds a ws://.../wss://... URL from the same base the HTTP helpers use. */
export function wsUrl(path: string): string {
  return `${API_BASE_URL.replace(/^http/, 'ws')}${path}`;
}
