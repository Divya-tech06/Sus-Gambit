import { Router } from "express";
import bcrypt from "bcryptjs";
import type { GameResult, Role } from "@prisma/client";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/tokens.js";
import { loginSchema, profileSchema, signupSchema } from "../validators.js";

export const authRouter = Router();

async function authPayload(userId: string, rememberMe = false) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      email: true,
      avatar: true,
      playerStats: { select: { result: true, role: true } }
    }
  });

  const publicUser = { id: user.id, username: user.username, email: user.email, avatar: user.avatar };
  const accessToken = signAccessToken(publicUser);
  const refreshToken = signRefreshToken(publicUser, rememberMe);
  const decoded = verifyRefreshToken(refreshToken);

  await prisma.refreshToken.create({
    data: {
      tokenHash: await bcrypt.hash(refreshToken, 12),
      userId: user.id,
      expiresAt: new Date(decoded.exp * 1000)
    }
  });

  const stats = user.playerStats as Array<{ result: GameResult; role: Role }>;
  const wins = stats.filter((stat) => stat.result === "WON");
  return {
    accessToken,
    refreshToken,
    user: {
      ...publicUser,
      gamesPlayed: stats.length,
      gamesWon: wins.length,
      gamesLost: stats.length - wins.length,
      impostorWins: wins.filter((stat) => stat.role === "IMPOSTOR").length,
      crewmateWins: wins.filter((stat) => stat.role === "CREWMATE").length
    }
  };
}

authRouter.post("/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid signup data." });
    return;
  }

  const { username, email, password } = parsed.data;
  const existing = await prisma.user.findFirst({ where: { OR: [{ username }, { email }] } });
  if (existing?.username === username) {
    res.status(409).json({ error: "Username is already taken." });
    return;
  }
  if (existing?.email === email) {
    res.status(409).json({ error: "Email is already registered." });
    return;
  }

  const user = await prisma.user.create({
    data: { username, email, passwordHash: await hashPassword(password) }
  });
  res.status(201).json(await authPayload(user.id, true));
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid login data." });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  res.json(await authPayload(user.id, parsed.data.rememberMe));
});

authRouter.post("/refresh", async (req, res) => {
  const refreshToken = String(req.body.refreshToken ?? "");
  try {
    const decoded = verifyRefreshToken(refreshToken);
    const tokens = await prisma.refreshToken.findMany({ where: { userId: decoded.sub } });
    const match = await Promise.all(
      (tokens as Array<{ tokenHash: string }>).map((token) => bcrypt.compare(refreshToken, token.tokenHash))
    );
    if (!match.some(Boolean)) {
      res.status(401).json({ error: "Refresh token not recognized." });
      return;
    }

    res.json(await authPayload(decoded.sub, true));
  } catch {
    res.status(401).json({ error: "Invalid refresh token." });
  }
});

authRouter.get("/me", requireAuth, async (req, res) => {
  res.json(await authPayload(req.user!.id, true));
});

authRouter.patch("/profile", requireAuth, async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid profile data." });
    return;
  }

  await prisma.user.update({ where: { id: req.user!.id }, data: parsed.data });
  res.json(await authPayload(req.user!.id, true));
});
