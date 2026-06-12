import type { AuthPayload, RoomSettings, RoomSnapshot } from "@chess-impostor/shared";
import { useAuthStore } from "../store/auth";

// DOMAIN-1: VITE_API_BASE is required in production.
// In dev it falls back to localhost; in production it must be explicitly set.
const API_BASE =
  import.meta.env.VITE_API_BASE ??
  (import.meta.env.DEV ? "http://localhost:4000" : undefined);

if (!API_BASE) {
  throw new Error(
    "[api] VITE_API_BASE is not set. " +
      "Add it to your .env.local (dev) or deployment environment (prod)."
  );
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });
  const data = await response.json().catch(() => ({}));

  if (response.status === 401 && path !== "/auth/refresh") {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return request<T>(path, options);
    }
  }

  if (!response.ok) throw new Error(data.error ?? "Request failed.");
  return data as T;
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) {
    useAuthStore.getState().logout();
    return false;
  }

  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken })
  });

  if (!response.ok) {
    useAuthStore.getState().logout();
    return false;
  }

  const payload = (await response.json()) as AuthPayload;
  useAuthStore.getState().setAuth(payload);
  return true;
}

export const api = {
  signup: (payload: { username: string; email: string; password: string; confirmPassword: string }) =>
    request<AuthPayload>("/auth/signup", { method: "POST", body: JSON.stringify(payload) }),
  login: (payload: { email: string; password: string; rememberMe: boolean }) =>
    request<AuthPayload>("/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  me: () => request<AuthPayload>("/auth/me"),
  updateProfile: (payload: { username?: string; avatar?: string | null }) =>
    request<AuthPayload>("/auth/profile", { method: "PATCH", body: JSON.stringify(payload) }),
  createRoom: (settings: RoomSettings) =>
    request<RoomSnapshot>("/rooms", { method: "POST", body: JSON.stringify(settings) }),
  publicRooms: () => request<RoomSnapshot[]>("/rooms/public")
};
