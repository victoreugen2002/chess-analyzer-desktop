import { PIECE_VALUES } from "../core/pieces";
import {
  getAttackedSquaresByPiece,
  isSquareDefended,
} from "../utils";

function getAllSquares() {
  const squares = [];

  for (const file of "abcdefgh") {
    for (let rank = 1; rank <= 8; rank++) {
      squares.push(`${file}${rank}`);
    }
  }

  return squares;
}

function findKingSquare(chess, color) {
  for (const square of getAllSquares()) {
    const piece = chess.get(square);
    if (piece?.type === "k" && piece.color === color) return square;
  }

  return null;
}

export function detectFork({ chessAfter, move } = {}) {
  if (!chessAfter || !move?.to || !move?.color) return null;

  const movedPiece = chessAfter.get(move.to);
  if (!movedPiece) return null;

  const ownColor = move.color;
  const enemyColor = ownColor === "w" ? "b" : "w";
  const attackerValue = PIECE_VALUES[movedPiece.type] || 0;

  const attackedSquares = getAttackedSquaresByPiece(chessAfter, move.to);
  const enemyKingSquare = findKingSquare(chessAfter, enemyColor);

  const directlyChecksKing =
    enemyKingSquare && attackedSquares.includes(enemyKingSquare);

  const moveGivesCheck = /[+#]/.test(move.san || "");

  const targets = [];

  for (const square of attackedSquares) {
    const target = chessAfter.get(square);
    if (!target || target.color !== enemyColor || target.type === "k") continue;

    const value = PIECE_VALUES[target.type] || 0;
    const isDefended = isSquareDefended(chessAfter, square, enemyColor);

    const isImportant =
      target.type === "q" ||
      target.type === "r" ||
      value > attackerValue ||
      (value >= 3 && !isDefended);

    if (!isImportant) continue;

    targets.push({
      piece: target.type,
      square,
      value,
      isDefended,
    });
  }

  if (!targets.length) return null;

  const isFork = directlyChecksKing || targets.length >= 2;
  const isDoubleAttack = moveGivesCheck && targets.length >= 1;

  if (!isFork && !isDoubleAttack) return null;

  targets.sort((a, b) => b.value - a.value);

  return {
    type: "fork",
    targets,
    tags: {
      attacker: movedPiece.type,
      from: move.from,
      to: move.to,
      includesCheck: moveGivesCheck,
      directCheck: directlyChecksKing,
      kind: directlyChecksKing || targets.length >= 2 ? "fork" : "doubleAttack",
    },
  };
}