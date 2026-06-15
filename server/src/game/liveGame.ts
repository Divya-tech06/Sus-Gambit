import { Chess } from "chess.js";
import { nanoid } from "nanoid";
import { Prisma } from "@prisma/client";
import type {
  ChatMessage,
  GameSnapshot,
  GameWinner,
  LobbyPlayer,
  MeetingPhase,
  MoveRecord,
  Role,
  RoomSettings,
  RoomSnapshot,
  VoteRecord
} from "@chess-impostor/shared";
import { DEFAULT_ROOM_SETTINGS } from "@chess-impostor/shared";
import { prisma } from "../db.js";
import { chooseBotMove } from "./bot.js";

interface LivePlayer {
  id: string;
  username: string;
  avatar: string | null;
  socketId: string | null;
  ready: boolean;
  alive: boolean;
  role: Role | null;
  connected: boolean;
  movesPlayed: number;
  captures: number;
  disconnectedAt: number | null;
}

interface LiveRoom {
  id: string;
  roomCode: string;
  hostId: string;
  settings: RoomSettings;
  status: "LOBBY" | "IN_GAME" | "FINISHED";
  players: Map<string, LivePlayer>;
  turnOrder: string[];
  currentTurnIndex: number;
  chess: Chess;
  moveHistory: MoveRecord[];
  voteHistory: VoteRecord[][];
  chat: ChatMessage[];
  meeting: {
    phase: MeetingPhase;
    calledById: string | null;
    phaseEndsAt: number | null;
    votes: VoteRecord[];
    whiteMovesSinceMeeting: number;
  };
  gameId: string | null;
  winner: GameWinner;
  timers: {
    turn: NodeJS.Timeout | null;
    meeting: NodeJS.Timeout | null;
    hostGrace: NodeJS.Timeout | null;
  };
  turnEndsAt: number | null;
}

export type Broadcast = (roomCode: string, event: string, payload: unknown) => void;
export type DirectEmit = (userId: string, event: string, payload: unknown) => void;

export class LiveGameService {
  private rooms = new Map<string, LiveRoom>();
  private socketToUser = new Map<string, string>();
  /** Track which room each user is currently "active" in (to prevent dual-room joins) */
  private userToRoom = new Map<string, string>();

  constructor(
    private readonly broadcast: Broadcast,
    private readonly directEmit: DirectEmit
  ) {}

  async createRoom(host: { id: string; username: string; avatar: string | null }, settings: RoomSettings) {
    // If the host is already in a room, remove them from it first
    this.removeUserFromCurrentRoom(host.id);

    const roomCode = nanoid(6).toUpperCase();
    const room = await prisma.room.create({
      data: { roomCode, hostId: host.id, settings: settings as unknown as Prisma.InputJsonValue, status: "LOBBY" }
    });

    const liveRoom = this.makeRoom(room.id, roomCode, host.id, settings);
    liveRoom.players.set(host.id, this.makePlayer(host, true, null));
    this.rooms.set(roomCode, liveRoom);
    this.userToRoom.set(host.id, roomCode);
    return this.roomSnapshot(liveRoom);
  }

  async publicRooms() {
    return Array.from(this.rooms.values())
      .filter((room) => room.status === "LOBBY" && room.settings.visibility === "PUBLIC")
      .map((room) => this.roomSnapshot(room));
  }

  attachSocket(socketId: string, userId: string) {
    this.socketToUser.set(socketId, userId);
  }

  detachSocket(socketId: string) {
    const userId = this.socketToUser.get(socketId);
    this.socketToUser.delete(socketId);
    if (!userId) return;

    // SOCK-5: O(1) lookup via userToRoom instead of scanning all rooms
    const roomCode = this.userToRoom.get(userId);
    if (!roomCode) return;
    const room = this.rooms.get(roomCode);
    if (!room) return;

    const player = room.players.get(userId);
    if (!player) return;

    player.connected = false;
    player.socketId = null;
    player.disconnectedAt = Date.now();

    // If the disconnected player is the host, start a grace period then reassign
    if (room.hostId === userId) {
      this.scheduleHostReassignment(room, userId);
    }

    this.broadcastUpdate(room);
  }

