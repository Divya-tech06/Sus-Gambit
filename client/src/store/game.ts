import type { ChatMessage, GameSnapshot, RoomSnapshot } from "@chess-impostor/shared";
import { create } from "zustand";

interface GameState {
  room: RoomSnapshot | null;
  game: GameSnapshot | null;
  role: "CREWMATE" | "IMPOSTOR" | null;
  error: string | null;
  setRoom: (room: RoomSnapshot | null) => void;
  setGame: (game: GameSnapshot | null) => void;
  setRole: (role: "CREWMATE" | "IMPOSTOR" | null) => void;
  pushChat: (message: ChatMessage) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  room: null,
  game: null,
  role: null,
  error: null,
  setRoom: (room) => set({ room }),
  setGame: (game) => set({ game }),
  setRole: (role) => set({ role }),
  pushChat: (message) =>
    set((state) => ({
      game: state.game ? { ...state.game, chat: [...state.game.chat, message] } : state.game
    })),
  setError: (error) => set({ error }),
  reset: () => set({ room: null, game: null, role: null, error: null })
}));
