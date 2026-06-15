import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DEFAULT_ROOM_SETTINGS, type RoomSettings } from "@chess-impostor/shared";
import { Button } from "../components/Button";
import { Field, SelectField } from "../components/Field";
import { Panel } from "../components/Panel";
import { api } from "../lib/api";
import { useGameStore } from "../store/game";

export function CreateRoomPage() {
  const navigate = useNavigate();
  const setRoom = useGameStore((state) => state.setRoom);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const settings: RoomSettings = {
      roomName: String(form.get("roomName")),
      playerCount: Number(form.get("playerCount")) as RoomSettings["playerCount"],
      impostorCount: Number(form.get("impostorCount")) as RoomSettings["impostorCount"],
      botDifficulty: Number(form.get("botDifficulty")) as unknown as RoomSettings["botDifficulty"],
      meetingCooldown: Number(form.get("meetingCooldown")) as RoomSettings["meetingCooldown"],
      votingTimer: Number(form.get("votingTimer")) as RoomSettings["votingTimer"],
      discussionTimer: Number(form.get("discussionTimer")) as RoomSettings["discussionTimer"],
      turnTimer: Number(form.get("turnTimer")) as RoomSettings["turnTimer"],
      visibility: String(form.get("visibility")) as RoomSettings["visibility"]
    };
    try {
      const room = await api.createRoom(settings);
      setRoom(room);
      navigate(`/lobby/${room.roomCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create room.");
    }
  }

  return (
    <Panel title="Create Room">
      <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
        <Field label="Room Name" name="roomName" defaultValue={DEFAULT_ROOM_SETTINGS.roomName} required />
        <SelectField label="Player Count" name="playerCount" defaultValue={DEFAULT_ROOM_SETTINGS.playerCount}>
          {[4, 5, 6, 7, 8].map((count) => (
            <option key={count} value={count}>
              {count} Players
            </option>
          ))}
        </SelectField>
        <SelectField label="Impostor Count" name="impostorCount" defaultValue={DEFAULT_ROOM_SETTINGS.impostorCount}>
          {[1, 2, 3].map((count) => (
            <option key={count} value={count}>
              {count} Impostor{count > 1 ? "s" : ""}
            </option>
          ))}
        </SelectField>
        <SelectField label="Bot Difficulty" name="botDifficulty" defaultValue={DEFAULT_ROOM_SETTINGS.botDifficulty}>
          {[1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500, 2600, 2700].map((rating) => (
            <option key={rating} value={rating}>
              {rating} ELO
            </option>
          ))}
        </SelectField>
        <SelectField label="Meeting Cooldown" name="meetingCooldown" defaultValue={DEFAULT_ROOM_SETTINGS.meetingCooldown}>
          <option value="5">Every 5 White Moves</option>
          <option value="7">Every 7 White Moves</option>
          <option value="10">Every 10 White Moves</option>
        </SelectField>
        <SelectField label="Voting Timer" name="votingTimer" defaultValue={DEFAULT_ROOM_SETTINGS.votingTimer}>
          <option value="30">30 seconds</option>
          <option value="60">60 seconds</option>
          <option value="90">90 seconds</option>
        </SelectField>
        <SelectField label="Discussion Timer" name="discussionTimer" defaultValue={DEFAULT_ROOM_SETTINGS.discussionTimer}>
          <option value="30">30 seconds</option>
          <option value="60">60 seconds</option>
          <option value="120">120 seconds</option>
        </SelectField>
        <SelectField label="Turn Timer" name="turnTimer" defaultValue={DEFAULT_ROOM_SETTINGS.turnTimer}>
          <option value="30">30 seconds</option>
          <option value="60">60 seconds</option>
          <option value="90">90 seconds</option>
        </SelectField>
        <SelectField label="Visibility" name="visibility" defaultValue={DEFAULT_ROOM_SETTINGS.visibility}>
          <option value="PUBLIC">Public</option>
          <option value="PRIVATE">Private</option>
        </SelectField>
        {error && <p className="md:col-span-2 rounded-md border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
        <Button className="md:col-span-2">Generate Room Code</Button>
      </form>
    </Panel>
  );
}
