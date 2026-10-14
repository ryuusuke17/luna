import {networkMessage, requestMessage} from "./messages.ts";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

function csrfToken(){return document.cookie.split("; ").find(value=>value.startsWith("luna_csrf="))?.slice("luna_csrf=".length)}

async function request(path: string, options: RequestInit = {}): Promise<Response> {
  const method = (options.method ?? "GET").toUpperCase();
  const csrf = csrfToken();
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (!["GET", "HEAD"].includes(method) && csrf) {
    try { headers.set("x-luna-csrf", decodeURIComponent(csrf)); }
    catch { throw new ApiError("Your session could not be verified. Reload the page and sign in again before retrying.", 403); }
  }
  let response: Response;
  try { response = await fetch(`/api/${path}`, {...options, credentials: "same-origin", headers}); }
  catch { throw new ApiError(networkMessage(method), 0); }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new ApiError(requestMessage(response.status, body, path, method), response.status);
  }
  return response;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await request(path, options);
  try { return await response.json() as T; }
  catch { throw new ApiError(`Luna could not read the server’s reply. Reload the page.${(options.method ?? "GET").toUpperCase() !== "GET" ? " Check the records before retrying; the result is not confirmed." : " Then try again."}`, 0); }
}

export async function downloadExport(format: "json" | "csv"): Promise<void> {
  const response = await request(`export?format=${format}`);
  const expected = format === "csv" ? "text/csv" : "application/json";
  if (!response.headers.get("Content-Type")?.includes(expected)) throw new ApiError("Luna could not prepare the export file. Reload the page and try again.", 0);
  let blob: Blob;
  try { blob = await response.blob(); }
  catch { throw new ApiError("The export download was interrupted. Check your connection and try again.", 0); }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `luna-export.${format}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const send=<T>(path:string,body?:unknown)=>api<T>(path,{method:"POST",body:JSON.stringify(body??{})});
export const useApi=(path:string)=>api<any>(path);
