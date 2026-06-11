export type Role = "CREWMATE" | "IMPOSTOR";
export type RoomStatus = "LOBBY" | "IN_GAME" | "FINISHED";
export type RoomVisibility = "PUBLIC" | "PRIVATE";
export type BotDifficulty = 1300 | 1400 | 1500 | 1600 | 1700 | 1800 | 1900 | 2000 | 2100 | 2200 | 2300 | 2400 | 2500 | 2600 | 2700;
export type MeetingPhase = "NONE" | "DISCUSSION" | "VOTING" | "RESULTS";
export type GameWinner = "CREWMATES" | "IMPOSTOR" | null;

export interface RoomSettings {
  roomName: string;
  playerCount: 4 | 5 | 6 | 7 | 8;
  botDifficulty: BotDifficulty;
  meetingCooldown: 5 | 7 | 10;
  votingTimer: 30 | 60 | 90;
  discussionTimer: 30 | 60 | 120;
  visibility: RoomVisibility;
}

export interface PublicUser {
  id: string;
  username: string;
  avatar: string | null;
}

export interface LobbyPlayer extends PublicUser {
  ready: boolean;
  connected: boolean;
  isHost: boolean;
}

export interface GamePlayer extends PublicUser {
  alive: boolean;
  connected: boolean;
  isCurrentTurn: boolean;
  movesPlayed: number;
}

export interface ChatMessage {
  id: string;
  roomCode: string;
  userId: string;
  username: string;
  body: string;
  createdAt: string;
  system?: boolean;
}

export interface VoteRecord {
  voterId: string;
  targetId: string | "SKIP";
}

export interface MoveRecord {
  san: string;
  from: string;
  to: string;
  by: "WHITE" | "BLACK";
  playerId?: string;
  fen: string;
  createdAt: string;
}

export interface RoomSnapshot {
  id: string;
  roomCode: string;
  hostId: string;
  status: RoomStatus;
  settings: RoomSettings;
  players: LobbyPlayer[];
}

export interface GameSnapshot {
  roomCode: string;
  roomName: string;
  status: RoomStatus;
  fen: string;
  players: GamePlayer[];
  currentPlayerId: string | null;
  turnEndsAt: string | null;
  moveHistory: MoveRecord[];
  chat: ChatMessage[];
  meeting: {
    phase: MeetingPhase;
    calledById: string | null;
    phaseEndsAt: string | null;
    votes: VoteRecord[];
    movesUntilAvailable: number;
    available: boolean;
  };
  winner: GameWinner;
  impostorId?: string;
}

export interface AuthPayload {
  accessToken: string;
  refreshToken: string;
  user: PublicUser & {
    email: string;
    gamesPlayed: number;
    gamesWon: number;
    gamesLost: number;
    impostorWins: number;
    crewmateWins: number;
  };
}

export interface ServerToClientEvents {
  "room-updated": (room: RoomSnapshot) => void;
  "game-updated": (game: GameSnapshot) => void;
  "role-assigned": (role: Role) => void;
  "receive-message": (message: ChatMessage) => void;
  "vote-results": (payload: { eliminatedUserId: string | null; votes: VoteRecord[] }) => void;
  "player-eliminated": (payload: { userId: string }) => void;
  "game-over": (game: GameSnapshot) => void;
  "error-message": (message: string) => void;
}

export interface ClientToServerEvents {
  "join-room": (payload: { roomCode: string }, ack?: Ack<RoomSnapshot>) => void;
  "leave-room": (payload: { roomCode: string }, ack?: Ack<void>) => void;
  "player-ready": (payload: { roomCode: string; ready: boolean }, ack?: Ack<RoomSnapshot>) => void;
  "start-game": (payload: { roomCode: string }, ack?: Ack<GameSnapshot>) => void;
  "make-move": (payload: { roomCode: string; from: string; to: string; promotion?: string }, ack?: Ack<GameSnapshot>) => void;
  "send-message": (payload: { roomCode: string; body: string }, ack?: Ack<ChatMessage>) => void;
  "call-meeting": (payload: { roomCode: string }, ack?: Ack<GameSnapshot>) => void;
  "cast-vote": (payload: { roomCode: string; targetId: string | "SKIP" }, ack?: Ack<GameSnapshot>) => void;
  "reconnect-player": (payload: { roomCode: string }, ack?: Ack<GameSnapshot | RoomSnapshot>) => void;
}

export type Ack<T> = (response: { ok: true; data: T } | { ok: false; error: string }) => void;

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  roomName: "Suspicious Sicilian",
  playerCount: 5,
  botDifficulty: 1500,
  meetingCooldown: 5,
  votingTimer: 60,
  discussionTimer: 60,
  visibility: "PUBLIC"
};
