// electron/main.js
const { Chess } = require("chess.js");
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { createStockfishEngine } = require("./stockfish");

const stockfishPlayer = createStockfishEngine();
const stockfishAnalysis = createStockfishEngine();
app.setAppUserModelId("ChessAnalyzerDesktop");

const isDev = !app.isPackaged;
let mainWindow = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: "#020617",
    autoHideMenuBar: true,
    icon: path.resolve(__dirname, "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));

  }

  mainWindow = win;
  win.on("closed", () => {
    mainWindow = null;
  });

  return win;
}

function normalizeEngineScore(score, fen) {
  if (!score) return null;

  let value;

  if (score.type === "mate") {
    value =
      score.value > 0
        ? 100000 - Math.abs(score.value) * 100
        : -100000 + Math.abs(score.value) * 100;
  } else if (score.type === "cp") {
    value = score.value;
  } else {
    return null;
  }

  const sideToMove = fen.split(" ")[1];
  return sideToMove === "w" ? value : -value;
}

app.whenReady().then(async () => {
  try {
    await stockfishPlayer.start();
    await stockfishAnalysis.start();
  } catch (error) {
    console.error("Failed to start Stockfish:", error);
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

ipcMain.handle("engine:analyze-fen", async (_event, { fen, depth = 15 }) => {
  const result = await stockfishAnalysis.analyzeFen(fen, depth);

  return {
    ...result,
    normalizedScore: normalizeEngineScore(result.score, fen),
  };
});
ipcMain.handle("engine:get-best-move", async (_event, { fen, elo = 1200, depth = 10 }) => {
  const result = await stockfishPlayer.getBestMove(fen, elo, depth);

  return {
    ...result,
    normalizedScore: normalizeEngineScore(result.score, fen),
  };
});

ipcMain.handle("engine:analyze-game", async (_event, { positions, depth = 15 }) => {
  const results = [];

  for (const position of positions) {
    const before = await stockfishAnalysis.analyzeFen(position.fenBefore, depth);
    const played = await stockfishAnalysis.analyzeFen(position.fenAfter, depth);

    let bestMoveEval = normalizeEngineScore(before.score, position.fenBefore);
    let bestMoveFen = null;

    if (before.bestMove && before.bestMove !== "(none)") {
      try {
        const bestChess = new Chess(position.fenBefore);

        const moveObj = {
          from: before.bestMove.slice(0, 2),
          to: before.bestMove.slice(2, 4),
        };

        if (before.bestMove.length > 4) {
          moveObj.promotion = before.bestMove[4];
        }

        const applied = bestChess.move(moveObj);

        if (applied) {
          bestMoveFen = bestChess.fen();
          const bestAfter = await stockfishAnalysis.analyzeFen(bestMoveFen, depth);
          bestMoveEval = normalizeEngineScore(bestAfter.score, bestMoveFen);
        }
      } catch (error) {
        console.error("Best move apply error:", error);
        bestMoveFen = null;
      }
    }

    const playedEval = normalizeEngineScore(played.score, position.fenAfter);

    const loss =
      bestMoveEval === null || playedEval === null
        ? null
        : position.side === "w"
          ? Math.max(0, bestMoveEval - playedEval)
          : Math.max(0, playedEval - bestMoveEval);

    results.push({
      ply: position.ply,
      side: position.side,
      san: position.san,
      fenBefore: position.fenBefore,
      fenAfter: position.fenAfter,
      bestMove: before.bestMove || "—",
      pv: before.pv || "—",
      bestLine: before.pv || "",
      playedLine: `${position.lan || ""} ${played.pv || ""}`.trim(),
      bestEval: bestMoveEval,
      playedEval,
      loss,
      lan: position.lan,
      bestMoveFen,
    });
  }

  return results;
});

app.on("window-all-closed", async () => {
  try {
    if (typeof stockfishPlayer.quit === "function") {
      await stockfishPlayer.quit();
    }
    if (typeof stockfishAnalysis.quit === "function") {
      await stockfishAnalysis.quit();
    }
  } catch {}

  if (process.platform !== "darwin") {
    app.quit();
  }
});
