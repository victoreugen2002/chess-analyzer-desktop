import { PIECE_VALUES } from "../core/pieces";
import { getAttackedSquaresByPiece } from "../utils";
import { getAttackersOfSquare, getDefendersOfSquare } from "../features/attacks";
import { isRealAttackThreat, getThreatDetails } from "../analysis/threatValidation";

export function detectAttack({ chessAfter, move, san, moveIndex } = {}) {
  if (!chessAfter || !move?.to) return null;

  const movedPiece = chessAfter.get(move.to);
  if (!movedPiece) return null;

  const enemyColor = movedPiece.color === "w" ? "b" : "w";

  const attackedSquares = getAttackedSquaresByPiece(chessAfter, move.to);
  const targets = [];

  for (const square of attackedSquares) {
    const target = chessAfter.get(square);
    if (!target || target.color !== enemyColor) continue;
    if (target.type === "k") continue;

    if (
      !isRealAttackThreat({
        chessAfter,
        square,
        target,
        attackerColor: movedPiece.color,
        movedPiece,
      })
    ) {
      continue;
    }

    const defenders = getDefendersOfSquare(chessAfter, square, enemyColor);
    const attackers = getAttackersOfSquare(chessAfter, square, movedPiece.color);
    const targetValue = PIECE_VALUES[target.type] || 0;
    const attackerValue = PIECE_VALUES[movedPiece.type] || 0;
    const threatDetails = getThreatDetails({
      chessAfter,
      square,
      target,
      attackerColor: movedPiece.color,
      movedPiece,
    });

    targets.push({
      piece: target.type,
      square,
      value: targetValue,
      isDefended: defenders.length > 0,
      attackers: attackers.length,
      defenders: defenders.length,
      attacker: movedPiece.type,
      attackerValue,
      cheapestAttackerValue: threatDetails?.cheapestAttackerValue || attackerValue,
      isMajorTarget: threatDetails?.isMajorTarget || false,
    });
  }

  const filteredTargets = targets.filter((target) => target.square !== move.to);

  if (!filteredTargets.length) return null;

  return {
    type: "attack",
    targets: filteredTargets,
    tags: {
      attacker: movedPiece.type,
      attackerValue: PIECE_VALUES[movedPiece.type] || 0,
      from: move.from,
      to: move.to,
    },
  };
}