  /** Immediately or after grace period, reassign host to another player */
  private scheduleHostReassignment(room: LiveRoom, oldHostId: string) {
    // Clear any existing grace timer
    if (room.timers.hostGrace) clearTimeout(room.timers.hostGrace);

    room.timers.hostGrace = setTimeout(() => {
      room.timers.hostGrace = null;
      // Only reassign if the old host is still disconnected
      const oldHost = room.players.get(oldHostId);
      if (oldHost && !oldHost.connected) {
        this.reassignHost(room, oldHostId);
      }
    }, 15_000); // 15 second grace window
  }

  private reassignHost(room: LiveRoom, excludeId: string) {
    // Find the next connected (or any alive) player
    for (const [id, player] of room.players) {
      if (id !== excludeId && (player.connected || player.alive)) {
        room.hostId = id;
        this.sendSystemMessage(room, `${player.username} is now the host.`);
        this.broadcastUpdate(room);
        return;
      }
    }
    // No suitable host → just pick any remaining player
    for (const [id] of room.players) {
      if (id !== excludeId) {
        room.hostId = id;
        this.broadcastUpdate(room);
        return;
      }
    }
  }

  joinRoom(roomCode: string, user: { id: string; username: string; avatar: string | null }, socketId: string) {
    const room = this.requireRoom(roomCode);

    // Fast-path: player is already in the room (reconnect / duplicate join)
    const existing = room.players.get(user.id);
    if (existing) {
      existing.connected = true;
      existing.socketId = socketId;
      existing.disconnectedAt = null;

      // Cancel host grace timer if host reconnected
      if (room.hostId === user.id && room.timers.hostGrace) {
        clearTimeout(room.timers.hostGrace);
        room.timers.hostGrace = null;
      }

      this.userToRoom.set(user.id, roomCode);
      this.broadcastUpdate(room);
      // Return appropriate snapshot
      return room.status === "LOBBY" ? this.roomSnapshot(room) : this.gameSnapshot(room);
    }

    // New player joining
    if (room.status !== "LOBBY") throw new Error("Game already started.");
    if (room.players.size >= room.settings.playerCount) throw new Error("Room is full.");

    // Prevent joining a second room
    const currentRoom = this.userToRoom.get(user.id);
    if (currentRoom && currentRoom !== roomCode) {
      throw new Error("You are already in another room. Please leave it first.");
    }

    room.players.set(user.id, this.makePlayer(user, false, socketId));
    this.userToRoom.set(user.id, roomCode);
    this.broadcastUpdate(room);
    return this.roomSnapshot(room);
  }

  leaveRoom(roomCode: string, userId: string): void {
    const room = this.requireRoom(roomCode);
    if (room.status === "IN_GAME") {
      // During a game, use leaveGame instead
      return this.leaveGame(roomCode, userId);
    }

    room.players.delete(userId);
    this.userToRoom.delete(userId);

    if (room.players.size === 0) {
      // Empty room – clean up
      this.rooms.delete(roomCode);
      return;
    }

    if (room.hostId === userId) {
      const nextHost = room.players.keys().next().value as string | undefined;
      if (nextHost) {
        room.hostId = nextHost;
        const nextPlayer = room.players.get(nextHost);
        if (nextPlayer) this.sendSystemMessage(room, `${nextPlayer.username} is now the host.`);
      }
    }
    this.broadcastUpdate(room);
  }

