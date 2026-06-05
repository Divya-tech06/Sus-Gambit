import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@chess-impostor/shared";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;

export function getSocket(token: string): GameSocket {
  if (socket?.connected) return socket;
  socket = io(import.meta.env.VITE_SOCKET_URL ?? "http://localhost:4000", {
    auth: { token },
    autoConnect: true
  });
  return socket;
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
}
