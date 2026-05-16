import { PIECE_VALUES, getPieceName } from "../core/pieces";
import { getAttackedSquaresByPiece } from "../utils";
import { getAttackersOfSquare, getDefendersOfSquare } from "../features/attacks";

export function getCheapestValue(pieces = [], fallback = 99) {
  const values = pieces
    .map((piece) => PIECE_VALUES[piece?.type] || piece?.value || 0)
    .filter((value) => value > 0);

  return values.length ? Math.min(...values) : fallback;
}

export function getThreatDetails({ chessAfter, square, target, attackerColor, movedPiece } = {}) {
  if (!chessAfter || !square || !target || !attackerColor || !movedPiece) return null;
  if (target.type === "k") return null;

  const defenderColor = target.color;
  const attackers = getAttackersOfSquare(chessAfter, square, attackerColor);
  const defenders = getDefendersOfSquare(chessAfter, square, defenderColor);

  if (!attackers.length) return null;

  const targetValue = PIECE_VALUES[target.type] || 0;
  const movedPieceValue = PIECE_VALUES[movedPiece.type] || 0;
  const cheapestAttackerValue = getCheapestValue(attackers, movedPieceValue || 99);

  const isUndefended = defenders.length === 0;
  const attackersOutnumberDefenders = attackers.length > defenders.length;
  const favorableCapture = targetValue > cheapestAttackerValue;
  const isMajorTarget = ["q", "r"].includes(target.type);

  return {
    targetValue,
    movedPieceValue,
    cheapestAttackerValue,
    attackers,
    defenders,
    attackerCount: attackers.length,
    defenderCount: defenders.length,
    isUndefended,
    attackersOutnumberDefenders,
    favorableCapture,
    isMajorTarget,
  };
}

export function isRealAttackThreat({ chessAfter, square, target, attackerColor, movedPiece } = {}) {
  const details = getThreatDetails({
    chessAfter,
    square,
    target,
    attackerColor,
    movedPiece,
  });

  if (!details) return false;

  // Pawns create lots of noisy geometric attacks. Mention them only when the
  // pawn is genuinely loose, or when a pawn break creates real pressure.
  // Example: Qa5 may geometrically attack e5, but if e5 is defended and the
  // cheapest attacker is not a pawn, that is usually commentary noise.
  if (target.type === "p") {
    const hasPawnAttacker = details.attackers.some((attacker) => attacker?.type === "p");

    return (
      details.isUndefended ||
      (details.attackersOutnumberDefenders && hasPawnAttacker)
    );
  }

  // Attacks on major pieces are usually relevant as tempi even when defended.
  // For minor pieces, avoid comments like "bishop attacks a defended knight"
  // unless the target is loose, outnumbered, or materially favorable to capture.
  return (
    details.isMajorTarget ||
    details.isUndefended ||
    details.attackersOutnumberDefenders ||
    details.favorableCapture
  );
}

export function getMoveAttackText(chessAfter, move) {
  if (!chessAfter || !move?.to || !move?.color) return "";

  const movedPiece = chessAfter.get(move.to);
  if (!movedPiece) return "";

  const enemyColor = move.color === "w" ? "b" : "w";
  const attackedSquares = getAttackedSquaresByPiece(chessAfter, move.to);

  const targets = attackedSquares
    .map((square) => ({ square, piece: chessAfter.get(square) }))
    .filter(({ piece }) => piece?.color === enemyColor && piece.type !== "k")
    .map(({ square, piece }) => {
      const details = getThreatDetails({
        chessAfter,
        square,
        target: piece,
        attackerColor: move.color,
        movedPiece,
      });

      return {
        piece: piece.type,
        square,
        value: PIECE_VALUES[piece.type] || 0,
        rawPiece: piece,
        details,
      };
    })
    .filter((target) =>
      isRealAttackThreat({
        chessAfter,
        square: target.square,
        target: target.rawPiece,
        attackerColor: move.color,
        movedPiece,
      })
    )
    .sort((a, b) => b.value - a.value);

  const target = targets[0];
  if (!target) return "";

  const name = getPieceName(target.piece) || "piece";
  return `This attacks the ${name} on ${target.square}`;
}
