import { Chess, type Move } from "chess.js";
import type { BotDifficulty } from "@chess-impostor/shared";

const PIECE_VALUE: Record<string, number> = {
  p: 100,
  n: 300,
  b: 320,
  r: 500,
  q: 900,
  k: 0
};

const DEPTH: Record<BotDifficulty, number> = {
  BEGINNER: 1,
  EASY: 2,
  MEDIUM: 4
};

function scoreMove(move: Move, depth: number): number {
  const capture = move.captured ? PIECE_VALUE[move.captured] ?? 0 : 0;
  const promotion = move.promotion ? PIECE_VALUE[move.promotion] ?? 0 : 0;
  const tacticalNoise = depth === 1 ? Math.random() * 150 : Math.random() * 40;
  return capture + promotion + tacticalNoise;
}

export async function chooseBotMove(chess: Chess, difficulty: BotDifficulty): Promise<Move | null> {
  const legalMoves = chess.moves({ verbose: true });
  if (legalMoves.length === 0) return null;

  const depth = DEPTH[difficulty];
  const ranked = legalMoves
    .map((move) => ({ move, score: scoreMove(move, depth) }))
    .sort((a, b) => b.score - a.score);

  const poolSize = difficulty === "BEGINNER" ? legalMoves.length : difficulty === "EASY" ? 4 : 2;
  const pool = ranked.slice(0, Math.min(poolSize, ranked.length));
  await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000));
  return pool[Math.floor(Math.random() * pool.length)]?.move ?? legalMoves[0] ?? null;
}
