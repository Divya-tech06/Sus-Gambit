import "dotenv/config";

export const env = {
  port: Number(process.env.PORT ?? 4000),
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  accessSecret: process.env.JWT_ACCESS_SECRET ?? "dev-access-secret",
  refreshSecret: process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret",
  isProduction: process.env.NODE_ENV === "production"
};