  async disbandRoom(roomCode: string, userId: string): Promise<void> {
    const room = this.requireRoom(roomCode);
    if (room.hostId !== userId) {
      throw new Error("Only the host can disband the room.");
    }

    // 1. Notify all players in the room
    this.broadcast(room.roomCode, "room-disbanded", undefined);

    // 2. Clean up timers
    this.clearTurnTimer(room);
    this.clearMeetingTimer(room);
    if (room.timers.hostGrace) {
      clearTimeout(room.timers.hostGrace);
    }

    // 3. Clear user mapping
    for (const player of room.players.values()) {
      this.userToRoom.delete(player.id);
    }

    // 4. Remove from active rooms Map
    this.rooms.delete(roomCode);

    // 5. Delete from DB
    try {
      await prisma.room.delete({
        where: { id: room.id }
      });
    } catch (err) {
      console.error("[liveGame] Failed to delete room from DB on disband:", err);
    }
  }

  /**
   * In-game leave:
   * - Impostor leaves → Crewmates win immediately
   * - Crewmate leaves → they are marked dead and removed
   */
  leaveGame(roomCode: string, userId: string): void {
    const room = this.requireRoom(roomCode);
    if (room.status !== "IN_GAME") {
      // If not in game, treat as lobby leave
      return this.leaveRoom(roomCode, userId);
    }

    const player = room.players.get(userId);
    if (!player) return;

    if (player.role === "IMPOSTOR") {
      player.alive = false;
      player.connected = false;
      this.sendSystemMessage(room, `${player.username} (Impostor) left the game.`);
      if (room.hostId === userId) {
        this.reassignHost(room, userId);
      }
      void this.checkGameEnd(room);
      this.broadcastUpdate(room);
    } else {
      // Crewmate left → mark dead
      player.alive = false;
      player.connected = false;
      this.userToRoom.delete(userId);
      this.sendSystemMessage(room, `${player.username} left the game.`);

      // Reassign host if needed
      if (room.hostId === userId) {
        this.reassignHost(room, userId);
      }

      void this.checkGameEnd(room);
      this.broadcastUpdate(room);
    }
  }

  setReady(roomCode: string, userId: string, ready: boolean) {
    const room = this.requireRoom(roomCode);
    const player = this.requirePlayer(room, userId);
    player.ready = ready;
    this.broadcastUpdate(room);
    return this.roomSnapshot(room);
  }

  async startGame(roomCode: string, userId: string) {
    const room = this.requireRoom(roomCode);
    if (room.hostId !== userId) throw new Error("Only the host can start the game.");
    if (room.players.size < room.settings.playerCount) throw new Error("Minimum player count has not been reached.");
    if (!Array.from(room.players.values()).every((player) => player.ready || player.id === room.hostId)) {
      throw new Error("All players must be ready.");
    }

    // DB-2: Set status to IN_GAME BEFORE any await to act as an optimistic lock.
    // Node.js is single-threaded so this prevents two concurrent start-game events
    // from both passing the status check before either writes to the DB.
    if (room.status === "IN_GAME") throw new Error("Game already started.");
    room.status = "IN_GAME";
    room.turnOrder = this.shuffle(Array.from(room.players.keys()));
    room.currentTurnIndex = 0;
    room.chess = new Chess();
    room.moveHistory = [];
    room.voteHistory = [];
    room.chat = [];
    room.winner = null;
    room.turnEndsAt = null;
    room.meeting = {
      phase: "NONE",
      calledById: null,
      phaseEndsAt: null,
      votes: [],
      whiteMovesSinceMeeting: 0
    };

    const impCount = room.settings.impostorCount ?? 1;
    if (impCount >= room.players.size) {
      throw new Error("Impostor count must be less than the player count.");
    }
    if (impCount * 2 >= room.players.size) {
      throw new Error("Impostor count must be less than half of the player count to start the game.");
    }

    const shuffledForImpostors = this.shuffle(room.turnOrder);
    const impostorIds = shuffledForImpostors.slice(0, Math.min(impCount, shuffledForImpostors.length - 1));
    const impostorIdsSet = new Set(impostorIds);

    for (const player of room.players.values()) {
      player.alive = true;
      player.role = impostorIdsSet.has(player.id) ? "IMPOSTOR" : "CREWMATE";
      player.movesPlayed = 0;
      player.captures = 0;
      this.directEmit(player.id, "role-assigned", player.role);
    }

    const game = await prisma.game.create({
      data: {
        roomId: room.id,
        impostorId: impostorIds[0] ?? null,
        moveHistory: [],
        voteHistory: []
      }
    });
    await prisma.room.update({ where: { id: room.id }, data: { status: "IN_GAME" } });
    room.gameId = game.id;
    this.startTurnTimer(room);
    this.broadcastUpdate(room);
    return this.gameSnapshot(room);
  }

