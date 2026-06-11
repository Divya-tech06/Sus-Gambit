import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { GameSnapshot, RoomSnapshot } from "@chess-impostor/shared";
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

    // Register listeners BEFORE emitting join so we never miss an event
    socket.on("room-updated", handleRoomUpdated);
    socket.on("game-updated", handleGameUpdated);
    socket.on("role-assigned", handleRole);
    socket.on("error-message", handleError);
    socket.on("game-over", handleGameOver);
    socket.on("receive-message", pushChat);

    // ── Join / reconnect ───────────────────────────────────────────────────
    const doJoin = () => {
      if (unmounted) return;

      socket.emit("join-room", { roomCode }, (response) => {
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
            setError(response.error);
          }
        });
      });
    };

    // If the socket is already connected, join immediately.
    // Otherwise wait for the connect event (fired once the auth handshake completes).
    if (socket.connected) {
      doJoin();
    } else {
      socket.once("connect", doJoin);
    }

    return () => {
      unmounted = true;
      socket.off("connect", doJoin);
      socket.off("room-updated", handleRoomUpdated);
      socket.off("game-updated", handleGameUpdated);
      socket.off("role-assigned", handleRole);
      socket.off("error-message", handleError);
      socket.off("game-over", handleGameOver);
      socket.off("receive-message", pushChat);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, roomCode]);
}
