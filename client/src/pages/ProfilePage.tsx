import { FormEvent, useState } from "react";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { Panel } from "../components/Panel";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth";

export function ProfilePage() {
  const user = useAuthStore((state) => state.user)!;
  const setAuth = useAuthStore((state) => state.setAuth);
  const [error, setError] = useState<string | null>(null);
  const winRate = user.gamesPlayed ? Math.round((user.gamesWon / user.gamesPlayed) * 100) : 0;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      setAuth(
        await api.updateProfile({
          username: String(form.get("username")),
          avatar: String(form.get("avatar")) || null
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update profile.");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Panel title="Profile">
        <form onSubmit={onSubmit} className="grid gap-4">
          <Field label="Username" name="username" defaultValue={user.username} />
          <Field label="Avatar URL" name="avatar" defaultValue={user.avatar ?? ""} />
          {error && <p className="rounded-md border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
          <Button>Save Profile</Button>
        </form>
      </Panel>
      <Panel title="Stats">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ["Games Played", user.gamesPlayed],
            ["Games Won", user.gamesWon],
            ["Games Lost", user.gamesLost],
            ["Impostor Wins", user.impostorWins],
            ["Crewmate Wins", user.crewmateWins],
            ["Win Rate", `${winRate}%`]
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border border-white/10 bg-black/20 p-4">
              <p className="text-2xl font-black">{value}</p>
              <p className="text-sm text-zinc-400">{label}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
