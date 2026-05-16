import { Chess } from "chess.js";

const SAVED_GAMES_KEY = "chessAnalyzer.savedGames";
const UNFINISHED_GAMES_KEY = "chessAnalyzer.unfinishedGames";
const LAST_REVIEW_GAME_KEY = "lastReviewGame";

function hasStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson(key, fallback) {
  if (!hasStorage()) return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn(`Could not read ${key} from localStorage:`, error);
    return fallback;
  }
}

function writeJson(key, value) {
  if (!hasStorage()) return value;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Could not save ${key} to localStorage:`, error);
  }

  return value;
}

function getFinalFen(gameData) {
  const moves = Array.isArray(gameData?.moves) ? gameData.moves : [];
  return moves[moves.length - 1]?.fenAfter || gameData?.initialFen || null;
}

function cleanHeaderValue(value) {
  const text = String(value || "").trim();
  if (!text || text === "?" || text === "*") return "";
  return text;
}

function getDefaultPlayers(sourceMode, meta = {}) {
  const userName = cleanHeaderValue(meta.userName) || "You";

  if (sourceMode === "coach") {
    return { white: userName, black: cleanHeaderValue(meta.coachName) || "Coach" };
  }

  if (sourceMode === "play") {
    return { white: userName, black: cleanHeaderValue(meta.playerTwoName) || "Player 2" };
  }

  return { white: "White", black: "Black" };
}

function getGamePlayers(gameData, sourceMode = "unknown", meta = {}) {
  const headers = gameData?.headers || {};
  const defaults = getDefaultPlayers(sourceMode, meta);

  const white =
    cleanHeaderValue(meta.white) ||
    cleanHeaderValue(headers.White) ||
    defaults.white;

  const black =
    cleanHeaderValue(meta.black) ||
    cleanHeaderValue(headers.Black) ||
    defaults.black;

  return { white, black };
}

function inferRawResult(gameData) {
  const headers = gameData?.headers || {};
  const explicitResult = cleanHeaderValue(gameData?.result) || cleanHeaderValue(headers.Result);

  if (explicitResult && explicitResult !== "*") return explicitResult;

  const finalFen = getFinalFen(gameData);

  if (finalFen) {
    try {
      const chess = new Chess(finalFen);

      if (chess.isCheckmate()) {
        return chess.turn() === "w" ? "0-1" : "1-0";
      }

      if (chess.isDraw()) {
        return "1/2-1/2";
      }
    } catch {
      // Keep the explicit/unknown result below.
    }
  }

  return "*";
}

function getResultLabel(result) {
  switch (result) {
    case "1-0":
      return "White won";
    case "0-1":
      return "Black won";
    case "1/2-1/2":
      return "Draw";
    case "*":
    default:
      return "Ongoing";
  }
}

function buildTitle({ white, black }) {
  return `${white} vs ${black}`;
}

export function getSavedGameDisplayInfo(savedGame = {}) {
  const gameData = savedGame.gameData || {};
  const sourceMode = savedGame.sourceMode || "unknown";
  const meta = savedGame.meta || {};
  const players = getGamePlayers(gameData, sourceMode, meta);
  const result = savedGame.result || inferRawResult(gameData);
  const resultLabel = savedGame.resultLabel || getResultLabel(result);

  return {
    ...players,
    result,
    resultLabel,
    title: buildTitle(players),
  };
}

export function buildGameSnapshot({
  id,
  pgn,
  gameData,
  sourceMode = "unknown",
  analysis = [],
  meta = {},
} = {}) {
  const moves = Array.isArray(gameData?.moves) ? gameData.moves : [];
  const date = meta.date || new Date().toISOString();
  const players = getGamePlayers(gameData, sourceMode, meta);
  const result = inferRawResult(gameData);
  const resultLabel = getResultLabel(result);

  return {
    id: id || `game-${Date.now()}`,
    date,
    title: meta.title || buildTitle(players),
    sourceMode,
    pgn: pgn || "",
    gameData,
    initialFen: gameData?.initialFen || null,
    finalFen: getFinalFen(gameData),
    result,
    resultLabel,
    moveCount: moves.length,
    analysis,
    meta: {
      ...meta,
      white: players.white,
      black: players.black,
      resultLabel,
    },
  };
}

export function saveLastReviewGame(snapshot) {
  return writeJson(LAST_REVIEW_GAME_KEY, snapshot);
}

export function getLastReviewGame() {
  return readJson(LAST_REVIEW_GAME_KEY, null);
}

export function getUnfinishedGames() {
  const games = readJson(UNFINISHED_GAMES_KEY, []);
  return Array.isArray(games)
    ? games.filter((game) => game?.result === "*" && (game?.moveCount || 0) > 0)
    : [];
}

export function saveUnfinishedGame(snapshot, { limit = 30 } = {}) {
  if (!snapshot?.id) return snapshot;
  if (snapshot.result !== "*" || !snapshot.moveCount) return snapshot;

  const games = getUnfinishedGames();
  const withoutCurrent = games.filter((game) => game.id !== snapshot.id);
  const nextGames = [snapshot, ...withoutCurrent].slice(0, limit);

  writeJson(UNFINISHED_GAMES_KEY, nextGames);
  return snapshot;
}

export function deleteUnfinishedGame(gameId) {
  const games = getUnfinishedGames();
  const nextGames = games.filter((game) => game.id !== gameId);

  writeJson(UNFINISHED_GAMES_KEY, nextGames);
  return nextGames;
}

export function clearUnfinishedGames() {
  writeJson(UNFINISHED_GAMES_KEY, []);
  return [];
}

export function getSavedGames() {
  const games = readJson(SAVED_GAMES_KEY, []);
  return Array.isArray(games) ? games : [];
}

export function saveGame(snapshot, { limit = 100 } = {}) {
  if (!snapshot?.id) return snapshot;

  const games = getSavedGames();
  const withoutCurrent = games.filter((game) => game.id !== snapshot.id);
  const nextGames = [snapshot, ...withoutCurrent].slice(0, limit);

  writeJson(SAVED_GAMES_KEY, nextGames);
  return snapshot;
}

export function deleteGame(gameId) {
  const games = getSavedGames();
  const nextGames = games.filter((game) => game.id !== gameId);

  writeJson(SAVED_GAMES_KEY, nextGames);
  return nextGames;
}

export function clearSavedGames() {
  writeJson(SAVED_GAMES_KEY, []);
  return [];
}
