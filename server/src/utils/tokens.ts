import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";
import type { PublicUser } from "@chess-impostor/shared";
import { env } from "../env.js";

export interface TokenUser extends PublicUser {
  email: string;
}

// ── Access token ─────────────────────────────────────────────────────────────
// Only encodes the user's ID (sub). Email and username are NOT embedded in
// the token — they are not needed for authorization decisions and their
// inclusion is an unnecessary data exposure risk.
export function signAccessToken(user: TokenUser): string {
  return jwt.sign({ sub: user.id }, env.accessSecret, {
    expiresIn: "15m",
  });
}

// ── Refresh token ─────────────────────────────────────────────────────────────
// Includes a `jti` (JWT ID) — a unique random ID that is also stored in the
// RefreshToken DB row. This allows O(1) lookup by jti on refresh instead of
// scanning all tokens for the user.
export function signRefreshToken(user: TokenUser, rememberMe: boolean): string {
  const jti = nanoid();
  return jwt.sign({ sub: user.id, jti }, env.refreshSecret, {
    expiresIn: rememberMe ? "30d" : "7d",
  });
}

export function verifyAccessToken(token: string): { sub: string } {
  return jwt.verify(token, env.accessSecret) as { sub: string };
}

export function verifyRefreshToken(token: string): {
  sub: string;
  jti?: string;
  exp: number;
} {
  return jwt.verify(token, env.refreshSecret) as {
    sub: string;
    jti?: string;
    exp: number;
  };
}
