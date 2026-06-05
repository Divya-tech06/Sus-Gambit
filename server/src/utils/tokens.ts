import jwt from "jsonwebtoken";
import type { PublicUser } from "@chess-impostor/shared";
import { env } from "../env.js";

export interface TokenUser extends PublicUser {
  email: string;
}

export function signAccessToken(user: TokenUser): string {
  return jwt.sign({ sub: user.id, username: user.username, email: user.email }, env.accessSecret, {
    expiresIn: "15m"
  });
}

export function signRefreshToken(user: TokenUser, rememberMe: boolean): string {
  return jwt.sign({ sub: user.id }, env.refreshSecret, {
    expiresIn: rememberMe ? "30d" : "7d"
  });
}

export function verifyAccessToken(token: string): { sub: string; username: string; email: string } {
  return jwt.verify(token, env.accessSecret) as { sub: string; username: string; email: string };
}

export function verifyRefreshToken(token: string): { sub: string; exp: number } {
  return jwt.verify(token, env.refreshSecret) as { sub: string; exp: number };
}
