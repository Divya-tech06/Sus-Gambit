import { useMemo, useState } from "react";
import { Chessboard } from "react-chessboard";
import { MessageSquare, PhoneCall, Send, Skull, Timer, Vote } from "lucide-react";
import { useParams } from "react-router-dom";
import { Button } from "../components/Button";
import { Panel } from "../components/Panel";
import { getSocket } from "../lib/socket";
import { useAuthStore } from "../store/auth";
import { useGameStore } from "../store/game";
import { useRoomSocket } from "../hooks/useRoomSocket";

export function GamePage() {
  const { roomCode } = useParams();
  const token = useAuthStore((state) => state.accessToken)!;
  const user = useAuthStore((state) => state.user)!;
  const game = useGameStore((state) => state.game);
  const role = useGameStore((state) => state.role);
  const error = useGameStore((state) => state.error);
  const [chatBody, setChatBody] = useState("");
  useRoomSocket(roomCode);

  const socket = getSocket(token);
  const me = game?.players.find((player) => player.id === user.id);
  const canMove = Boolean(me?.alive && game?.currentPlayerId === user.id && game.meeting.phase === "NONE");
  const roleClass = role === "IMPOSTOR" ? "border-ember/60 bg-ember/10 text-rose-100" : "border-emerald-400/50 bg-emerald-400/10 text-emerald-100";

  const moveRows = useMemo(() => [...(game?.moveHistory ?? [])].reverse().slice(0, 18), [game?.moveHistory]);

  if (!game) {
    return <Panel title="Loading Game">Syncing board state...</Panel>;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[260px_minmax(320px,1fr)_340px]">
      <Panel title="Players">
        <div className={`role-flash mb-4 rounded-md border px-3 py-2 text-sm font-bold ${roleClass}`}>
          {role ? `You are ${role}` : "Role pending"}
        </div>
        <div className="grid gap-2">
          {game.players.map((player) => (
            <div
              key={player.id}
              className={`rounded-md border p-3 ${
                player.isCurrentTurn ? "border-neon bg-neon/12" : "border-white/10 bg-black/20"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{player.username}</span>
                {player.alive ? (
                  <span className="text-xs text-emerald-300">Alive</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                    <Skull size={14} />
                    Dead
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500">{player.movesPlayed} moves</p>
            </div>
          ))}
        </div>
      </Panel>

      <section className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/10 bg-panel/82 p-4">
          <div>
            <h1 className="text-xl font-black">{game.roomName}</h1>
            <p className="text-sm text-zinc-400">
              Room {game.roomCode} · Meeting in {game.meeting.movesUntilAvailable} White moves
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-zinc-300">
            <Timer size={17} className="text-neon" />
            30s move timer
          </div>
        </div>

        {error && <p className="rounded-md border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-rose-200">{error}</p>}

        <div className="mx-auto w-full max-w-[680px]">
          <Chessboard
            position={game.fen}
            arePiecesDraggable={canMove}
            boardWidth={Math.min(680, Math.max(320, window.innerWidth - 48))}
            customDarkSquareStyle={{ backgroundColor: "#4a4264" }}
            customLightSquareStyle={{ backgroundColor: "#d9d2f4" }}
            onPieceDrop={(from, to) => {
              if (!canMove) return false;
              socket.emit("make-move", { roomCode: roomCode!, from, to }, (response) => {
                if (!response.ok) return;
              });
              return true;
            }}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Button
            disabled={!game.meeting.available || !me?.alive}
            onClick={() => socket.emit("call-meeting", { roomCode: roomCode! })}
          >
            <span className="inline-flex items-center gap-2">
              <PhoneCall size={17} />
              Call Meeting
            </span>
          </Button>
          <div className="rounded-md border border-white/10 bg-black/20 px-4 py-2 text-sm text-zinc-300">
            Meeting phase: <span className="font-bold text-white">{game.meeting.phase}</span>
          </div>
        </div>

        {game.meeting.phase === "VOTING" && (
          <Panel title="Cast Vote">
            <div className="flex flex-wrap gap-2">
              {game.players
                .filter((player) => player.alive && player.id !== user.id)
                .map((player) => (
                  <button
                    key={player.id}
                    className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm hover:border-neon"
                    onClick={() => socket.emit("cast-vote", { roomCode: roomCode!, targetId: player.id })}
                  >
                    <Vote size={16} />
                    {player.username}
                  </button>
                ))}
              <button
                className="rounded-md border border-white/10 px-3 py-2 text-sm hover:border-neon"
                onClick={() => socket.emit("cast-vote", { roomCode: roomCode!, targetId: "SKIP" })}
              >
                Skip Vote
              </button>
            </div>
          </Panel>
        )}

        {game.status === "FINISHED" && (
          <Panel title={game.winner === "CREWMATES" ? "Crewmates Win" : "Impostor Wins"}>
            <p className="text-zinc-300">
              Impostor: <span className="font-bold text-neon">{game.players.find((player) => player.id === game.impostorId)?.username}</span>
            </p>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              <Button onClick={() => window.location.assign("/create")}>Play Again</Button>
              <button className="rounded-md border border-white/10 px-4 py-2 text-sm font-bold hover:bg-white/8" onClick={() => window.location.assign("/")}>
                Return Home
              </button>
            </div>
          </Panel>
        )}
      </section>

      <div className="grid gap-4">
        <Panel title="Chat" action={<MessageSquare size={18} className="text-neon" />}>
          <div className="thin-scrollbar mb-3 h-64 overflow-auto rounded-md border border-white/10 bg-black/20 p-3">
            {game.chat.map((message) => (
              <p key={message.id} className="mb-2 text-sm">
                <span className="font-bold text-neon">{message.username}: </span>
                <span className="text-zinc-200">{message.body}</span>
              </p>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              socket.emit("send-message", { roomCode: roomCode!, body: chatBody });
              setChatBody("");
            }}
          >
            <input
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-neon"
              value={chatBody}
              onChange={(event) => setChatBody(event.target.value)}
              disabled={!me?.alive}
              placeholder={me?.alive ? "Make your case..." : "Spectating"}
            />
            <button className="grid h-10 w-10 place-items-center rounded-md bg-neon" disabled={!me?.alive}>
              <Send size={16} />
            </button>
          </form>
        </Panel>

        <Panel title="Move History">
          <div className="thin-scrollbar max-h-72 overflow-auto text-sm">
            {moveRows.map((move, index) => (
              <div key={`${move.createdAt}-${index}`} className="flex justify-between border-b border-white/5 py-2">
                <span className={move.by === "WHITE" ? "text-zinc-100" : "text-zinc-400"}>{move.by}</span>
                <span className="font-mono">{move.san}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
