import { Crown, LogOut, Play, UserCheck, Trash2 } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Panel } from "../components/Panel";
import { getSocket } from "../lib/socket";
import { useAuthStore } from "../store/auth";
import { useGameStore } from "../store/game";
import { useRoomSocket } from "../hooks/useRoomSocket";

export function LobbyPage() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.accessToken)!;
  const user = useAuthStore((state) => state.user)!;
  const room = useGameStore((state) => state.room);
  const setRoom = useGameStore((state) => state.setRoom);
  const error = useGameStore((state) => state.error);
  useRoomSocket(roomCode);

  const socket = getSocket(token);
  const me = room?.players.find((p) => p.id === user.id);
  const isHost = room?.hostId === user.id;

  function handleLeave() {
    socket.emit("leave-room", { roomCode: roomCode! }, () => {
      setRoom(null);
      navigate("/", { replace: true });
    });
  }

  function handleDisband() {
    socket.emit("disband-room", { roomCode: roomCode! }, (res) => {
      console.log("[Lobby] disband-room response:", res);
      if (res?.ok) {
        setRoom(null);
        navigate("/", { replace: true });
      } else {
        console.error("[Lobby] Failed to disband room:", res?.error);
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="order-2 lg:order-1">
        <Panel title={room?.settings.roomName ?? "Lobby"}>
          <div className="mb-5 flex flex-wrap items-center gap-3 text-sm text-zinc-300">
            <span className="rounded-md border border-white/10 px-3 py-1 font-mono text-neon">{roomCode}</span>
            <span>{room?.settings.impostorCount ?? 1} impostor{room?.settings.impostorCount && room.settings.impostorCount > 1 ? "s" : ""}</span>
            <span>{room?.settings.botDifficulty ?? 1500} ELO bot</span>
            <span>{room?.settings.meetingCooldown ?? 5} move cooldown</span>
            <span>{room?.settings.turnTimer ?? 30}s turn timer</span>
          </div>
          {error && <p className="mb-4 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
          <div className="grid gap-3">
            {room?.players.map((player) => (
              <div
                key={player.id}
                className={`flex items-center justify-between rounded-md border p-3 transition-colors ${
                  player.isHost ? "border-neon/30 bg-neon/5" : "border-white/10 bg-black/20"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-md bg-steel font-bold text-sm shrink-0">
                    {player.username.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold flex items-center gap-2">
                      {player.username}
                      {player.isHost && <Crown size={14} className="text-neon" />}
                    </p>
                    <p className="text-xs text-zinc-500">{player.connected ? "Connected" : "Disconnected"}</p>
                  </div>
                </div>
                <span className={`text-sm font-medium ${player.ready ? "text-emerald-300" : "text-zinc-500"}`}>
                  {player.isHost ? "Host" : player.ready ? "Ready" : "Waiting"}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="order-1 lg:order-2">
        <Panel title="Controls">
          <div className="grid gap-3">
            {/* Ready / Unready (non-host) */}
            {!isHost && (
              <Button
                onClick={() => socket.emit("player-ready", { roomCode: roomCode!, ready: !me?.ready })}
                className={me?.ready ? "bg-steel hover:bg-zinc-700" : ""}
              >
                <span className="inline-flex items-center gap-2">
                  <UserCheck size={17} />
                  {me?.ready ? "Unready" : "Ready Up"}
                </span>
              </Button>
            )}

            {/* Start game (host only) */}
            <Button
              disabled={
                !isHost ||
                !room ||
                room.players.length < room.settings.playerCount ||
                !room.players.every((p) => p.ready || p.isHost)
              }
              onClick={() => socket.emit("start-game", { roomCode: roomCode! })}
            >
              <span className="inline-flex items-center gap-2">
                <Play size={17} />
                Start Game
                {isHost && room && room.players.length < room.settings.playerCount && (
                  <span className="text-xs opacity-60">
                    ({room.players.length}/{room.settings.playerCount})
                  </span>
                )}
              </span>
            </Button>

            <hr className="border-white/10" />

            {/* Leave lobby */}
            <button
              className="inline-flex items-center justify-center gap-2 rounded-md border border-rose-700/50 bg-rose-900/10 px-4 py-2 text-sm text-rose-300 hover:bg-rose-900/30 transition-colors"
              onClick={handleLeave}
            >
              <LogOut size={17} />
              Leave Lobby
            </button>

            {/* Remove Room (host only) */}
            {isHost && (
              <button
                className="inline-flex items-center justify-center gap-2 rounded-md border border-red-700/50 bg-red-950/20 px-4 py-2 text-sm text-red-300 hover:bg-red-950/40 transition-colors font-semibold"
                onClick={handleDisband}
              >
                <Trash2 size={17} />
                Remove Room
              </button>
            )}
          </div>

          {/* Waiting status */}
          {isHost && room && room.players.length < room.settings.playerCount && (
            <p className="mt-4 text-xs text-zinc-500">
              Waiting for {room.settings.playerCount - room.players.length} more player(s)...
            </p>
          )}
          {!isHost && !me?.ready && (
            <p className="mt-4 text-xs text-amber-400/80">Mark yourself ready to let the host start.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
