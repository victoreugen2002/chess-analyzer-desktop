const { app } = require("electron");
const { spawn } = require("child_process");
const path = require("path");

class StockfishEngine {
  constructor() {
    this.engine = null;
    this.currentResolve = null;

    this.lastScore = null;
    this.lastPv = "";
    this.bestMove = null;

    this.pendingStart = null;
    this.buffer = "";
  }

  async start() {
    if (this.engine) return;
    if (this.pendingStart) return this.pendingStart;

    this.pendingStart = new Promise((resolve, reject) => {
      const enginePath = app.isPackaged
      ? path.join(process.resourcesPath, "engines", "stockfish.exe")
      : path.join(__dirname, "engines", "stockfish.exe");
      this.engine = spawn(enginePath);

      this.engine.stdout.on("data", (data) => {
        this.handleOutput(data.toString(), resolve);
      });

      this.engine.stderr.on("data", (data) => {
        console.error("Stockfish stderr:", data.toString());
      });

      this.engine.on("error", reject);

      this.engine.stdin.write("uci\n");
    });

    return this.pendingStart;
  }

  handleOutput(text, startResolve = null) {
    this.buffer += text;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop();

    for (const line of lines) {
      if (!line) continue;

      console.log("SF:", line);

      // INIT
      if (line === "uciok") {
        this.engine.stdin.write("isready\n");
        continue;
      }

      if (line === "readyok") {
        if (startResolve) {
          startResolve();
          this.pendingStart = null;
        }
        continue;
      }

      // INFO: score + principal variation
      if (line.startsWith("info ")) {
        const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);

        if (scoreMatch) {
          this.lastScore = {
            type: scoreMatch[1],
            value: Number(scoreMatch[2]),
          };
        }

        const pvIndex = line.indexOf(" pv ");
        if (pvIndex !== -1) {
          const pv = line.slice(pvIndex + 4).trim();

          if (pv) {
            this.lastPv = pv;
          }
        }

        continue;
      }

      // FINAL BEST MOVE
      if (line.startsWith("bestmove ")) {
        const match = line.match(/^bestmove\s+(\S+)/);
        const bestMove = match && match[1] !== "(none)" ? match[1] : null;

        const result = {
          bestMove: bestMove || this.lastPv?.split(" ")[0] || null,
          score: this.lastScore,
          pv: this.lastPv || null,
        };

        console.log("SF FINAL:", result);

        if (this.currentResolve) {
          this.currentResolve(result);
          this.currentResolve = null;
        }

        continue;
      }
    }
  }
  async analyzeFen(fen, depth = 15) {
    await this.start();

    return new Promise((resolve) => {
      this.currentResolve = resolve;

      this.lastScore = null;
      this.lastPv = "";
      this.bestMove = null;

      console.log("ANALYZE FEN:", fen);

      this.engine.stdin.write("ucinewgame\n");
      this.engine.stdin.write("setoption name MultiPV value 1\n");
      this.engine.stdin.write(`position fen ${fen}\n`);
      this.engine.stdin.write(`go depth ${depth}\n`);
    });
  }

  async getBestMove(fen, elo = 1200, depth = 10) {
    await this.start();

    return new Promise((resolve) => {
      this.currentResolve = resolve;

      this.lastScore = null;
      this.lastPv = "";
      this.bestMove = null;

      const safeElo = Math.max(800, Math.min(elo, 2800));

      console.log("GET BEST MOVE:", { fen, elo: safeElo, depth });

      this.engine.stdin.write("ucinewgame\n");
      this.engine.stdin.write("setoption name UCI_LimitStrength value true\n");
      this.engine.stdin.write(`setoption name UCI_Elo value ${safeElo}\n`);
      this.engine.stdin.write("setoption name MultiPV value 1\n");
      this.engine.stdin.write(`position fen ${fen}\n`);
      this.engine.stdin.write(`go depth ${depth}\n`);
    });
  }

  // async getHumanLikeMove(fen, elo = 1900, depth = 11) {
  //   await this.start();

  //   // temporar: folosește best move normal
  //   // apoi îl facem MultiPV corect
  //   const result = await this.getBestMove(fen, elo, depth);

  //   return result;
  // }

  async quit() {
    if (!this.engine) return;

    this.engine.stdin.write("quit\n");
    this.engine.kill();

    this.engine = null;
    this.currentResolve = null;
    this.pendingStart = null;
  }
}

module.exports = {
  StockfishEngine,
  createStockfishEngine: () => new StockfishEngine(),
};

