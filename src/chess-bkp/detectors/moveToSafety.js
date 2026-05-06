import { isSquareDefended, getAttackedSquaresByPiece } from "../utils";

function getAttackers(chess, square, attackerColor) {
  const attackers = [];

  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece || piece.color !== attackerColor) continue;

      const attacked = getAttackedSquaresByPiece(chess, piece.square);
      if (attacked.includes(square)) {
        attackers.push(piece);
      }
    }
  }

  return attackers;
}

export function detectMoveToSafety({ chessBefore, chessAfter, move } = {}) {
  if (!chessBefore || !chessAfter || !move?.from || !move?.to) return null;

  const pieceBefore = chessBefore.get(move.from);
  if (!pieceBefore || pieceBefore.type === "p") return null;

  const enemyColor = pieceBefore.color === "w" ? "b" : "w";

  const attackers = getAttackers(chessBefore, move.from, enemyColor);
  const newAttackers = getAttackers(chessAfter, move.to, enemyColor);

  const wasAttacked = attackers.length > 0;
  const isNowSafe = newAttackers.length === 0;

  if (!wasAttacked || !isNowSafe) return null;

  const values = { p:1, n:3, b:3, r:5, q:9, k:100 };

  const bestAttacker = attackers.sort(
    (a, b) => values[a.type] - values[b.type]
  )[0];

  return {
    type: "moveToSafety",
    tags: {
      piece: pieceBefore.type,
      attacker: bestAttacker?.type,
    },
  };
}