  async makeMove(roomCode: string, userId: string, move: { from: string; to: string; promotion?: string }) {
    const room = this.requireRoom(roomCode);
    this.assertCanMove(room, userId);

    let legalMove;
    try {
      legalMove = room.chess.move({ from: move.from, to: move.to, promotion: move.promotion ?? "q" });
    } catch (e) {
      throw new Error("Illegal move.");
    }
    if (!legalMove) throw new Error("Illegal move.");

    this.recordMove(room, legalMove, "WHITE", userId);
    const player = this.requirePlayer(room, userId);
    player.movesPlayed += 1;
    if (legalMove.captured) player.captures += 1;
    room.meeting.whiteMovesSinceMeeting += 1;
    await this.afterWhiteMove(room);
    return this.gameSnapshot(room);
  }

  sendMessage(roomCode: string, userId: string, body: string) {
    const room = this.requireRoom(roomCode);
    const player = this.requirePlayer(room, userId);
    if (room.status === "IN_GAME" && !player.alive) throw new Error("Eliminated players cannot chat.");
    if (!body.trim()) throw new Error("Message cannot be empty.");

    const message: ChatMessage = {
      id: nanoid(),
      roomCode,
      userId,
      username: player.username,
      body: body.trim().slice(0, 300),
      createdAt: new Date().toISOString()
    };
    room.chat.push(message);
    // REL-2: Cap chat history to prevent unbounded memory growth and large broadcast payloads
    if (room.chat.length > 200) room.chat = room.chat.slice(-200);
    this.broadcast(room.roomCode, "receive-message", message);
    return message;
  }

  private sendSystemMessage(room: LiveRoom, body: string) {
    const message: ChatMessage = {
      id: nanoid(),
      roomCode: room.roomCode,
      userId: "system",
      username: "System",
      body,
      createdAt: new Date().toISOString(),
      system: true
    };
    room.chat.push(message);
    // REL-2: Cap chat history
    if (room.chat.length > 200) room.chat = room.chat.slice(-200);
    this.broadcast(room.roomCode, "receive-message", message);
  }

  callMeeting(roomCode: string, userId: string) {
    const room = this.requireRoom(roomCode);
    const player = this.requirePlayer(room, userId);
    if (!player.alive) throw new Error("Only alive players can call meetings.");
    if (!this.meetingAvailable(room)) throw new Error("Meeting cooldown is still active.");

    this.clearTurnTimer(room);
    room.meeting.phase = "DISCUSSION";
    room.meeting.calledById = userId;
    room.meeting.phaseEndsAt = Date.now() + room.settings.discussionTimer * 1000;
    room.meeting.votes = [];
    this.setMeetingTimer(room, () => this.startVoting(room));
    this.sendSystemMessage(room, `${player.username} called an emergency meeting!`);
    this.broadcastUpdate(room);
    return this.gameSnapshot(room);
  }

  castVote(roomCode: string, userId: string, targetId: string | "SKIP") {
    const room = this.requireRoom(roomCode);
    const player = this.requirePlayer(room, userId);
    if (room.meeting.phase !== "VOTING") throw new Error("Voting is not active.");
    if (!player.alive) throw new Error("Only alive players can vote.");
    if (room.meeting.votes.some((vote) => vote.voterId === userId)) throw new Error("Vote already submitted.");
    if (targetId !== "SKIP" && !room.players.get(targetId)?.alive) throw new Error("Target is not an alive player.");

    room.meeting.votes.push({ voterId: userId, targetId });
    if (room.meeting.votes.length >= this.alivePlayers(room).length) {
      void this.finishVoting(room);
    } else {
      this.broadcastUpdate(room);
    }
    return this.gameSnapshot(room);
  }

