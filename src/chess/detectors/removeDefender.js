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
    .filter(({ from }) =>
      getAttackedSquaresByPiece(chess, from).includes(square)
    );
}

export function detectRemoveDefender({ chessBefore, chessAfter, move } = {}) {
  if (!chessBefore || !chessAfter || !move?.from || !move?.to || !move?.captured) {
    return null;
  }

  const ownColor = move.color;
  const enemyColor = ownColor === "w" ? "b" : "w";
  const capturedDefender = chessBefore.get(move.to);

  if (!capturedDefender || capturedDefender.color !== enemyColor) return null;

  const defenderAttackedSquares = getAttackedSquaresByPiece(chessBefore, move.to);
  const candidates = [];

  for (const square of getAllSquares()) {
    if (square === move.to) continue;

    const targetBefore = chessBefore.get(square);
    const targetAfter = chessAfter.get(square);

    if (!targetBefore || !targetAfter) continue;
    if (targetBefore.color !== enemyColor || targetAfter.color !== enemyColor) continue;
    if (targetBefore.type !== targetAfter.type) continue;
    if (targetAfter.type === "k") continue;

    const capturedPieceWasDefendingTarget =
      defenderAttackedSquares.includes(square);

    if (!capturedPieceWasDefendingTarget) continue;

    const attackersAfter = getAttackers(chessAfter, square, ownColor);
    if (!attackersAfter.length) continue;

    const defendersBefore = getAttackers(chessBefore, square, enemyColor);
    const defendersAfter = getAttackers(chessAfter, square, enemyColor);

    const lostDefender = defendersAfter.length < defendersBefore.length;
    const isUnderDefendedAfter = attackersAfter.length > defendersAfter.length;

    if (!lostDefender) continue;
    if (!isUnderDefendedAfter) continue;

    const targetValue = PIECE_VALUES[targetAfter.type] || 0;
    const vulnerability = attackersAfter.length - defendersAfter.length;

    candidates.push({
      piece: targetAfter.type,
      square,
      value: targetValue,
      defender: capturedDefender.type,
      defenderSquare: move.to,
      vulnerability,
      attackersAfter: attackersAfter.length,
      defendersAfter: defendersAfter.length,
    });
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    if (a.vulnerability !== b.vulnerability) {
      return b.vulnerability - a.vulnerability;
    }

    return b.value - a.value;
  });

  const best = candidates[0];

  return {
    type: "removeDefender",
    targets: [
      {
        piece: best.piece,
        square: best.square,
        value: best.value,
      },
    ],
    tags: {
      defender: best.defender,
      defenderSquare: best.defenderSquare,
      attackersAfter: best.attackersAfter,
      defendersAfter: best.defendersAfter,
    },
  };
}