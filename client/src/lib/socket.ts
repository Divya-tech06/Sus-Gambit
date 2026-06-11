import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@chess-impostor/shared";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;
let currentToken: string | null = null;

export function getSocket(token: string): GameSocket {
  // Reuse existing socket if it belongs to the same token, regardless of connection state
  if (socket && currentToken === token) return socket;

  // Token changed or no socket yet — disconnect old one and create fresh
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  currentToken = token;
  socket = io(import.meta.env.VITE_SOCKET_URL ?? "http://localhost:4000", {
    auth: { token },
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });
  return socket;
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
  currentToken = null;
}
