import { Chess } from "chess.js";
import {
  getAttackedSquaresByPiece,
  squareToCoords,
  coordsToSquare,
} from "../utils";

function areAlignedSquares(a, b, c) {
  const A = squareToCoords(a);
  const B = squareToCoords(b);
  const C = squareToCoords(c);

  const dx1 = B.file - A.file;
  const dy1 = B.rank - A.rank;
  const dx2 = C.file - B.file;
  const dy2 = C.rank - B.rank;

  if (dx1 === 0 && dy1 === 0) return false;
  if (dx2 === 0 && dy2 === 0) return false;

  return dx1 * dy2 === dy1 * dx2;
}

export function getBatteryPatterns(fenAfter, side) {
  const chess = new Chess(fenAfter);
  const board = chess.board();
  const pieces = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.color !== side) continue;

      pieces.push({
        square: coordsToSquare(c, r),
        type: p.type,
      });
    }
  }

  const linePieces = pieces.filter((p) => ["r", "b", "q"].includes(p.type));
  const patterns = [];

  for (const front of linePieces) {
    const attacked = getAttackedSquaresByPiece(chess, front.square);

    for (const supporter of linePieces) {
      if (supporter.square === front.square) continue;

      const supportSquares = getAttackedSquaresByPiece(chess, supporter.square);
      if (!supportSquares.includes(front.square)) continue;

      for (const enemySquare of attacked) {
        const target = chess.get(enemySquare);
        if (!target || target.color === side) continue;

        if (!areAlignedSquares(supporter.square, front.square, enemySquare)) {
          continue;
        }

        patterns.push({
          frontPiece: front,
          supporter,
          target: {
            type: target.type,
            square: enemySquare,
          },
          targetSquare: enemySquare,
        });
      }
    }
  }

  return patterns;
}