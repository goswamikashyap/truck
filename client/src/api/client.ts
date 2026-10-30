const ACCESS = "access_token";
const REFRESH = "refresh_token";

export const getToken = () => localStorage.getItem(ACCESS);
export function setTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS, access);
  localStorage.setItem(REFRESH, refresh);
}
export function clearTokens() {
  localStorage.removeItem(ACCESS);
  localStorage.removeItem(REFRESH);
}

let refreshing: Promise<boolean> | null = null;

/** Several requests can fail together when the token expires; they all wait for ONE refresh call. */
function refreshAccessToken(): Promise<boolean> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function doRefresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem(REFRESH);
  if (!refreshToken) return false;
  let res: Response;
  try {
    res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    return false;
  }
  if (!res.ok) return false;
  const data = await res.json();
  setTokens(data.accessToken, data.refreshToken);
  return true;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request(path: string, options: RequestInit) {
  const token = getToken();
  return fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isAuthCall = path.startsWith("/auth/");
  let res: Response;
  try {
    res = await request(path, options);
  } catch {
    throw new ApiError("Cannot reach the server. Check your internet and try again.", 0);
  }

  // Expired access token: refresh once and retry. Login/signup errors are shown, not redirected.
  if (res.status === 401 && !isAuthCall) {
    if (await refreshAccessToken()) {
      res = await request(path, options);
    }
    if (res.status === 401) {
      clearTokens();
      if (window.location.pathname !== "/login") window.location.href = "/login";
      throw new ApiError("Session expired. Please log in again.", 401);
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body.details?.map((d: any) => `${d.field}: ${d.message}`).join(", ");
    throw new ApiError(detail || body.error || `HTTP ${res.status}`, res.status);
  }
  return res.json();
}

export const post = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });
export const patch = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
export const put = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "PUT", body: JSON.stringify(body) });
export const del = <T>(path: string) => api<T>(path, { method: "DELETE" });
