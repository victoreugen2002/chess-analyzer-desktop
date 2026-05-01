import { PIECE_VALUES } from "../core/pieces";
import {
  getAttackedSquaresByPiece,
  isSquareDefended,
} from "../utils";

export function detectAttack({ chessAfter, move, san, moveIndex } = {}) {
  if (!chessAfter || !move?.to) return null;

  const movedPiece = chessAfter.get(move.to);
  if (!movedPiece) return null;

  const attackerValue = PIECE_VALUES[movedPiece.type] || 0;
  const enemyColor = movedPiece.color === "w" ? "b" : "w";

  const attackedSquares = getAttackedSquaresByPiece(chessAfter, move.to);
  const targets = [];

  for (const square of attackedSquares) {
    const target = chessAfter.get(square);
    if (!target || target.color !== enemyColor) continue;

    const targetValue = PIECE_VALUES[target.type] || 0;
    const isDefended = isSquareDefended(chessAfter, square, enemyColor);

    const isGoodAttack =
      !isDefended || (isDefended && targetValue > attackerValue);

    if (isGoodAttack) {
      targets.push({
        piece: target.type,
        square,
        value: targetValue,
        isDefended,
      });
    }
  }

  if (!targets.length) return null;

  return {
    type: "attack",
    targets,
  };
}