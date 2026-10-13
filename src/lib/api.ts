export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/${path}`, { ...options, credentials: "same-origin", headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.statusMessage || `Request failed (${response.status})`);
  return data as T;
}
export const send = <T>(path: string, body?: unknown) => api<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
export const useApi = (path: string) => api<any>(path);