  snapshot(roomCode: string, userId: string) {
    const room = this.requireRoom(roomCode);
    const player = room.players.get(userId);
    if (player) {
      player.connected = true;
      player.disconnectedAt = null;
    }
    this.userToRoom.set(userId, roomCode);
    return room.status === "LOBBY" ? this.roomSnapshot(room) : this.gameSnapshot(room);
  }

  private removeUserFromCurrentRoom(userId: string) {
    const currentRoomCode = this.userToRoom.get(userId);
    if (!currentRoomCode) return;
    const room = this.rooms.get(currentRoomCode);
    if (!room || room.status !== "LOBBY") return;
    room.players.delete(userId);
    this.userToRoom.delete(userId);
    if (room.players.size === 0) {
      this.rooms.delete(currentRoomCode);
      return;
    }
    if (room.hostId === userId) {
      const nextHost = room.players.keys().next().value as string | undefined;
      if (nextHost) room.hostId = nextHost;
    }
    this.broadcastUpdate(room);
  }

  private makeRoom(id: string, roomCode: string, hostId: string, settings: RoomSettings): LiveRoom {
    return {
      id,
      roomCode,
      hostId,
      settings: { ...DEFAULT_ROOM_SETTINGS, ...settings },
      status: "LOBBY",
      players: new Map(),
      turnOrder: [],
      currentTurnIndex: 0,
      chess: new Chess(),
      moveHistory: [],
      voteHistory: [],
      chat: [],
      meeting: { phase: "NONE", calledById: null, phaseEndsAt: null, votes: [], whiteMovesSinceMeeting: 0 },
      gameId: null,
      winner: null,
      turnEndsAt: null,
      timers: { turn: null, meeting: null, hostGrace: null }
    };
  }

  private makePlayer(
    user: { id: string; username: string; avatar: string | null },
    ready: boolean,
    socketId: string | null
  ): LivePlayer {
    return {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      socketId,
      ready,
      alive: true,
      role: null,
      connected: true,
      movesPlayed: 0,
      captures: 0,
      disconnectedAt: null
    };
  }

  private async afterWhiteMove(room: LiveRoom) {
    this.clearTurnTimer(room);
    if (await this.checkGameEnd(room)) return;
    const botMove = await chooseBotMove(room.chess, room.settings.botDifficulty);

    // REL-1: Guard — the game may have ended while the bot was thinking (up to 4s).
    // Do not apply a move to a finished or reset game.
    if (room.status !== "IN_GAME") return;

    if (botMove) {
      try {
        const move = room.chess.move({ from: botMove.from, to: botMove.to, promotion: botMove.promotion ?? "q" });
        if (move) this.recordMove(room, move, "BLACK");
      } catch (e) {
        console.error("Bot tried to play an illegal move:", botMove, e);
      }
    }
    if (await this.checkGameEnd(room)) return;
    this.advanceTurn(room);
    this.startTurnTimer(room);
    this.broadcastUpdate(room);
  }

  private async autoMove(room: LiveRoom) {
    if (room.status !== "IN_GAME" || room.meeting.phase !== "NONE") return;
    const currentId = this.currentPlayerId(room);
    if (!currentId) return;
    const legalMoves = room.chess.moves({ verbose: true });
    const move = legalMoves[Math.floor(Math.random() * legalMoves.length)];
    if (!move) return;
    const chessMove = room.chess.move({ from: move.from, to: move.to, promotion: move.promotion ?? "q" });
    if (!chessMove) return;
    this.recordMove(room, chessMove, "WHITE", currentId);
    const player = this.requirePlayer(room, currentId);
    player.movesPlayed += 1;
    if (chessMove.captured) player.captures += 1;
    room.meeting.whiteMovesSinceMeeting += 1;
    await this.afterWhiteMove(room);
  }

