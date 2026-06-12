import { Chess } from "chess.js";
import type { BotDifficulty } from "@chess-impostor/shared";
import stockfish from "stockfish";

let engine: any = null;
let initPromise: Promise<any> | null = null;

let bestmoveResolve: ((move: string | null) => void) | null = null;

let searchQueue: Promise<any> = Promise.resolve();

function initEngine(): Promise<any> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const eng = await stockfish();

    eng.printErr = () => { };

    // ──────────────────────────────────────────────────────────────────────
    // FIX: The stockfish npm WASM build routes ALL output through
    //      `eng.listener`, NOT through `eng.print`.
    //
    //      eng.print is a wrapper:  function(e){ c.listener ? c.listener(e) : console.log(e) }
    //      where `c` IS `eng` itself.  Overwriting `eng.print` replaces only
    //      that wrapper on the object; the internal Emscripten code still calls
    //      `c.listener` (i.e. `eng.listener`) directly.
    //
    //      Setting `eng.print` after the engine resolves has no effect on where
    //      output is delivered — `uciok` / `readyok` / `bestmove` lines are
    //      never seen by the overwritten handler, so initEngine() hangs forever.
    //
    //      The correct property to set is `eng.listener`.
    // ──────────────────────────────────────────────────────────────────────

    // Install the permanent bestmove listener first.
    eng.listener = (line: string) => {
      if (line.startsWith("bestmove")) {
        if (bestmoveResolve) {
          const parts = line.split(" ");
          const moveStr = parts[1] ?? null;
          const cb = bestmoveResolve;
          bestmoveResolve = null;      // consume before calling to avoid re-entry
          cb(moveStr === "(none)" ? null : moveStr);
        }
      }
    };

    // Run the UCI handshake: uci → uciok → isready → readyok
    await new Promise<void>((resolve, reject) => {
      // 10-second guard so initEngine() can never hang indefinitely.
      const initTimeout = setTimeout(() => {
        reject(new Error("[bot] Stockfish init timed out waiting for readyok"));
      }, 10_000);

      const permanentListener = eng.listener;

      eng.listener = (line: string) => {
        console.log("[SF]", line);

        if (line === "uciok") {
          console.log("[bot] got uciok – sending isready");
          eng.sendCommand("isready");
        }

        if (line === "readyok") {
          console.log("[bot] got readyok – engine ready");
          clearTimeout(initTimeout);
          // Restore the permanent bestmove listener before resolving so
          // no bestmove lines are missed during the transition.
          eng.listener = permanentListener;
          resolve();
        }
      };

      eng.sendCommand("uci");
    });

    engine = eng;
    return eng;
  })();

  initPromise.catch(() => {
    initPromise = null;
    engine = null;
  });

  return initPromise;
}


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

  const myTurn = searchQueue.then(() => runSearch(chess, difficulty, randomMove));
  searchQueue = myTurn.catch(() => undefined);
  return myTurn;
}

async function runSearch(
  chess: Chess,
  difficulty: BotDifficulty,
  randomMove: () => { from: string; to: string; promotion?: string } | null
): Promise<{ from: string; to: string; promotion?: string } | null> {
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
      engine = null;
      initPromise = null;
      resolve(randomMove());
    }
  });
}
