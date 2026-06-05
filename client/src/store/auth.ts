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
        set({ accessToken: payload.accessToken, refreshToken: payload.refreshToken, user: payload.user }),
      logout: () => {
        closeSocket();
        set({ accessToken: null, refreshToken: null, user: null });
      }
    }),
    { name: "chess-impostor-auth" }
  )
);
