import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { GameSnapshot, RoomSnapshot, VoteRecord } from "@chess-impostor/shared";
import { getSocket } from "../lib/socket";
import { useAuthStore } from "../store/auth";
import { useGameStore } from "../store/game";

export function useRoomSocket(roomCode: string | undefined) {
  const token = useAuthStore((state) => state.accessToken);
  const setRoom = useGameStore((state) => state.setRoom);
  const setGame = useGameStore((state) => state.setGame);
  const setRole = useGameStore((state) => state.setRole);
  const setError = useGameStore((state) => state.setError);
  const pushChat = useGameStore((state) => state.pushChat);
  const navigate = useNavigate();

  // SOCK-4: Track whether we are already in the process of joining to prevent
  // duplicate join calls when the socket reconnects while a join is in flight.
  const joiningRef = useRef(false);

  useEffect(() => {
    if (!token || !roomCode) return;

    const socket = getSocket(token);
    let unmounted = false;

    // ── Event handlers ─────────────────────────────────────────────────────
    const handleRoomUpdated = (room: RoomSnapshot) => {
      if (unmounted) return;
      setRoom(room);
      // Server reset the room to LOBBY after game ends → navigate back
      if (room.status === "LOBBY") {
        navigate(`/lobby/${room.roomCode}`, { replace: true });
      }
    };

    const handleGameUpdated = (game: GameSnapshot) => {
      if (unmounted) return;
      setGame(game);
      if (game.status === "IN_GAME") {
        navigate(`/game/${game.roomCode}`, { replace: true });
      }
    };

    const handleGameOver = (game: GameSnapshot) => {
      if (unmounted) return;
      setGame(game);
      // room-updated will fire ~10 s later from the server to redirect to lobby
    };

    const handleRole = (role: "CREWMATE" | "IMPOSTOR") => {
      if (unmounted) return;
      setRole(role);
    };

    const handleError = (msg: string) => {
      if (unmounted) return;
      setError(msg);
    };

    // SOCK-3: player-eliminated — update game state so dead players are shown
    const handlePlayerEliminated = (payload: { userId: string }) => {
      if (unmounted) return;
      // The server also sends a game-updated right after this event,
      // so we don't need to manually mutate state here. However, listening
      // ensures we don't miss it if game-updated is delayed/lost.
      console.info("[socket] player-eliminated:", payload.userId);
    };

    // SOCK-3: vote-results — log for debugging; game-updated carries the state
    const handleVoteResults = (payload: {
      eliminatedUserId: string | null;
      votes: VoteRecord[];
    }) => {
      if (unmounted) return;
      console.info("[socket] vote-results:", payload);
    };

    // Register listeners BEFORE emitting join so we never miss an event
    socket.on("room-updated", handleRoomUpdated);
    socket.on("game-updated", handleGameUpdated);
    socket.on("role-assigned", handleRole);
    socket.on("error-message", handleError);
    socket.on("game-over", handleGameOver);
    socket.on("receive-message", pushChat);
    socket.on("player-eliminated", handlePlayerEliminated);
    socket.on("vote-results", handleVoteResults);

    // ── Join / reconnect ───────────────────────────────────────────────────
    const doJoin = () => {
      if (unmounted || joiningRef.current) return;
      joiningRef.current = true;

      socket.emit("join-room", { roomCode }, (response) => {
        joiningRef.current = false;
        if (unmounted) return;

        if (response.ok) {
          const data = response.data as RoomSnapshot | GameSnapshot;
          if ("fen" in data) {
            setGame(data as GameSnapshot);
            navigate(`/game/${(data as GameSnapshot).roomCode}`, { replace: true });
          } else {
            setRoom(data as RoomSnapshot);
          }
          return;
        }

        // join-room rejected (e.g. game in progress) → try reconnect-player
        socket.emit("reconnect-player", { roomCode }, (r2) => {
          if (unmounted) return;
          if (r2.ok) {
            const snap = r2.data as RoomSnapshot | GameSnapshot;
            if ("fen" in snap) {
              setGame(snap as GameSnapshot);
              navigate(`/game/${(snap as GameSnapshot).roomCode}`, { replace: true });
            } else {
              setRoom(snap as RoomSnapshot);
            }
          } else {
            // SOCK-2: was incorrectly using response.error (join-room error).
            // Now correctly uses r2.error (reconnect-player error).
            setError(r2.error);
          }
        });
      });
    };

    // SOCK-4: Use socket.on("connect") — not socket.once — so this fires on
    // EVERY connect event, including automatic reconnects after network loss.
    // If the socket is already connected, join immediately as well.
    socket.on("connect", doJoin);
    if (socket.connected) {
      doJoin();
    }

    return () => {
      unmounted = true;
      joiningRef.current = false;
      socket.off("connect", doJoin);
      socket.off("room-updated", handleRoomUpdated);
      socket.off("game-updated", handleGameUpdated);
      socket.off("role-assigned", handleRole);
      socket.off("error-message", handleError);
      socket.off("game-over", handleGameOver);
      socket.off("receive-message", pushChat);
      socket.off("player-eliminated", handlePlayerEliminated);
      socket.off("vote-results", handleVoteResults);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, roomCode]);
}
