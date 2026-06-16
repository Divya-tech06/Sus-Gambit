  import http from "node:http";
  import cors from "cors";
  import express from "express";
  import helmet from "helmet";
  import rateLimit from "express-rate-limit";
  import { Server } from "socket.io";
  import type { ClientToServerEvents, ServerToClientEvents } from "@chess-impostor/shared";
  import { env } from "./env.js";
  import { authRouter } from "./routes/auth.js";
  import { roomsRouter } from "./routes/rooms.js";
  import { createLiveGameService, registerSockets } from "./socket.js";

  const app = express();
  app.set("trust proxy", 1);
  const server = http.createServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
    cors: {
      origin: env.clientOrigin,
      credentials: true
    },
    // Prefer WebSocket, fall back to polling.
    // Ensure your reverse proxy forwards the Upgrade header.
    transports: ["websocket", "polling"]
  });

  // ── Security headers (SEC-4) ──────────────────────────────────────────────────
  app.use(
    helmet({
      // crossOriginResourcePolicy must be relaxed for cross-origin API calls
      crossOriginResourcePolicy: { policy: "cross-origin" }
    })
  );

  // ── CORS (DOMAIN-4: array origins) ───────────────────────────────────────────
  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(express.json());

  // ── Rate limiting (SEC-3) ─────────────────────────────────────────────────────
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,                   // 20 requests per window per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." }
  });

  const globalLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." }
  });

  // Apply global limiter to all routes
  app.use(globalLimiter);

  // Apply stricter limiter to auth endpoints
  app.use("/auth/login", authLimiter);
  app.use("/auth/signup", authLimiter);
  app.use("/auth/refresh", authLimiter);

  // ── Routes ────────────────────────────────────────────────────────────────────
  const liveGames = createLiveGameService(io);

  app.get("/health", (_req, res) => {
    res.json({ ok: true, name: "Chess Impostor API" });
  });

  app.use("/auth", authRouter);
  app.use("/rooms", roomsRouter(liveGames));

  registerSockets(io, liveGames);

  // ── Start ─────────────────────────────────────────────────────────────────────
  server.listen(env.port, () => {
    // DOMAIN-5: don't log localhost — show the actual port
    console.log(`Chess Impostor API listening on port ${env.port}`);
  });
