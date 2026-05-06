import { PIECE_VALUES } from "../core/pieces";
import {
  getAttackedSquaresByPiece,
  isSquareDefended,
  squareToCoords,
  coordsToSquare,
} from "../utils";

const LINE_DIRECTIONS = {
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  q: [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]],
};

function getAllSquares() {
  const squares = [];
  for (const file of "abcdefgh") {
    for (let rank = 1; rank <= 8; rank++) {
      squares.push(`${file}${rank}`);
    }
  }
  return squares;
}

function getSquaresBetween(from, to) {
  const a = squareToCoords(from);
  const b = squareToCoords(to);

  const df = b.file - a.file;
  const dr = b.rank - a.rank;

  const isStraight = df === 0 || dr === 0;
  const isDiagonal = Math.abs(df) === Math.abs(dr);

  if (!isStraight && !isDiagonal) return [];

  const stepF = Math.sign(df);
  const stepR = Math.sign(dr);

  const squares = [];
  let f = a.file + stepF;
  let r = a.rank + stepR;

  while (f !== b.file || r !== b.rank) {
    squares.push(coordsToSquare(f, r));
    f += stepF;
    r += stepR;
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

export function detectDiscoveredCheck({ chessBefore, chessAfter, move } = {}) {
  if (
    !chessBefore ||
    !chessAfter ||
    !move?.from ||
    !move?.to ||
    !/[+#]/.test(move.san || "")
  ) {
    return null;
  }

  const ownColor = move.color;
  const enemyColor = ownColor === "w" ? "b" : "w";
  const enemyKingSquare = findKingSquare(chessAfter, enemyColor);

  if (!enemyKingSquare) return null;

  for (const attackerSquare of getAllSquares()) {
    const attackerAfter = chessAfter.get(attackerSquare);
    const attackerBefore = chessBefore.get(attackerSquare);

    if (!attackerAfter || attackerAfter.color !== ownColor) continue;
    if (!["b", "r", "q"].includes(attackerAfter.type)) continue;
    if (attackerSquare === move.to) continue;

    if (
      !attackerBefore ||
      attackerBefore.color !== ownColor ||
      attackerBefore.type !== attackerAfter.type
    ) {
      continue;
    }

    const attacksKingAfter = getAttackedSquaresByPiece(
      chessAfter,
      attackerSquare
    ).includes(enemyKingSquare);

    const attackedKingBefore = getAttackedSquaresByPiece(
      chessBefore,
      attackerSquare
    ).includes(enemyKingSquare);

    if (!attacksKingAfter || attackedKingBefore) continue;

    const between = getSquaresBetween(attackerSquare, enemyKingSquare);
    if (!between.includes(move.from)) continue;

    return {
      type: "discoveredCheck",
      tags: {
        attacker: attackerAfter.type,
        attackerSquare,
        kingSquare: enemyKingSquare,
        discoveredBy: move.piece,
        from: move.from,
        to: move.to,
      },
    };
  }

  return null;
}

export function detectDiscoveredAttack({ chessBefore, chessAfter, move } = {}) {
  if (!chessBefore || !chessAfter || !move?.from || !move?.to || !move?.color) {
    return null;
  }

  const ownColor = move.color;
  const enemyColor = ownColor === "w" ? "b" : "w";

  const candidates = [];

  for (const attackerSquare of getAllSquares()) {
    const attackerAfter = chessAfter.get(attackerSquare);
    const attackerBefore = chessBefore.get(attackerSquare);

    if (!attackerAfter || attackerAfter.color !== ownColor) continue;
    if (!["b", "r", "q"].includes(attackerAfter.type)) continue;
    if (attackerSquare === move.to) continue;

    if (
      !attackerBefore ||
      attackerBefore.color !== ownColor ||
      attackerBefore.type !== attackerAfter.type
    ) {
      continue;
    }

    const directions = LINE_DIRECTIONS[attackerAfter.type];

    for (const [df, dr] of directions) {
      const start = squareToCoords(attackerSquare);
      let f = start.file + df;
      let r = start.rank + dr;

      while (f >= 0 && f < 8 && r >= 0 && r < 8) {
        const square = coordsToSquare(f, r);
        const target = chessAfter.get(square);

        if (!target) {
          f += df;
          r += dr;
          continue;
        }

        if (target.color === ownColor || target.type === "k") break;

        const targetBefore = chessBefore.get(square);
        if (!targetBefore || targetBefore.color !== enemyColor) break;

        const between = getSquaresBetween(attackerSquare, square);
        if (!between.includes(move.from)) break;

        const wasAlreadyAttacking = getAttackedSquaresByPiece(
          chessBefore,
          attackerSquare
        ).includes(square);

        if (wasAlreadyAttacking) break;

        const targetValue = PIECE_VALUES[target.type] || 0;
        const attackerValue = PIECE_VALUES[attackerAfter.type] || 0;
        const isDefended = isSquareDefended(chessAfter, square, enemyColor);

        if (target.type === "q" || targetValue > attackerValue || !isDefended) {
          candidates.push({
            attacker: attackerAfter,
            attackerSquare,
            target,
            targetSquare: square,
            targetValue,
            isDefended,
          });
        }

        break;
      }
    }
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => b.targetValue - a.targetValue);
  const best = candidates[0];

  return {
    type: "discoveredAttack",
    targets: [
      {
        piece: best.target.type,
        square: best.targetSquare,
        value: best.targetValue,
        isDefended: best.isDefended,
      },
    ],
    tags: {
      attacker: best.attacker.type,
      attackerSquare: best.attackerSquare,
    },
  };
}