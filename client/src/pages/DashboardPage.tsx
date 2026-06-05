import { Plus, Search, ShieldAlert, Swords, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Panel } from "../components/Panel";
import { useAuthStore } from "../store/auth";

export function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const winRate = user?.gamesPlayed ? Math.round((user.gamesWon / user.gamesPlayed) * 100) : 0;
  const stats: Array<[string, string | number, LucideIcon]> = [
    ["Games", user?.gamesPlayed ?? 0, Swords],
    ["Wins", user?.gamesWon ?? 0, ShieldAlert],
    ["Win Rate", `${winRate}%`, Users],
    ["Impostor Wins", user?.impostorWins ?? 0, ShieldAlert]
  ];

  return (
    <div className="grid gap-6">
      <section className="rounded-md border border-white/10 bg-black/30 p-6">
        <p className="text-sm uppercase tracking-[0.28em] text-neon">Social deduction chess</p>
        <h1 className="mt-2 max-w-3xl text-4xl font-black">Find the bad move before the board finds you.</h1>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/create" className="inline-flex items-center gap-2 rounded-md bg-neon px-4 py-2 text-sm font-bold">
            <Plus size={18} />
            Create Room
          </Link>
          <Link
            to="/join"
            className="inline-flex items-center gap-2 rounded-md border border-white/10 px-4 py-2 text-sm font-bold hover:bg-white/8"
          >
            <Search size={18} />
            Join Room
          </Link>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        {stats.map(([label, value, Icon]) => (
          <Panel key={String(label)}>
            <Icon className="mb-4 text-neon" size={22} />
            <p className="text-3xl font-black">{value}</p>
            <p className="text-sm text-zinc-400">{label}</p>
          </Panel>
        ))}
      </div>
    </div>
  );
}
