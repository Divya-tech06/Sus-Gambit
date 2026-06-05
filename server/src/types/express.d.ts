import type { PublicUser } from "@chess-impostor/shared";

declare global {
  namespace Express {
    interface Request {
      user?: PublicUser & { email: string };
    }
  }
}
