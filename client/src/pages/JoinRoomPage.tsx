import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { RoomSnapshot } from "@chess-impostor/shared";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { Panel } from "../components/Panel";
import { api } from "../lib/api";

export function JoinRoomPage() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<RoomSnapshot[]>([]);

  useEffect(() => {
    api.publicRooms().then(setRooms).catch(() => setRooms([]));
  }, []);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    navigate(`/lobby/${String(form.get("roomCode")).trim().toUpperCase()}`);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      <Panel title="Enter Room Code">
        <form onSubmit={onSubmit} className="grid gap-4">
          <Field label="Room Code" name="roomCode" placeholder="ABC123" required />
          <Button>Join Room</Button>
        </form>
      </Panel>
      <Panel title="Public Rooms">
        <div className="grid gap-3">
          {rooms.length === 0 && <p className="text-sm text-zinc-400">No public rooms are waiting right now.</p>}
          {rooms.map((room) => (
            <button
              key={room.roomCode}
              onClick={() => navigate(`/lobby/${room.roomCode}`)}
              className="grid rounded-md border border-white/10 bg-black/20 p-4 text-left hover:border-neon/70 md:grid-cols-[1fr_auto]"
            >
              <span>
                <strong>{room.settings.roomName}</strong>
                <span className="block text-sm text-zinc-400">{room.roomCode}</span>
              </span>
              <span className="text-sm text-zinc-300">
                {room.players.length}/{room.settings.playerCount} players
              </span>
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}
