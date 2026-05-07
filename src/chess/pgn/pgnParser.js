import { Chess } from "chess.js";

const DEFAULT_FEN = new Chess().fen();

export function getHeaders(chess) {
  return typeof chess.header === "function" ? chess.header() : {};
}

function getInitialFenFromHeaders(headers = {}) {
  const fen = headers.FEN || headers.Fen || headers.fen;
  return typeof fen === "string" && fen.trim() ? fen.trim() : DEFAULT_FEN;
}

function createChessFromFen(fen) {
  return new Chess(fen || DEFAULT_FEN);
}

export function loadPgnStrict(chess, pgn) {
  try {
    const ok = chess.loadPgn(pgn);
    if (!ok) console.warn("PGN parse failed, but continuing");
  } catch (e) {
    console.warn("PGN parse error:", e);
  }
}

export function buildMoveObjectsFromFen(fen) {
  const chess = createChessFromFen(fen);
  const normalizedFen = chess.fen();

  return {
    headers: {
      SetUp: "1",
      FEN: normalizedFen,
    },
    result: "*",
    moves: [],
    initialFen: normalizedFen,
  };
}

export function buildMoveObjectsFromPgn(pgn) {
  const chess = new Chess();

  loadPgnStrict(chess, pgn);

  const headers = getHeaders(chess);
  const initialFen = getInitialFenFromHeaders(headers);
  const verboseMoves = chess.history({ verbose: true });
  const replay = createChessFromFen(initialFen);

  const moves = verboseMoves.map((move, index) => {
    const fenBefore = replay.fen();
    const side = replay.turn();

    replay.move(move);

    return {
      id: index,
      ply: index + 1,
      fullmove: Math.ceil((index + 1) / 2),
      side,
      san: move.san,
      lan: `${move.from}${move.to}${move.promotion || ""}`,
      fenBefore,
      fenAfter: replay.fen(),
    };
  });

  return {
    headers,
    result: headers?.Result || "*",
    moves,
    initialFen,
  };
}