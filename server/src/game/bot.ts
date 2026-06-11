import { Chess } from "chess.js";
import type { BotDifficulty } from "@chess-impostor/shared";
import stockfish from "stockfish";

/**
 * ─── Stockfish Singleton ──────────────────────────────────────────────────────
 *
 * Rules:
 *  1. ONE engine instance for the server lifetime.
 *  2. Engine is initialised lazily on the first call.
 *  3. If an init is already in-flight we wait for the same promise.
 *  4. ALL output from the engine goes through one stable `engine.print` handler
 *     set at init time — we never replace it inside chooseBotMove.
 *  5. chooseBotMove is serialised: a second call waits until the first finishes.
 */

let engine: any = null;
/** Promise that resolves when the engine has completed the UCI handshake. */
let initPromise: Promise<any> | null = null;

/** The resolver for the currently pending bestmove search. */
let bestmoveResolve: ((move: string | null) => void) | null = null;

/** Serialisation: next call waits for the current search to complete. */
let searchQueue: Promise<any> = Promise.resolve();

function initEngine(): Promise<any> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const eng = await stockfish();

    // Silence debug noise
    eng.printErr = () => {};

    // ONE stable print handler — set once, never replaced
    eng.print = (line: string) => {
      if (line.startsWith("bestmove")) {
        if (bestmoveResolve) {
          const parts = line.split(" ");
          const moveStr = parts[1] ?? null;
          const cb = bestmoveResolve;
          bestmoveResolve = null;          // consume before calling to avoid re-entry
          cb(moveStr === "(none)" ? null : moveStr);
        }
      }
    };

    // UCI handshake: uci → (wait for uciok) → isready → (wait for readyok)
    await new Promise<void>((resolve) => {
      const origPrint = eng.print;
      eng.print = (line: string) => {
        origPrint(line);
        if (line === "uciok") {
          // Restore the stable handler, then send isready
          eng.print = origPrint;
          eng.sendCommand("isready");
        }
        if (line === "readyok") {
          eng.print = origPrint;
          resolve();
        }
      };
      eng.sendCommand("uci");
    });

    engine = eng;
    return eng;
  })();

  // If init fails, reset so the next call retries
  initPromise.catch(() => {
    initPromise = null;
    engine = null;
  });

  return initPromise;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function chooseBotMove(
  chess: Chess,
  difficulty: BotDifficulty
): Promise<{ from: string; to: string; promotion?: string } | null> {
  function randomMove() {
    const moves = chess.moves({ verbose: true });
    if (!moves.length) return null;
    const m = moves[Math.floor(Math.random() * moves.length)]!;
    return { from: m.from, to: m.to, promotion: m.promotion };
  }

  // Serialise: wait for any in-flight search before starting ours
  const myTurn = searchQueue.then(() => runSearch(chess, difficulty, randomMove));
  // Advance the queue — even if myTurn throws, the chain must continue
  searchQueue = myTurn.catch(() => undefined);
  return myTurn;
}

async function runSearch(
  chess: Chess,
  difficulty: BotDifficulty,
  randomMove: () => { from: string; to: string; promotion?: string } | null
): Promise<{ from: string; to: string; promotion?: string } | null> {
  // 4-second hard cap — fall back to random if engine hangs
  const TIMEOUT_MS = 4000;
  const moveTimeMs = Math.max(100, Math.min(800, (difficulty - 1300) * 25));

  let eng: any;
  try {
    eng = await initEngine();
  } catch (err) {
    console.error("[bot] Stockfish init failed:", err);
    return randomMove();
  }

  return new Promise((resolve) => {
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      bestmoveResolve = null;
      console.warn("[bot] Stockfish timed out – falling back to random move");
      try { eng.sendCommand("stop"); } catch { /* ignore */ }
      resolve(randomMove());
    }, TIMEOUT_MS);

    bestmoveResolve = (moveStr: string | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);

      if (!moveStr) {
        resolve(randomMove());
        return;
      }
      const from = moveStr.substring(0, 2);
      const to = moveStr.substring(2, 4);
      const promotion = moveStr.length > 4 ? moveStr.substring(4, 5) : undefined;
      resolve({ from, to, promotion });
    };

    try {
      eng.sendCommand("stop");                                          // cancel any leftover search
      eng.sendCommand("setoption name UCI_LimitStrength value true");
      eng.sendCommand(`setoption name UCI_Elo value ${difficulty}`);
      eng.sendCommand(`position fen ${chess.fen()}`);
      eng.sendCommand(`go movetime ${moveTimeMs}`);
    } catch (err) {
      clearTimeout(timer);
      done = true;
      bestmoveResolve = null;
      console.error("[bot] sendCommand error:", err);
      // Blow away the engine so next call re-inits
      engine = null;
      initPromise = null;
      resolve(randomMove());
    }
  });
}
