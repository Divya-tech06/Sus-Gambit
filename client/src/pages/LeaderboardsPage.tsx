import { Panel } from "../components/Panel";

export function LeaderboardsPage() {
  return (
    <Panel title="Leaderboards">
      <div className="grid gap-3 text-sm text-zinc-300">
        <p>Leaderboard aggregation is reserved for Phase 2, after game statistics have enough match history to rank.</p>
        <div className="rounded-md border border-white/10 bg-black/20 p-4">
          Track planned: win rate, crewmate wins, impostor wins, accuracy, and vote survival.
        </div>
      </div>
    </Panel>
  );
}
