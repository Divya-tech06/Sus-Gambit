import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth";

export function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      const payload =
        mode === "signup"
          ? await api.signup({
              username: String(form.get("username")),
              email: String(form.get("email")),
              password: String(form.get("password")),
              confirmPassword: String(form.get("confirmPassword"))
            })
          : await api.login({
              email: String(form.get("email")),
              password: String(form.get("password")),
              rememberMe: form.get("rememberMe") === "on"
            });
      setAuth(payload);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-md border border-white/10 bg-panel/90 p-6 shadow-glow">
        <p className="text-xs uppercase tracking-[0.32em] text-neon">Chess Impostor</p>
        <h1 className="mt-2 text-3xl font-black">{mode === "signup" ? "Create account" : "Welcome back"}</h1>
        <div className="mt-6 grid gap-4">
          {mode === "signup" && <Field label="Username" name="username" autoComplete="username" required />}
          <Field label="Email" name="email" type="email" autoComplete="email" required />
          <Field label="Password" name="password" type="password" autoComplete="current-password" required />
          {mode === "signup" && (
            <Field label="Confirm Password" name="confirmPassword" type="password" autoComplete="new-password" required />
          )}
          {mode === "login" && (
            <div className="flex items-center justify-between text-sm text-zinc-300">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="rememberMe" className="accent-neon" />
                Remember me
              </label>
              <button type="button" className="text-neon hover:text-white">
                Forgot password
              </button>
            </div>
          )}
          {error && <p className="rounded-md border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
          <Button disabled={loading}>{loading ? "Working..." : mode === "signup" ? "Sign up" : "Log in"}</Button>
        </div>
        <p className="mt-5 text-sm text-zinc-400">
          {mode === "signup" ? "Already have an account?" : "New to the table?"}{" "}
          <Link className="text-neon hover:text-white" to={mode === "signup" ? "/login" : "/signup"}>
            {mode === "signup" ? "Log in" : "Sign up"}
          </Link>
        </p>
      </form>
    </main>
  );
}
