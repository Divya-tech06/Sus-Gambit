import type { AuthPayload } from "@chess-impostor/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { closeSocket } from "../lib/socket";

type AuthUser = AuthPayload["user"];

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setAuth: (payload: AuthPayload) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setAuth: (payload) =>
        set((state) => ({
          accessToken: payload.accessToken,
          // DB-5: /auth/me and /auth/profile return refreshToken: "" to avoid
          // creating a new DB row on every page load. Preserve the stored token.
          refreshToken: payload.refreshToken || state.refreshToken,
          user: payload.user
        })),
      logout: () => {
        closeSocket();
        set({ accessToken: null, refreshToken: null, user: null });
      }
    }),
    { name: "chess-impostor-auth" }
  )
);
