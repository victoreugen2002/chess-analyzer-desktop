import { Chess } from "chess.js";

export function getHeaders(chess) {
  if (typeof chess.getHeaders === "function") return chess.getHeaders();
  if (typeof chess.header === "function") return chess.header();
  return {};
}

export function loadPgnStrict(chess, pgn) {
  const result = chess.loadPgn(pgn);
  if (result === false) throw new Error("Invalid PGN");
}

export function buildMoveObjectsFromPgn(pgn) {
  const chess = new Chess();
  loadPgnStrict(chess, pgn);

  const verboseMoves = chess.history({ verbose: true });
  const replay = new Chess();

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

  const headers = getHeaders(chess);

  return {
    headers,
    result: headers.Result || "*",
    moves,
    initialFen: new Chess().fen(),
  };
}