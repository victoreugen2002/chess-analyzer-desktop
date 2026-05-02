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




export function squareToCoords(square) {
  return {
    file: square.charCodeAt(0) - 97,
    rank: 8 - Number(square[1]),
  };
}

export function coordsToSquare(file, rank) {
  return String.fromCharCode(97 + file) + (8 - rank);
}

export function getAttackedSquaresByPiece(chess, square) {
  const piece = chess.get(square);
  if (!piece) return [];

  const { file, rank } = squareToCoords(square);
  const squares = [];

  const add = (f, r) => {
    if (f >= 0 && f < 8 && r >= 0 && r < 8) {
      squares.push(coordsToSquare(f, r));
    }
  };

  if (piece.type === "p") {
    const dir = piece.color === "w" ? -1 : 1;
    add(file - 1, rank + dir);
    add(file + 1, rank + dir);
    return squares;
  }

  if (piece.type === "n") {
    [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]]
      .forEach(([df, dr]) => add(file + df, rank + dr));
    return squares;
  }

  if (piece.type === "k") {
    [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]]
      .forEach(([df, dr]) => add(file + df, rank + dr));
    return squares;
  }

  const directions = [];

  if (piece.type === "b" || piece.type === "q") {
    directions.push([1,1], [1,-1], [-1,1], [-1,-1]);
  }

  if (piece.type === "r" || piece.type === "q") {
    directions.push([1,0], [-1,0], [0,1], [0,-1]);
  }

  for (const [df, dr] of directions) {
    let f = file + df;
    let r = rank + dr;

    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const sq = coordsToSquare(f, r);
      squares.push(sq);

      if (chess.get(sq)) break;

      f += df;
      r += dr;
    }
  }

  return squares;
}

export function isSquareDefended(chess, square, defenderColor) {
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const ranks = ["1", "2", "3", "4", "5", "6", "7", "8"];

  for (const file of files) {
    for (const rank of ranks) {
      const from = `${file}${rank}`;
      const piece = chess.get(from);

      if (!piece || piece.color !== defenderColor) continue;

      if (getAttackedSquaresByPiece(chess, from).includes(square)) {
        return true;
      }
    }
  }

  return false;
}