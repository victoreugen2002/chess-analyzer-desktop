const { spawn } = require("child_process");
const path = require("path");

class StockfishEngine {
  constructor() {
    this.engine = null;
    this.currentResolve = null;
    this.lastScore = null;
    this.lastPv = null;
    this.pendingStart = null;
  }

  async start() {
    if (this.engine) return;
    if (this.pendingStart) return this.pendingStart;

    this.pendingStart = new Promise((resolve, reject) => {
      const enginePath = path.join(__dirname, "engines", "stockfish.exe");
      this.engine = spawn(enginePath);

      this.engine.stdout.on("data", (data) => {
        this.handleOutput(data.toString(), resolve);
      });

      this.engine.stderr.on("data", (data) => {
        console.error("Stockfish stderr:", data.toString());
      });

      this.engine.on("error", (err) => {
        console.error("Stockfish process error:", err);
        reject(err);
      });

      this.engine.stdin.write("uci\n");
    });

    return this.pendingStart;
  }

  handleOutput(text, startResolve = null) {
    const lines = text.split(/\r?\n/).filter(Boolean);

    for (const line of lines) {
      console.log("SF:", line);

      if (line === "uciok") {
        this.engine.stdin.write("isready\n");
        continue;
      }

      if (line === "readyok") {
        if (startResolve) startResolve();
        continue;
      }

      if (line.startsWith("info ")) {
        const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
        if (scoreMatch) {
          this.lastScore = {
            type: scoreMatch[1],
            value: parseInt(scoreMatch[2], 10),
          };
        }

        const pvMatch = line.match(/\spv\s(.+)$/);
        if (pvMatch) {
          this.lastPv = pvMatch[1].trim();
        }

        continue;
      }

      if (line.startsWith("bestmove ")) {
        const bestMoveMatch = line.match(/^bestmove (\S+)/);
        const bestMove = bestMoveMatch ? bestMoveMatch[1] : null;

        console.log("SF FINAL:", {
          bestMove,
          score: this.lastScore,
          pv: this.lastPv,
        });

        if (this.currentResolve) {
          this.currentResolve({
            bestMove,
            score: this.lastScore,
            pv: this.lastPv,
          });
          this.currentResolve = null;
        }
      }
    }
  }

  async analyzeFen(fen, depth = 15) {
    await this.start();

    return new Promise((resolve) => {
      this.currentResolve = resolve;
      this.lastScore = null;
      this.lastPv = null;

      this.engine.stdin.write("ucinewgame\n");
      this.engine.stdin.write(`position fen ${fen}\n`);
      this.engine.stdin.write(`go depth ${depth}\n`);
    });
  }

  async quit() {
    if (!this.engine) return;
    this.engine.stdin.write("quit\n");
    this.engine.kill();
    this.engine = null;
    this.pendingStart = null;
  }
}

module.exports = new StockfishEngine();