// electron/preload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("engineApi", {
  analyzeFen: async (fen, depth = 15, side = "w") => {
    return await ipcRenderer.invoke("engine:analyze-fen", { fen, depth, side });
  },

  analyzeGame: async (positions, depth = 15) => {
    return await ipcRenderer.invoke("engine:analyze-game", { positions, depth });
  },

  getBestMove: async (fen, elo = 1200, depth = 10) => {
    return await ipcRenderer.invoke("engine:get-best-move", { fen, elo, depth });
  },
});
