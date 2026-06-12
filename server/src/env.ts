import "dotenv/config";

/** Throw if a required env var is missing in production */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[env] Missing required environment variable: ${name}. ` +
        `Check your .env file or deployment configuration.`
    );
  }
  return value;
}

const isProduction = process.env.NODE_ENV === "production";

// ── JWT secrets ──────────────────────────────────────────────────────────────
// In production these MUST be explicitly set to strong random values.
// Startup is aborted (process.exit) if the weak dev defaults are detected.
const DEV_ACCESS = "dev-access-secret";
const DEV_REFRESH = "dev-refresh-secret";

const accessSecret = isProduction
  ? required("JWT_ACCESS_SECRET")
  : (process.env.JWT_ACCESS_SECRET ?? DEV_ACCESS);

const refreshSecret = isProduction
  ? required("JWT_REFRESH_SECRET")
  : (process.env.JWT_REFRESH_SECRET ?? DEV_REFRESH);

if (isProduction && (accessSecret === DEV_ACCESS || refreshSecret === DEV_REFRESH)) {
  // Fail loudly — do not start with insecure defaults
  console.error("[env] FATAL: JWT secrets must not be the default dev values in production.");
  process.exit(1);
}

// ── CORS origins ─────────────────────────────────────────────────────────────
// Accept a single URL or a comma-separated list (e.g. for www + apex domains).
const rawOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
const clientOrigin: string | string[] = rawOrigin.includes(",")
  ? rawOrigin.split(",").map((o) => o.trim())
  : rawOrigin.trim();

export const env = {
  port: Number(process.env.PORT ?? 4000),
  clientOrigin,
  accessSecret,
  refreshSecret,
  isProduction,
};