  private recordMove(room: LiveRoom, move: ReturnType<Chess["move"]>, by: "WHITE" | "BLACK", playerId?: string) {
    if (!move) return;
    room.moveHistory.push({
      san: move.san,
      from: move.from,
      to: move.to,
      by,
      playerId,
      fen: room.chess.fen(),
      createdAt: new Date().toISOString()
    });
  }

  private startVoting(room: LiveRoom) {
    room.meeting.phase = "VOTING";
    room.meeting.phaseEndsAt = Date.now() + room.settings.votingTimer * 1000;
    room.meeting.votes = [];
    this.setMeetingTimer(room, () => void this.finishVoting(room));
    this.broadcastUpdate(room);
  }

  private async finishVoting(room: LiveRoom) {
    if (room.meeting.phase !== "VOTING") return;
    this.clearMeetingTimer(room);
    const counts = new Map<string | "SKIP", number>();
    for (const vote of room.meeting.votes) counts.set(vote.targetId, (counts.get(vote.targetId) ?? 0) + 1);
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const top = sorted[0];
    const tied = sorted.length > 1 && sorted[0]?.[1] === sorted[1]?.[1];

    const eliminatedUserId = top && top[0] !== "SKIP" && !tied ? top[0] : null;

    if (eliminatedUserId) {
      const eliminated = this.requirePlayer(room, eliminatedUserId);
      eliminated.alive = false;
      this.sendSystemMessage(room, `${eliminated.username} was voted out (ejected).`);
      this.broadcast(room.roomCode, "player-eliminated", { userId: eliminatedUserId });
    } else {
      if (top && top[0] === "SKIP") {
        this.sendSystemMessage(room, "Voting skipped. No one was ejected.");
      } else if (tied) {
        this.sendSystemMessage(room, "Tie vote. No one was ejected.");
      } else {
        this.sendSystemMessage(room, "No votes were cast. No one was ejected.");
      }
    }

    room.voteHistory.push([...room.meeting.votes]);
    this.broadcast(room.roomCode, "vote-results", { eliminatedUserId, votes: room.meeting.votes });
    room.meeting.phase = "NONE";
    room.meeting.calledById = null;
    room.meeting.phaseEndsAt = null;
    room.meeting.votes = [];
    room.meeting.whiteMovesSinceMeeting = 0;

    if (await this.checkGameEnd(room)) return;
    this.normalizeCurrentTurn(room);
    this.startTurnTimer(room);
    this.broadcastUpdate(room);
  }

  private async checkGameEnd(room: LiveRoom): Promise<boolean> {
    let winner: GameWinner = null;
    const players = Array.from(room.players.values());
    const aliveImpostors = players.filter((player) => player.role === "IMPOSTOR" && player.alive);
    const aliveCrewmates = players.filter((player) => player.role === "CREWMATE" && player.alive);

    if (room.chess.isCheckmate()) {
      winner = room.chess.turn() === "b" ? "CREWMATES" : "IMPOSTOR";
    } else if (aliveImpostors.length === 0) {
      winner = "CREWMATES";
    } else if (aliveImpostors.length >= aliveCrewmates.length) {
      winner = "IMPOSTOR";
    }

    if (!winner) return false;

    room.status = "FINISHED";
    room.winner = winner;
    this.clearTurnTimer(room);
    this.clearMeetingTimer(room);

    if (room.gameId) {
      await prisma.game.update({
        where: { id: room.gameId },
        data: {
          winner,
          moveHistory: room.moveHistory as unknown as Prisma.InputJsonValue,
          voteHistory: room.voteHistory as unknown as Prisma.InputJsonValue,
          endedAt: new Date(),
          stats: {
            create: Array.from(room.players.values()).map((player) => ({
              userId: player.id,
              role: player.role ?? "CREWMATE",
              result:
                (winner === "IMPOSTOR" && player.role === "IMPOSTOR") ||
                (winner === "CREWMATES" && player.role === "CREWMATE")
                  ? "WON"
                  : "LOST",
              movesPlayed: player.movesPlayed,
              captures: player.captures,
              blunders: 0,
              mistakes: 0,
              accuracy: 0
            }))
          }
        }
      });
    }

    const snapshot = this.gameSnapshot(room);
    this.broadcast(room.roomCode, "game-over", snapshot);

    // ── Auto-reset to lobby after 10 seconds ─────────────────────────────────
    // DB-3: resetRoomToLobby is async; catch errors to prevent unhandled rejection
    setTimeout(() => {
      this.resetRoomToLobby(room).catch((err) =>
        console.error("[liveGame] resetRoomToLobby failed:", err)
      );
    }, 10_000);

    return true;
  }

