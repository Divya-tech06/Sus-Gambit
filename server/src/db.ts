import { PrismaClient } from "@prisma/client";

// DB-4: Configure connection pool.
// The DATABASE_URL can also carry connection_limit as a query param:
//   postgresql://user:pass@host/db?connection_limit=20
// PrismaClient's default pool size is 10. Explicit config here for clarity.
export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});
