import { Chess } from "chess.js";

export function fenToBoardRows(fen) {
  const placement = fen.split(" ")[0];
  return placement.split("/").map((row) => {
    const squares = [];
    for (const char of row) {
      if (/\d/.test(char)) {
        for (let i = 0; i < Number(char); i++) squares.push(null);
      } else {
        const color = char === char.toUpperCase() ? "w" : "b";
        squares.push(`${color}${char.toLowerCase()}`);
      }
    }
    return squares;
  });
}

export function getPieceValue(piece) {
  if (!piece) return 0;

  const type = piece[1];

  if (type === "p") return 1;
  if (type === "n") return 3;
  if (type === "b") return 3;
  if (type === "r") return 5;
  if (type === "q") return 9;
  return 0;
}

export function evaluateMaterial(fen) {
  const rows = fenToBoardRows(fen);
  let white = 0;
  let black = 0;

  rows.forEach((row) => {
    row.forEach((piece) => {
      if (!piece) return;
      const value = getPieceValue(piece);
      if (piece[0] === "w") white += value;
      else black += value;
    });
  });

  return { white, black, diff: white - black };
}

export function findKing(rows, color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (rows[r][c] === `${color}k`) {
        return { row: r, col: c };
      }
    }
  }
  return null;
}

export function evaluateKingShield(fen, color) {
  const rows = fenToBoardRows(fen);
  const king = findKing(rows, color);
  if (!king) return 0;

  const dir = color === "w" ? -1 : 1;
  let shield = 0;

  for (let dc = -1; dc <= 1; dc++) {
    const r = king.row + dir;
    const c = king.col + dc;

    if (r < 0 || r > 7 || c < 0 || c > 7) continue;

    const piece = rows[r][c];
    if (piece === `${color}p`) shield += 1;
  }

  return shield;
}

export function moveToHuman(move, fen) {
  if (!move || move === "—") return "another move";

  try {
    const chess = new Chess(fen);
    const result = chess.move({
      from: move.slice(0, 2),
      to: move.slice(2, 4),
      promotion: move[4] || undefined,
    });

    if (result?.san) {
      return result.san;
    }

    return move;
  } catch {
    return move;
  }
}

export function uciMoveToSan(chess, uci) {
  if (!uci || uci.length < 4) return null;

  const moveObj = {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
  };

  if (uci.length > 4) {
    moveObj.promotion = uci[4];
  }

  const move = chess.move(moveObj);
  return move ? move.san : null;
}

export function uciLineToSan({ fen, uciLine, maxMoves = 8 }) {
  if (!fen || !uciLine) return "";

  try {
    const chess = new Chess(fen);
    const moves = uciLine.trim().split(/\s+/).slice(0, maxMoves);
    const sanMoves = [];

    for (const uci of moves) {
      if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(uci)) break;

      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promotion = uci[4];

      const result = chess.move({
        from,
        to,
        promotion: promotion || undefined,
      });

      if (!result) break;

      sanMoves.push(result.san);
    }

    return sanMoves.join(" ");
  } catch {
    return "";
  }
}

export function uciLineToSanLine(fen, line, maxMoves = 8) {
  if (!fen || !line || line === "—") return "—";

  try {
    const chess = new Chess(fen);
    const uciMoves = line.split(/\s+/).filter(Boolean).slice(0, maxMoves);
    const sanMoves = [];

    for (const uci of uciMoves) {
      const san = uciMoveToSan(chess, uci);
      if (!san) break;
      sanMoves.push(san);
    }

    return sanMoves.length ? sanMoves.join(" ") : "—";
  } catch {
    return line;
  }
}