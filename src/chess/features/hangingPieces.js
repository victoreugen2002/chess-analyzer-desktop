import { Chess } from "chess.js";
import {
  getAttackersOfSquare,
  getDefendersOfSquare,
} from "./attacks";

function getPieces(chess, color) {
  const board = chess.board();
  const pieces = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.color !== color) continue;

      const square = String.fromCharCode(97 + c) + (8 - r);

      pieces.push({
        square,
        type: p.type,
        color: p.color,
        value: getValue(p.type),
      });
    }
  }

  return pieces;
}

function getValue(type) {
  switch (type) {
    case "p": return 1;
    case "n": return 3;
    case "b": return 3;
    case "r": return 5;
    case "q": return 9;
    default: return 0;
  }
}

export function getHangingPieces(fenAfter, side) {
  if (!fenAfter || !side) return [];

  const chess = new Chess(fenAfter);

  const enemyColor = side === "w" ? "b" : "w";
  const ownPieces = getPieces(chess, side);

  return ownPieces
    .filter((piece) => piece.type !== "k")
    .map((piece) => {
      const attackers = getAttackersOfSquare(
        chess,
        piece.square,
        enemyColor
      );

      const defenders = getDefendersOfSquare(
        chess,
        piece.square,
        side
      );

      const lowestAttackerValue = attackers.length
        ? Math.min(...attackers.map((p) => p.value))
        : null;

      const isHanging =
        attackers.length > 0 &&
        defenders.length === 0 &&
        piece.value >= 1;

      const isUnderPressure =
        attackers.length > defenders.length &&
        piece.value >= 3 &&
        lowestAttackerValue != null &&
        lowestAttackerValue <= piece.value;

      return {
        ...piece,
        attackers,
        defenders,
        lowestAttackerValue,
        isHanging,
        isUnderPressure,
      };
    })
    .filter((piece) => piece.isHanging || piece.isUnderPressure);
}