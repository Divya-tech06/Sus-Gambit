import { Chess } from "chess.js";
import type { BotDifficulty } from "@chess-impostor/shared";
import stockfish from "stockfish";

export async function chooseBotMove(
  chess: Chess,
  difficulty: BotDifficulty
): Promise<{ from: string; to: string; promotion?: string } | null> {
  return new Promise(async (resolve) => {
    let resolved = false;
    let engine: any = null;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        if (engine) {
          try {
            engine.terminate();
          } catch (e) {
            console.error("Error terminating stockfish", e);
          }
        }
        // Fallback to a random legal move if Stockfish times out
        const moves = chess.moves({ verbose: true });
        if (moves.length > 0) {
          const move = moves[Math.floor(Math.random() * moves.length)]!;
          resolve({ from: move.from, to: move.to, promotion: move.promotion });
        } else {
          resolve(null);
        }
      }
    }, 8000);

    try {
      engine = await stockfish();

      engine.print = (line: string) => {
        if (resolved) return;
        if (line.startsWith("bestmove")) {
          resolved = true;
          clearTimeout(timeout);
          try {
            engine.terminate();
          } catch (e) {
            console.error("Error terminating stockfish", e);
          }
          const parts = line.split(" ");
          const moveStr = parts[1];
          if (moveStr && moveStr !== "(none)") {
            const from = moveStr.substring(0, 2);
            const to = moveStr.substring(2, 4);
            const promotion = moveStr.length > 4 ? moveStr.substring(4, 5) : undefined;
            resolve({ from, to, promotion });
          } else {
            resolve(null);
          }
        }
      };

      engine.printErr = () => {
        // Suppress stockfish debug messages
      };

      engine.sendCommand("uci");
      engine.sendCommand("setoption name UCI_LimitStrength value true");
      engine.sendCommand("setoption name UCI_Elo value " + difficulty);
      engine.sendCommand("position fen " + chess.fen());
      engine.sendCommand("go depth 8");
    } catch (error) {
      console.error("Failed to run stockfish:", error);
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        const moves = chess.moves({ verbose: true });
        if (moves.length > 0) {
          const move = moves[Math.floor(Math.random() * moves.length)]!;
          resolve({ from: move.from, to: move.to, promotion: move.promotion });
        } else {
          resolve(null);
        }
      }
    }
  });
}
