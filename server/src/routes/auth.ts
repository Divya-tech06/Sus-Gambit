import { Router } from "express";
import bcrypt from "bcryptjs";
import type { GameResult, Role } from "@prisma/client";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/tokens.js";
import { loginSchema, profileSchema, signupSchema } from "../validators.js";

export const authRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build user data with lifetime stats. No tokens created. */
async function userPayload(userId: string) {
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

  const stats = user.playerStats as Array<{ result: GameResult; role: Role }>;
  const wins = stats.filter((s) => s.result === "WON");
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    gamesPlayed: stats.length,
    gamesWon: wins.length,
    gamesLost: stats.length - wins.length,
    impostorWins: wins.filter((s) => s.role === "IMPOSTOR").length,
    crewmateWins: wins.filter((s) => s.role === "CREWMATE").length
  };
}

/**
 * Issue a brand-new access + refresh token pair and persist the refresh token.
 * Only called from login, signup, and the refresh endpoint.
 * Prunes expired tokens for the user as a side-effect.
 */
async function createTokenPair(userId: string, rememberMe = false) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, username: true, email: true, avatar: true }
  });

  const publicUser = {
    id: user.id,
    username: user.username,
    email: user.email,
    avatar: user.avatar
  };

  const accessToken = signAccessToken(publicUser);
  const refreshToken = signRefreshToken(publicUser, rememberMe);
  const decoded = verifyRefreshToken(refreshToken);

  // Persist the new refresh token with its jti for O(1) future lookups
  await prisma.refreshToken.create({
    data: {
      jti: decoded.jti,
      tokenHash: await bcrypt.hash(refreshToken, 12),
      userId: user.id,
      expiresAt: new Date(decoded.exp * 1000)
    }
  });

  // Non-critical housekeeping: delete expired tokens for this user
  prisma.refreshToken
    .deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date() } } })
    .catch(() => { /* silent — housekeeping is not critical */ });

  const userData = await userPayload(userId);
  return { accessToken, refreshToken, user: userData };
}

// ── Routes ────────────────────────────────────────────────────────────────────

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
  res.status(201).json(await createTokenPair(user.id, true));
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

  res.json(await createTokenPair(user.id, parsed.data.rememberMe));
});

authRouter.post("/refresh", async (req, res) => {
  const refreshToken = String(req.body.refreshToken ?? "");
  try {
    const decoded = verifyRefreshToken(refreshToken);

    let matched = false;

    if (decoded.jti) {
      // ── Fast path (new tokens): O(1) lookup by jti ──────────────────────
      const record = await prisma.refreshToken.findUnique({
        where: { jti: decoded.jti }
      });
      if (record && record.userId === decoded.sub && record.expiresAt > new Date()) {
        matched = await bcrypt.compare(refreshToken, record.tokenHash);
      }
    } else {
      // ── Legacy path (tokens without jti): bounded scan ──────────────────
      // Cap at 20 to prevent DoS. Old tokens will expire naturally.
      const records = await prisma.refreshToken.findMany({
        where: { userId: decoded.sub, expiresAt: { gt: new Date() }, jti: null },
        take: 20
      });
      const comparisons = await Promise.all(
        records.map((r) => bcrypt.compare(refreshToken, r.tokenHash))
      );
      matched = comparisons.some(Boolean);
    }

    if (!matched) {
      res.status(401).json({ error: "Refresh token not recognized." });
      return;
    }

    res.json(await createTokenPair(decoded.sub, true));
  } catch {
    res.status(401).json({ error: "Invalid refresh token." });
  }
});

/**
 * GET /auth/me — returns the current user + a fresh access token.
 * Does NOT create a new refresh token (DB-5 fix).
 * The client should preserve its existing refresh token.
 */
authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await userPayload(req.user!.id);
  const accessToken = signAccessToken({
    id: user.id,
    username: user.username,
    email: user.email,
    avatar: user.avatar
  });
  // refreshToken is empty string so the client preserves its existing one
  res.json({ accessToken, refreshToken: "", user });
});

/**
 * PATCH /auth/profile — updates profile, returns fresh access token.
 * Does NOT create a new refresh token (DB-5 fix).
 */
authRouter.patch("/profile", requireAuth, async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid profile data." });
    return;
  }

  await prisma.user.update({ where: { id: req.user!.id }, data: parsed.data });
  const user = await userPayload(req.user!.id);
  const accessToken = signAccessToken({
    id: user.id,
    username: user.username,
    email: user.email,
    avatar: user.avatar
  });
  res.json({ accessToken, refreshToken: "", user });
});