  /** Reset a finished room back to LOBBY so all players can play again */
  private async resetRoomToLobby(room: LiveRoom) {
    if (room.status !== "FINISHED") return;

    room.status = "LOBBY";
    room.chess = new Chess();
    room.moveHistory = [];
    room.voteHistory = [];
    room.chat = [];
    room.winner = null;
    room.gameId = null;
    room.turnOrder = [];
    room.currentTurnIndex = 0;
    room.turnEndsAt = null;
    room.meeting = { phase: "NONE", calledById: null, phaseEndsAt: null, votes: [], whiteMovesSinceMeeting: 0 };

    // Reset player state; remove players who disconnected during the game
    for (const [id, player] of room.players) {
      if (!player.connected) {
        room.players.delete(id);
        this.userToRoom.delete(id);
      } else {
        player.alive = true;
        player.role = null;
        player.ready = false;
        player.movesPlayed = 0;
        player.captures = 0;
        player.disconnectedAt = null;
      }
    }

    // Ensure host is still a valid player
    if (!room.players.has(room.hostId)) {
      const first = room.players.keys().next().value as string | undefined;
      if (first) room.hostId = first;
    }

    try {
      await prisma.room.update({ where: { id: room.id }, data: { status: "LOBBY" } });
    } catch { /* room may have been deleted */ }

    // Send room-updated so clients navigate back to lobby
    this.broadcast(room.roomCode, "room-updated", this.roomSnapshot(room));
  }

  private assertCanMove(room: LiveRoom, userId: string) {
    if (room.status !== "IN_GAME") throw new Error("Game is not active.");
    if (room.meeting.phase !== "NONE") throw new Error("Board is locked during meetings.");
    if (room.chess.turn() !== "w") throw new Error("It is not White's turn.");
    if (this.currentPlayerId(room) !== userId) throw new Error("It is not your turn.");
    if (!this.requirePlayer(room, userId).alive) throw new Error("Eliminated players cannot move.");
  }

  private advanceTurn(room: LiveRoom) {
    const order = room.turnOrder;
    for (let offset = 1; offset <= order.length; offset += 1) {
      const nextIndex = (room.currentTurnIndex + offset) % order.length;
      const player = room.players.get(order[nextIndex]!);
      if (player?.alive) {
        room.currentTurnIndex = nextIndex;
        return;
      }
    }
  }

  private normalizeCurrentTurn(room: LiveRoom) {
    if (this.currentPlayerId(room)) return;
    this.advanceTurn(room);
  }

  private currentPlayerId(room: LiveRoom) {
    const playerId = room.turnOrder[room.currentTurnIndex];
    const player = playerId ? room.players.get(playerId) : null;
    return player?.alive ? player.id : null;
  }

  private startTurnTimer(room: LiveRoom) {
    this.clearTurnTimer(room);
    const seconds = (room.settings as any).turnTimer ?? 30;
    room.turnEndsAt = Date.now() + seconds * 1000;
    room.timers.turn = setTimeout(() => {
      void this.autoMove(room);
    }, seconds * 1000);
    // REL-3: Removed broadcastUpdate from here — every caller already calls
    // broadcastUpdate after startTurnTimer, so this was a duplicate broadcast.
    // Callers: afterWhiteMove, finishVoting, startGame — all call broadcastUpdate.
  }

