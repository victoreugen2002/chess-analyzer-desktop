import { PIECE_VALUES } from "../core/pieces";
import { getAttackedSquaresByPiece } from "../utils";

function getAllSquares() {
  const squares = [];

  for (const file of "abcdefgh") {
    for (let rank = 1; rank <= 8; rank++) {
      squares.push(`${file}${rank}`);
    }
  }

  return squares;
}

function getAttackers(chess, square, attackerColor) {
  return getAllSquares()
    .map((from) => ({ from, piece: chess.get(from) }))
    .filter(({ piece }) => piece?.color === attackerColor)
    .filter(({ from }) => getAttackedSquaresByPiece(chess, from).includes(square));
}

function getDefenders(chess, square, defenderColor) {
  return getAllSquares()
    .map((from) => ({ from, piece: chess.get(from) }))
    .filter(({ piece }) => piece?.color === defenderColor)
    .filter(({ from }) => from !== square)
    .filter(({ from }) => getAttackedSquaresByPiece(chess, from).includes(square));
}

export function detectProtectsAttackedPiece({ chessBefore, chessAfter, move } = {}) {
  if (!chessBefore || !chessAfter || !move?.from || !move?.to || !move?.color) {
    return null;
  }

  const ownColor = move.color;
  const enemyColor = ownColor === "w" ? "b" : "w";
  const protector = chessAfter.get(move.to);

  if (!protector || protector.color !== ownColor) return null;

  const candidates = [];

  for (const square of getAllSquares()) {
    if (square === move.from || square === move.to) continue;

    const pieceBefore = chessBefore.get(square);
    const pieceAfter = chessAfter.get(square);

    if (!pieceBefore || !pieceAfter) continue;
    if (pieceBefore.color !== ownColor || pieceAfter.color !== ownColor) continue;
    if (pieceBefore.type !== pieceAfter.type) continue;
    if (pieceAfter.type === "k") continue;

    const attackersBefore = getAttackers(chessBefore, square, enemyColor);
    if (!attackersBefore.length) continue;

    const defendersBefore = getDefenders(chessBefore, square, ownColor);
    const defendersAfter = getDefenders(chessAfter, square, ownColor);

    const movedPieceNowDefends = getAttackedSquaresByPiece(
      chessAfter,
      move.to
    ).includes(square);

    if (!movedPieceNowDefends) continue;
    if (defendersAfter.length <= defendersBefore.length) continue;

    candidates.push({
      piece: pieceAfter.type,
      square,
      value: PIECE_VALUES[pieceAfter.type] || 0,
      protector: protector.type,
    });
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => b.value - a.value);
  const best = candidates[0];

  return {
    type: "protectsAttackedPiece",
    targets: [
      {
        piece: best.piece,
        square: best.square,
        value: best.value,
      },
    ],
    tags: {
      protector: best.protector,
      protectorSquare: move.to,
    },
  };
}