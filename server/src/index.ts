import http from "node:http";
import cors from "cors";
import express from "express";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@chess-impostor/shared";
import { env } from "./env.js";
import { authRouter } from "./routes/auth.js";
import { roomsRouter } from "./routes/rooms.js";
import { createLiveGameService, registerSockets } from "./socket.js";

const app = express();
const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: env.clientOrigin,
    credentials: true
  }
});

app.use(cors({ origin: env.clientOrigin, credentials: true }));
app.use(express.json());

const liveGames = createLiveGameService(io);

app.get("/health", (_req, res) => {
  res.json({ ok: true, name: "Chess Impostor API" });
});

app.use("/auth", authRouter);
app.use("/rooms", roomsRouter(liveGames));

registerSockets(io, liveGames);

server.listen(env.port, () => {
  console.log(`Chess Impostor API listening on http://localhost:${env.port}`);
});
