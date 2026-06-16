import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { MessageSquare, PhoneCall, Send, Skull, Timer, Vote, LogOut, X } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Panel } from "../components/Panel";
import { getSocket } from "../lib/socket";
import { useAuthStore } from "../store/auth";
import { useGameStore } from "../store/game";
import { useRoomSocket } from "../hooks/useRoomSocket";

// ─── Timer hook ───────────────────────────────────────────────────────────────
function useCountdown(endsAt: string | null) {
  const [remaining, setRemaining] = useState<number>(0);

  useEffect(() => {
    if (!endsAt) { setRemaining(0); return; }
    const tick = () => {
      const diff = Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 1000));
      setRemaining(diff);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [endsAt]);

  return remaining;
}

// ─── Leave Confirmation Modal ──────────────────────────────────────────────────
function LeaveModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#1a1a2e] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black text-rose-400">Leave Game?</h2>
          <button onClick={onCancel} className="rounded-md p-1 hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        {step === 1 ? (
          <>
            <p className="mb-1 text-sm text-zinc-300">
              Are you sure you want to leave the game?
            </p>
            <p className="mb-5 text-xs text-amber-400">
              ⚠️ If you are the Impostor, Crewmates win instantly. If you are a Crewmate, you are eliminated.
            </p>
            <div className="flex gap-3">
              <button
                className="flex-1 rounded-md border border-white/10 px-4 py-2 text-sm hover:bg-white/8"
                onClick={onCancel}
              >
                Stay
              </button>
              <button
                className="flex-1 rounded-md bg-rose-600 px-4 py-2 text-sm font-bold hover:bg-rose-500"
                onClick={() => setStep(2)}
              >
                Leave
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mb-5 text-sm text-rose-300 font-semibold">
              Click "Confirm Leave" to permanently exit this game. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                className="flex-1 rounded-md border border-white/10 px-4 py-2 text-sm hover:bg-white/8"
                onClick={onCancel}
              >
                Cancel
              </button>
              <button
                className="flex-1 rounded-md bg-rose-700 px-4 py-2 text-sm font-black hover:bg-rose-600"
                onClick={onConfirm}
              >
                Confirm Leave
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export function GamePage() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.accessToken)!;
  const user = useAuthStore((state) => state.user)!;
  const game = useGameStore((state) => state.game);
  const role = useGameStore((state) => state.role);
  const error = useGameStore((state) => state.error);
  const setGame = useGameStore((state) => state.setGame);

  const [chatBody, setChatBody] = useState("");
  const [boardWidth, setBoardWidth] = useState(400);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  useRoomSocket(roomCode);

  // ── Board sizing ────────────────────────────────────────────────────────────
  useEffect(() => {
    function handleResize() {
      const width = Math.min(480, Math.max(280, window.innerWidth - 48));
      setBoardWidth(width);
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ── Auto-scroll chat ────────────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [game?.chat]);

  // ── Focus chat input when meeting starts ───────────────────────────────────
  useEffect(() => {
    if (game?.meeting.phase !== "NONE") {
      setTimeout(() => chatInputRef.current?.focus(), 300);
    }
  }, [game?.meeting.phase]);

  const socket = getSocket(token);
  const me = game?.players.find((p) => p.id === user.id);
  const canMove = Boolean(me?.alive && game?.currentPlayerId === user.id && game.meeting.phase === "NONE" && game.status === "IN_GAME");
  const hasVoted = Boolean(game?.meeting.votes.some((v) => v.voterId === user.id));
  const roleClass = role === "IMPOSTOR"
    ? "border-rose-500/60 bg-rose-500/10 text-rose-100"
    : "border-emerald-400/50 bg-emerald-400/10 text-emerald-100";

  const isImpostor = useCallback((playerId: string) => {
    if (game?.impostorIds) {
      return game.impostorIds.includes(playerId);
    }
    return game?.impostorId === playerId;
  }, [game?.impostorIds, game?.impostorId]);

  const moveRows = useMemo(() => [...(game?.moveHistory ?? [])].reverse().slice(0, 20), [game?.moveHistory]);

  // ── Timers ──────────────────────────────────────────────────────────────────
  const turnSecondsLeft = useCountdown(game?.turnEndsAt ?? null);
  const meetingSecondsLeft = useCountdown(game?.meeting.phaseEndsAt ?? null);

  // ── Legal move highlights ───────────────────────────────────────────────────
  const { legalMoveDots, highlightedSquares } = useMemo(() => {
    if (!game || !selectedSquare || !canMove) {
      return { legalMoveDots: {}, highlightedSquares: {} };
    }
    const chess = new Chess(game.fen);
    const moves = chess.moves({ square: selectedSquare as Square, verbose: true });
    const dots: Record<string, React.CSSProperties> = {};
    const highlights: Record<string, React.CSSProperties> = {};

    // Highlight the selected piece square
    highlights[selectedSquare] = { backgroundColor: "rgba(255, 255, 0, 0.35)", borderRadius: "0px" };

    moves.forEach((move) => {
      const isCapture = !!move.captured;
      dots[move.to] = isCapture
        ? {
            background: "radial-gradient(circle, rgba(220,38,38,0) 50%, rgba(220,38,38,0.6) 52%)",
            borderRadius: "0px"
          }
        : {
            background: "radial-gradient(circle, rgba(99,102,241,0.7) 28%, transparent 30%)",
            borderRadius: "0px"
          };
    });

    return { legalMoveDots: dots, highlightedSquares: highlights };
  }, [game, selectedSquare, canMove]);

  const customSquareStyles = useMemo(
    () => ({ ...highlightedSquares, ...legalMoveDots }),
    [highlightedSquares, legalMoveDots]
  );

  // ── Piece click handler (click-to-move support) ─────────────────────────────
  const onSquareClick = useCallback(
    (square: string) => {
      if (!canMove || !game) return;

      if (selectedSquare) {
        // Attempt move if second click is a legal target
        const chess = new Chess(game.fen);
        const legalTargets = chess
          .moves({ square: selectedSquare as Square, verbose: true })
          .map((m) => m.to);

        if (legalTargets.includes(square as Square)) {
          socket.emit("make-move", { roomCode: roomCode!, from: selectedSquare, to: square }, (res) => {
            if (!res.ok) console.warn("Move rejected:", res.error);
          });
          setSelectedSquare(null);
          return;
        }

        // Clicking own piece → re-select
        const piece = chess.get(square as Square);
        if (piece && piece.color === "w") {
          setSelectedSquare(square);
          return;
        }

        setSelectedSquare(null);
        return;
      }

      // First click: select piece
      const chess = new Chess(game.fen);
      const piece = chess.get(square as Square);
      if (piece && piece.color === "w") {
        setSelectedSquare(square);
      }
    },
    [canMove, game, roomCode, selectedSquare, socket]
  );

  const onPieceDrop = useCallback(
    (from: string, to: string) => {
      if (!canMove || !game) return false;

      // Validate locally first for instant feedback
      try {
        const chess = new Chess(game.fen);
        const result = chess.move({ from, to, promotion: "q" });
        if (!result) return false;
      } catch {
        return false;
      }

      setSelectedSquare(null);
      socket.emit("make-move", { roomCode: roomCode!, from, to }, (res) => {
        if (!res.ok) console.warn("Move rejected:", res.error);
      });
      return true;
    },
    [canMove, game, roomCode, socket]
  );

  const handleLeave = useCallback(() => {
    socket.emit("leave-game", { roomCode: roomCode! }, () => {
      setGame(null);
      navigate("/", { replace: true });
    });
  }, [navigate, roomCode, setGame, socket]);

  if (!game) {
    return (
      <Panel title="Loading Game">
        <div className="flex items-center gap-3 text-zinc-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-neon border-t-transparent" />
          Syncing board state...
        </div>
      </Panel>
    );
  }

  const inMeeting = game.meeting.phase !== "NONE";

  return (
    <>
      {showLeaveModal && (
        <LeaveModal onConfirm={handleLeave} onCancel={() => setShowLeaveModal(false)} />
      )}

      <div className="grid gap-4 md:grid-cols-12">
        {/* ── Left: Players ─────────────────────────────────────────────── */}
        <div className="md:col-span-4 lg:col-span-3">
          <Panel title="Players">
            <div className={`role-flash mb-4 rounded-md border px-3 py-2 text-sm font-bold ${roleClass}`}>
              {role ? `You are ${role}` : "Role pending"}
            </div>
            <div className="grid gap-2">
              {game.players.map((player) => (
                <div
                  key={player.id}
                  className={`rounded-md border p-3 transition-colors ${
                    player.isCurrentTurn && game.status === "IN_GAME"
                      ? "border-neon bg-neon/12"
                      : "border-white/10 bg-black/20"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`font-semibold truncate ${isImpostor(player.id) ? "text-rose-500 font-bold" : ""}`}>{player.username}</span>
                    {player.alive ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {inMeeting && (
                          game.meeting.votes.some((v) => v.voterId === player.id) ? (
                            <span className="rounded bg-emerald-500/20 px-1 py-0.5 text-[9px] font-bold text-emerald-300">VOTED</span>
                          ) : (
                            <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[9px] font-bold text-amber-300">VOTING</span>
                          )
                        )}
                        <span className="text-xs text-emerald-300">Alive</span>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-zinc-500 shrink-0">
                        <Skull size={14} />
                        Dead
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">{player.movesPlayed} moves</p>
                </div>
              ))}
            </div>

            {/* Leave game button */}
            {game.status === "IN_GAME" && (
              <button
                className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-md border border-rose-700/50 bg-rose-900/20 px-4 py-2 text-sm text-rose-300 hover:bg-rose-900/40 transition-colors"
                onClick={() => setShowLeaveModal(true)}
              >
                <LogOut size={15} />
                Leave Game
              </button>
            )}
          </Panel>
        </div>

        {/* ── Centre: Board ─────────────────────────────────────────────── */}
        <section className="md:col-span-8 lg:col-span-9 xl:col-span-6 grid gap-4 content-start">
          {/* Header bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/10 bg-panel/82 p-4">
            <div>
              <h1 className="text-xl font-black">{game.roomName}</h1>
              <p className="text-sm text-zinc-400">
                Room {game.roomCode} · Meeting in {game.meeting.movesUntilAvailable} White moves
              </p>
            </div>
            {/* Turn timer countdown */}
            {game.turnEndsAt && game.status === "IN_GAME" && !inMeeting && (
              <div className={`flex items-center gap-2 text-sm font-bold ${turnSecondsLeft <= 10 ? "text-rose-400 animate-pulse" : "text-zinc-300"}`}>
                <Timer size={17} className={turnSecondsLeft <= 10 ? "text-rose-400" : "text-neon"} />
                {turnSecondsLeft}s
              </div>
            )}
          </div>

          {error && <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}

          {/* ── Meeting chat overlay (above board) ────────────────────── */}
          {inMeeting && (
            <div className="rounded-xl border border-violet-500/30 bg-violet-950/60 shadow-lg shadow-violet-900/30 overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-violet-500/20 bg-violet-900/30 px-4 py-3">
                <div className="flex items-center gap-2">
                  <MessageSquare size={18} className="text-violet-300" />
                  <span className="font-bold text-violet-100">Emergency Meeting — Chat</span>
                </div>
                {game.meeting.phaseEndsAt && (
                  <span className={`text-sm font-mono font-bold ${meetingSecondsLeft <= 10 ? "text-rose-400 animate-pulse" : "text-violet-300"}`}>
                    {meetingSecondsLeft}s
                  </span>
                )}
              </div>
              <div className="thin-scrollbar h-52 overflow-auto p-3">
                {game.chat.map((message) => {
                  if (message.system) {
                    return (
                      <p key={message.id} className="mb-2 text-xs italic text-amber-300 bg-amber-500/10 px-2 py-1.5 rounded border border-amber-500/20">
                        📢 {message.body}
                      </p>
                    );
                  }
                  return (
                    <p key={message.id} className="mb-2 text-sm">
                      <span className="font-bold text-violet-300">{message.username}: </span>
                      <span className="text-zinc-200">{message.body}</span>
                    </p>
                  );
                })}
                <div ref={chatEndRef} />
              </div>
              <form
                className="flex gap-2 border-t border-violet-500/20 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!chatBody.trim()) return;
                  socket.emit("send-message", { roomCode: roomCode!, body: chatBody });
                  setChatBody("");
                }}
              >
                <input
                  ref={chatInputRef}
                  className="min-w-0 flex-1 rounded-md border border-violet-500/30 bg-black/30 px-3 py-2 text-sm outline-none focus:border-violet-400 transition-colors"
                  value={chatBody}
                  onChange={(e) => setChatBody(e.target.value)}
                  disabled={!me?.alive}
                  placeholder={me?.alive ? "Make your case..." : "Spectating"}
                />
                <button
                  type="submit"
                  className="grid h-10 w-10 place-items-center rounded-md bg-violet-600 hover:bg-violet-500 transition-colors disabled:opacity-50"
                  disabled={!me?.alive}
                >
                  <Send size={16} />
                </button>
              </form>
            </div>
          )}

          {/* Chessboard */}
          <div className="mx-auto w-full max-w-[480px]">
            <Chessboard
              position={game.fen}
              arePiecesDraggable={canMove}
              boardWidth={boardWidth}
              animationDuration={200}
              customDarkSquareStyle={{ backgroundColor: "#4a4264" }}
              customLightSquareStyle={{ backgroundColor: "#d9d2f4" }}
              customSquareStyles={customSquareStyles}
              onSquareClick={onSquareClick}
              onPieceDrop={onPieceDrop}
              onPieceDragBegin={(piece, square) => {
                if (canMove) setSelectedSquare(square);
              }}
              onPieceDragEnd={() => setSelectedSquare(null)}
            />
          </div>

          {/* Meeting controls */}
          <div className="grid gap-3 md:grid-cols-2">
            <Button
              disabled={!game.meeting.available || !me?.alive || inMeeting}
              onClick={() => socket.emit("call-meeting", { roomCode: roomCode! })}
            >
              <span className="inline-flex items-center gap-2">
                <PhoneCall size={17} />
                Call Meeting
                {!game.meeting.available && game.meeting.movesUntilAvailable > 0 && (
                  <span className="text-xs opacity-60">({game.meeting.movesUntilAvailable} moves)</span>
                )}
              </span>
            </Button>
            <div className="rounded-md border border-white/10 bg-black/20 px-4 py-2 text-sm text-zinc-300 flex items-center justify-between">
              <span>Meeting phase</span>
              <span className={`font-bold ${inMeeting ? "text-violet-300" : "text-white"}`}>{game.meeting.phase}</span>
            </div>
          </div>

          {/* Voting panel */}
          {game.meeting.phase === "VOTING" && (
            <Panel title="Cast Vote">
              {hasVoted ? (
                <p className="text-sm text-zinc-400 italic">You have cast your vote. Waiting for others...</p>
              ) : !me?.alive ? (
                <p className="text-sm text-zinc-500 italic">Eliminated players cannot vote.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {game.players
                    .filter((p) => p.alive && p.id !== user.id)
                    .map((p) => (
                      <button
                        key={p.id}
                        className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm hover:border-rose-400 hover:bg-rose-500/10 transition-colors"
                        onClick={() => socket.emit("cast-vote", { roomCode: roomCode!, targetId: p.id })}
                      >
                        <Vote size={16} />
                        <span className={isImpostor(p.id) ? "text-rose-500 font-bold" : ""}>
                          {p.username}
                        </span>
                      </button>
                    ))}
                  <button
                    className="rounded-md border border-white/10 px-3 py-2 text-sm hover:border-neon transition-colors"
                    onClick={() => socket.emit("cast-vote", { roomCode: roomCode!, targetId: "SKIP" })}
                  >
                    Skip Vote
                  </button>
                </div>
              )}
            </Panel>
          )}

          {/* Game over */}
          {game.status === "FINISHED" && (
            <Panel title={game.winner === "CREWMATES" ? "🎉 Crewmates Win!" : "💀 Impostor Wins!"}>
              <p className="text-zinc-300 mb-1">
                {game.impostorIds && game.impostorIds.length > 1 ? "Impostors: " : "Impostor: "}
                <span className="font-bold text-neon">
                  {game.impostorIds && game.impostorIds.length > 0
                    ? game.impostorIds
                        .map((id) => game.players.find((p) => p.id === id)?.username ?? "Unknown")
                        .join(", ")
                    : game.players.find((p) => p.id === game.impostorId)?.username ?? "Unknown"}
                </span>
              </p>
              <p className="text-xs text-zinc-500 mb-4">Returning to lobby in 10 seconds...</p>
              <div className="grid gap-2 md:grid-cols-2">
                <Button onClick={() => navigate(`/lobby/${game.roomCode}`)}>Back to Lobby</Button>
                <button
                  className="rounded-md border border-white/10 px-4 py-2 text-sm font-bold hover:bg-white/8"
                  onClick={() => navigate("/")}
                >
                  Return Home
                </button>
              </div>
            </Panel>
          )}
        </section>

        {/* ── Right: Move history (only, chat moved to overlay) ──────── */}
        <div className="md:col-span-12 xl:col-span-3 grid gap-4 content-start">
          <Panel title="Move History">
            <div className="thin-scrollbar max-h-80 overflow-auto text-sm">
              {moveRows.length === 0 && (
                <p className="text-zinc-500 italic text-xs">No moves yet.</p>
              )}
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
    </>
  );
}
