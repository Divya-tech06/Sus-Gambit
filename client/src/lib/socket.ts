import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@chess-impostor/shared";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;
let currentToken: string | null = null;

// DOMAIN-1/2: VITE_SOCKET_URL is required in production.
// Set it in your .env.local (dev) or deployment environment (prod).
// There is intentionally no localhost fallback to catch misconfiguration early.
const SOCKET_URL = "https://sus-gambit-lgx1.onrender.com";

if (!SOCKET_URL) {
  throw new Error(
    "[socket] VITE_SOCKET_URL is not set. " +
    "Add it to your .env.local (dev) or deployment environment (prod)."
  );
}

export function getSocket(token: string): GameSocket {
  // Reuse existing socket if it belongs to the same token, regardless of connection state
  if (socket && currentToken === token) return socket;

  // Token changed or no socket yet — disconnect old one and create fresh
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  currentToken = token;
  socket = io(SOCKET_URL!, {
    auth: { token },
    autoConnect: true,
    // SOCK-1: Infinite reconnection — never permanently give up on the user.
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
    // DOMAIN-3: Prefer WebSocket; fall back to polling if the proxy doesn't
    // support WebSocket upgrades. Ensure your reverse proxy forwards the
    // Upgrade header (see .env.example for Nginx config notes).
    transports: ["websocket", "polling"]
  });

  return socket;
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
  currentToken = null;
}
