import type { Server, Socket } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@chess-impostor/shared";
import { prisma } from "./db.js";
import { LiveGameService } from "./game/liveGame.js";
import { verifyAccessToken } from "./utils/tokens.js";

type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/** Valid room code: exactly 6 uppercase alphanumeric characters */
const ROOM_CODE_RE = /^[A-Z0-9]{6}$/;

function validateRoomCode(roomCode: unknown): string {
  if (typeof roomCode !== "string") throw new Error("Invalid room code.");
  const code = roomCode.trim().toUpperCase();
  if (!ROOM_CODE_RE.test(code)) throw new Error("Room code must be 6 alphanumeric characters.");
  return code;
}

export function createLiveGameService(io: GameServer) {
  return new LiveGameService(
    // Broadcast to all sockets in a Socket.IO room
    (roomCode, event, payload) => {
      io.to(roomCode).emit(event as keyof ServerToClientEvents, payload as never);
    },
    // SEC-8: Use a user-specific Socket.IO room for O(1) targeted delivery.
    // Each authenticated socket joins a room named after the user's ID (see middleware below).
    (userId, event, payload) => {
      io.to(userId).emit(event as keyof ServerToClientEvents, payload as never);
    }
  );
}

export function registerSockets(io: GameServer, liveGames: LiveGameService) {
  // ── Auth middleware ─────────────────────────────────────────────────────────
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token || typeof token !== "string") {
      next(new Error("Missing socket auth token."));
      return;
    }

    try {
      const decoded = verifyAccessToken(token);
      const user = await prisma.user.findUnique({
        where: { id: decoded.sub },
        select: { id: true, username: true, email: true, avatar: true }
      });
      if (!user) throw new Error("User not found.");
      socket.data.user = user;
      liveGames.attachSocket(socket.id, user.id);

      // SEC-8: Join a private room named after the user's ID so that
      // directEmit can use io.to(userId) instead of scanning all sockets.
      await socket.join(user.id);

      next();
    } catch {
      next(new Error("Invalid socket auth token."));
    }
  });

  // ── Connection handler ──────────────────────────────────────────────────────
  io.on("connection", (socket: GameSocket) => {
    const user = socket.data.user;

    socket.on("join-room", ({ roomCode }, ack) => {
      handle(socket, ack, () => {
        const code = validateRoomCode(roomCode);
        socket.join(code);
        return liveGames.joinRoom(code, user, socket.id);
      });
    });

    socket.on("leave-room", ({ roomCode }, ack) => {
      handle(socket, ack, () => {
        const code = validateRoomCode(roomCode);
        socket.leave(code);
        return liveGames.leaveRoom(code, user.id);
      });
    });

    socket.on("leave-game", ({ roomCode }, ack) => {
      handle(socket, ack, () => {
        const code = validateRoomCode(roomCode);
        socket.leave(code);
        return liveGames.leaveGame(code, user.id);
      });
    });

    socket.on("player-ready", ({ roomCode, ready }, ack) => {
      handle(socket, ack, () => liveGames.setReady(validateRoomCode(roomCode), user.id, ready));
    });

    socket.on("start-game", ({ roomCode }, ack) => {
      handle(socket, ack, () => liveGames.startGame(validateRoomCode(roomCode), user.id));
    });

    socket.on("make-move", ({ roomCode, from, to, promotion }, ack) => {
      handle(socket, ack, () =>
        liveGames.makeMove(validateRoomCode(roomCode), user.id, { from, to, promotion })
      );
    });

    socket.on("send-message", ({ roomCode, body }, ack) => {
      handle(socket, ack, () => liveGames.sendMessage(validateRoomCode(roomCode), user.id, body));
    });

    socket.on("call-meeting", ({ roomCode }, ack) => {
      handle(socket, ack, () => liveGames.callMeeting(validateRoomCode(roomCode), user.id));
    });

    socket.on("cast-vote", ({ roomCode, targetId }, ack) => {
      handle(socket, ack, () =>
        liveGames.castVote(validateRoomCode(roomCode), user.id, targetId)
      );
    });

    socket.on("reconnect-player", ({ roomCode }, ack) => {
      handle(socket, ack, () => {
        const code = validateRoomCode(roomCode);
        socket.join(code);
        return liveGames.snapshot(code, user.id);
      });
    });

    socket.on("disconnect", () => {
      liveGames.detachSocket(socket.id);
    });
  });
}

function handle<T>(
  socket: GameSocket,
  ack: ((response: { ok: true; data: T } | { ok: false; error: string }) => void) | undefined,
  action: () => T | Promise<T>
) {
  Promise.resolve()
    .then(action)
    .then((data) => ack?.({ ok: true, data }))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unexpected server error.";
      socket.emit("error-message", message);
      ack?.({ ok: false, error: message });
    });
}
