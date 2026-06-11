import { Crown, Play, UserX } from "lucide-react";
import { useParams } from "react-router-dom";
import { Button } from "../components/Button";
import { Panel } from "../components/Panel";
import { getSocket } from "../lib/socket";
import { useAuthStore } from "../store/auth";
import { useGameStore } from "../store/game";
import { useRoomSocket } from "../hooks/useRoomSocket";

export function LobbyPage() {
  const { roomCode } = useParams();
  const token = useAuthStore((state) => state.accessToken)!;
  const user = useAuthStore((state) => state.user)!;
  const room = useGameStore((state) => state.room);
  const error = useGameStore((state) => state.error);
  useRoomSocket(roomCode);

  const socket = getSocket(token);
  const me = room?.players.find((player) => player.id === user.id);
  const isHost = room?.hostId === user.id;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <Panel title={room?.settings.roomName ?? "Lobby"}>
        <div className="mb-5 flex flex-wrap items-center gap-3 text-sm text-zinc-300">
          <span className="rounded-md border border-white/10 px-3 py-1 font-mono text-neon">{roomCode}</span>
          <span>{room?.settings.botDifficulty ?? 1500} ELO bot</span>
          <span>{room?.settings.meetingCooldown ?? 5} move meeting cooldown</span>
        </div>
        {error && <p className="mb-4 rounded-md border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
        <div className="grid gap-3">
          {room?.players.map((player) => (
            <div key={player.id} className="flex items-center justify-between rounded-md border border-white/10 bg-black/20 p-3">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-md bg-steel font-bold">
                  {player.username.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold">{player.username}</p>
                  <p className="text-xs text-zinc-500">{player.connected ? "Connected" : "Disconnected"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                {player.isHost && <Crown size={18} className="text-neon" />}
                <span className={player.ready ? "text-emerald-300" : "text-zinc-500"}>{player.ready ? "Ready" : "Waiting"}</span>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Controls">
        <div className="grid gap-3">
          <Button
            onClick={() => socket.emit("player-ready", { roomCode: roomCode!, ready: !me?.ready })}
            className={me?.ready ? "bg-steel hover:bg-zinc-700" : ""}
          >
            {me?.ready ? "Unready" : "Ready"}
          </Button>
          <Button
            disabled={!isHost || !room || room.players.length < room.settings.playerCount}
            onClick={() => socket.emit("start-game", { roomCode: roomCode! })}
          >
            <span className="inline-flex items-center gap-2">
              <Play size={17} />
              Start Game
            </span>
          </Button>
          <button className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/8">
            <UserX size={17} />
            Kick tools unlock for host
          </button>
        </div>
      </Panel>
    </div>
  );
}
