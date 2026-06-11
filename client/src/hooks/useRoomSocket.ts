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

    socket.on("room-updated", setRoom);
    socket.on("game-updated", (game) => {
      setGame(game);
      if (game.status === "IN_GAME") navigate(`/game/${game.roomCode}`);
    });
    socket.on("role-assigned", setRole);
    socket.on("error-message", setError);
    socket.on("game-over", setGame);
    socket.on("receive-message", pushChat);

    socket.emit("join-room", { roomCode }, (response) => {
      if (response.ok) {
        setRoom(response.data);
        return;
      }

      socket.emit("reconnect-player", { roomCode }, (reconnectResponse) => {
        if (reconnectResponse.ok) {
          const snapshot = reconnectResponse.data as RoomSnapshot | GameSnapshot;
          if ("fen" in snapshot) {
            setGame(snapshot);
            navigate(`/game/${snapshot.roomCode}`);
          } else {
            setRoom(snapshot);
          }
        } else {
          setError(response.error);
        }
      });
    });

    return () => {
      socket.off("room-updated", setRoom);
      socket.off("game-updated");
      socket.off("role-assigned", setRole);
      socket.off("error-message", setError);
      socket.off("game-over", setGame);
      socket.off("receive-message", pushChat);
    };
  }, [navigate, roomCode, setError, setGame, setRole, setRoom, token, pushChat]);
}
