import type { Server, Socket } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@chess-impostor/shared";
import { prisma } from "./db.js";
import { LiveGameService } from "./game/liveGame.js";
import { verifyAccessToken } from "./utils/tokens.js";

type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export function createLiveGameService(io: GameServer) {
  return new LiveGameService(
    (roomCode, event, payload) => {
      io.to(roomCode).emit(event as keyof ServerToClientEvents, payload as never);
    },
    (userId, event, payload) => {
      for (const socket of io.sockets.sockets.values()) {
        if (socket.data.user?.id === userId) {
          socket.emit(event as keyof ServerToClientEvents, payload as never);
        }
      }
    }
  );
}

export function registerSockets(io: GameServer, liveGames: LiveGameService) {
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
      next();
    } catch {
      next(new Error("Invalid socket auth token."));
    }
  });

  io.on("connection", (socket: GameSocket) => {
    const user = socket.data.user;

    socket.on("join-room", ({ roomCode }, ack) => {
      handle(socket, ack, () => {
        socket.join(roomCode.toUpperCase());
        return liveGames.joinRoom(roomCode, user, socket.id);
      });
    });

    socket.on("leave-room", ({ roomCode }, ack) => {
      handle(socket, ack, () => {
        socket.leave(roomCode.toUpperCase());
        return liveGames.leaveRoom(roomCode, user.id);
      });
    });

    socket.on("leave-game", ({ roomCode }, ack) => {
      handle(socket, ack, () => {
        socket.leave(roomCode.toUpperCase());
        return liveGames.leaveGame(roomCode, user.id);
      });
    });

    socket.on("player-ready", ({ roomCode, ready }, ack) => {
      handle(socket, ack, () => liveGames.setReady(roomCode, user.id, ready));
    });

    socket.on("start-game", ({ roomCode }, ack) => {
      handle(socket, ack, () => liveGames.startGame(roomCode, user.id));
    });

    socket.on("make-move", ({ roomCode, from, to, promotion }, ack) => {
      handle(socket, ack, () => liveGames.makeMove(roomCode, user.id, { from, to, promotion }));
    });

    socket.on("send-message", ({ roomCode, body }, ack) => {
      handle(socket, ack, () => liveGames.sendMessage(roomCode, user.id, body));
    });

    socket.on("call-meeting", ({ roomCode }, ack) => {
      handle(socket, ack, () => liveGames.callMeeting(roomCode, user.id));
    });

    socket.on("cast-vote", ({ roomCode, targetId }, ack) => {
      handle(socket, ack, () => liveGames.castVote(roomCode, user.id, targetId));
    });

    socket.on("reconnect-player", ({ roomCode }, ack) => {
      handle(socket, ack, () => {
        socket.join(roomCode.toUpperCase());
        return liveGames.snapshot(roomCode, user.id);
      });
    });

    socket.on("disconnect", () => {
      liveGames.detachSocket(socket.id);
    });
  });
}

function handle<T>(socket: GameSocket, ack: ((response: { ok: true; data: T } | { ok: false; error: string }) => void) | undefined, action: () => T | Promise<T>) {
  Promise.resolve()
    .then(action)
    .then((data) => ack?.({ ok: true, data }))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unexpected server error.";
      socket.emit("error-message", message);
      ack?.({ ok: false, error: message });
    });
}
