import { Router } from "express";
import type { LiveGameService } from "../game/liveGame.js";
import { requireAuth } from "../middleware/auth.js";
import { createRoomSchema } from "../validators.js";

export function roomsRouter(liveGames: LiveGameService) {
  const router = Router();

  router.get("/public", requireAuth, async (_req, res) => {
    res.json(await liveGames.publicRooms());
  });

  router.post("/", requireAuth, async (req, res) => {
    const parsed = createRoomSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid room settings." });
      return;
    }

    const room = await liveGames.createRoom(req.user!, parsed.data);
    res.status(201).json(room);
  });

  return router;
}
