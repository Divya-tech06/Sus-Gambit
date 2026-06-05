import { Panel } from "../components/Panel";

export function SettingsPage() {
  return (
    <Panel title="Settings">
      <div className="grid gap-4 text-sm text-zinc-300">
        <label className="flex items-center justify-between rounded-md border border-white/10 bg-black/20 p-4">
          Dark mode
          <input type="checkbox" checked readOnly className="accent-neon" />
        </label>
        <label className="flex items-center justify-between rounded-md border border-white/10 bg-black/20 p-4">
          Streamer-friendly compact game UI
          <input type="checkbox" checked readOnly className="accent-neon" />
        </label>
      </div>
    </Panel>
  );
}