  private clearTurnTimer(room: LiveRoom) {
    if (room.timers.turn) clearTimeout(room.timers.turn);
    room.timers.turn = null;
    room.turnEndsAt = null;
  }

  private setMeetingTimer(room: LiveRoom, callback: () => void) {
    this.clearMeetingTimer(room);
    const delay = Math.max(0, (room.meeting.phaseEndsAt ?? Date.now()) - Date.now());
    room.timers.meeting = setTimeout(callback, delay);
  }

  private clearMeetingTimer(room: LiveRoom) {
    if (room.timers.meeting) clearTimeout(room.timers.meeting);
    room.timers.meeting = null;
  }

  private meetingAvailable(room: LiveRoom) {
    return room.meeting.phase === "NONE" && room.meeting.whiteMovesSinceMeeting >= room.settings.meetingCooldown;
  }

  private alivePlayers(room: LiveRoom) {
    return Array.from(room.players.values()).filter((player) => player.alive);
  }

  private roomSnapshot(room: LiveRoom): RoomSnapshot {
    return {
      id: room.id,
      roomCode: room.roomCode,
      hostId: room.hostId,
      status: room.status,
      settings: room.settings,
      players: Array.from(room.players.values()).map((player): LobbyPlayer => ({
        id: player.id,
        username: player.username,
        avatar: player.avatar,
        connected: player.connected,
        ready: player.ready,
        isHost: player.id === room.hostId
      }))
    };
  }

  private gameSnapshot(room: LiveRoom): GameSnapshot {
    const currentPlayerId = this.currentPlayerId(room);
    const impostors = Array.from(room.players.values()).filter((player) => player.role === "IMPOSTOR");
    return {
      roomCode: room.roomCode,
      roomName: room.settings.roomName,
      hostId: room.hostId,
      status: room.status,
      fen: room.chess.fen(),
      players: Array.from(room.players.values()).map((player) => ({
        id: player.id,
        username: player.username,
        avatar: player.avatar,
        alive: player.alive,
        connected: player.connected,
        isCurrentTurn: player.id === currentPlayerId,
        movesPlayed: player.movesPlayed
      })),
      currentPlayerId,
      turnEndsAt: room.turnEndsAt ? new Date(room.turnEndsAt).toISOString() : null,
      moveHistory: room.moveHistory,
      chat: room.chat,
      meeting: {
        phase: room.meeting.phase,
        calledById: room.meeting.calledById,
        phaseEndsAt: room.meeting.phaseEndsAt ? new Date(room.meeting.phaseEndsAt).toISOString() : null,
        votes: room.meeting.votes,
        movesUntilAvailable: Math.max(0, room.settings.meetingCooldown - room.meeting.whiteMovesSinceMeeting),
        available: this.meetingAvailable(room)
      },
      winner: room.winner,
      impostorId: room.status === "FINISHED" ? impostors[0]?.id : undefined,
      impostorIds: room.status === "FINISHED" ? impostors.map(imp => imp.id) : undefined
    };
  }

  private broadcastUpdate(room: LiveRoom) {
    this.broadcast(
      room.roomCode,
      room.status === "LOBBY" ? "room-updated" : "game-updated",
      room.status === "LOBBY" ? this.roomSnapshot(room) : this.gameSnapshot(room)
    );
  }

  private requireRoom(roomCode: string) {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) throw new Error("Room not found.");
    return room;
  }

  private requirePlayer(room: LiveRoom, userId: string) {
    const player = room.players.get(userId);
    if (!player) throw new Error("Player is not in this room.");
    return player;
  }

  private shuffle<T>(items: T[]): T[] {
    return [...items].sort(() => Math.random() - 0.5);
  }
}
