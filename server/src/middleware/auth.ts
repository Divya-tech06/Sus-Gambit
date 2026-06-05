import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db.js";
import { verifyAccessToken } from "../utils/tokens.js";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

  if (!token) {
    res.status(401).json({ error: "Missing bearer token." });
    return;
  }

  try {
    const decoded = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, username: true, email: true, avatar: true }
    });

    if (!user) {
      res.status(401).json({ error: "User not found." });
      return;
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token." });
  }
}
