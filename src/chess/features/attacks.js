import { Chess } from "chess.js";
import { getAttackedSquaresByPiece } from "../utils";
import { getPieceName } from "../core/pieces";

export function setFenTurn(fen, side) {
  const parts = fen.split(" ");
  parts[1] = side;
  return parts.join(" ");
}

export function canLegallyCaptureSquare(chess, from, targetSquare, attackerColor) {
  const test = new Chess(setFenTurn(chess.fen(), attackerColor));

  return test.moves({ square: from, verbose: true }).some(
    (move) => move.to === targetSquare
  );
}

function getPieces(chess, color) {
  const board = chess.board();
  const pieces = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece || piece.color !== color) continue;

      const square = String.fromCharCode(97 + c) + (8 - r);

      pieces.push({
        square,
        type: piece.type,
        color: piece.color,
      });
    }
  }

  return pieces;
}

export function getAttackersOfSquare(
  chess,
  square,
  attackerColor,
  requireLegal = true
) {
  const attackers = [];
  const pieces = getPieces(chess, attackerColor);

  for (const piece of pieces) {
    const attackedSquares = getAttackedSquaresByPiece(chess, piece.square);

    if (!attackedSquares.includes(square)) continue;

    if (
      requireLegal &&
      !canLegallyCaptureSquare(chess, piece.square, square, attackerColor)
    ) {
      continue;
    }

    attackers.push(piece);
  }

  return attackers;
}

export function getDefendersOfSquare(chess, square, defenderColor) {
  return getAttackersOfSquare(chess, square, defenderColor, false);
}

export function isAttackingMove(chess, san, side) {
  const move = chess.move(san, { sloppy: true });
  if (!move) return false;

  const attackers = getAttackersOfSquare(chess, move.to, side);
  return attackers.length > 0;
}

export function getAttackedEnemyPieces(fenBefore, san, side) {
  const chess = new Chess(fenBefore);
  const move = chess.move(san, { sloppy: true });

  if (!move) return [];

  const enemyColor = side === "w" ? "b" : "w";
  const enemyPieces = getPieces(chess, enemyColor);
  const attackedSquares = getAttackedSquaresByPiece(chess, move.to);

  return enemyPieces
    .filter((p) => attackedSquares.includes(p.square))
    .map((p) => ({
        ...p,
        name: getPieceName(p),
  }));
}