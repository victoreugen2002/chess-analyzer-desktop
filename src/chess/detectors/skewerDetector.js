import { PIECE_VALUES } from "../core/pieces";
import { squareToCoords, coordsToSquare } from "../utils";
import { getDefendersOfSquare } from "../features/attacks";

const LINE_DIRECTIONS = {
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  q: [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]],
};

function getSafeDefenders(chess, square, color) {
  try {
    return getDefendersOfSquare(chess, square, color) || [];
  } catch {
    return [];
  }
}

function isRearCaptureMateriallyRelevant({ chess, attacker, rear, enemyColor }) {
  if (!chess || !attacker || !rear || !enemyColor) return false;

  const attackerValue = PIECE_VALUES[attacker.type] || 0;
  const rearValue = PIECE_VALUES[rear.type] || 0;
  const defenders = getSafeDefenders(chess, rear.square, enemyColor);
  const isRearDefended = defenders.length > 0;

  // A skewer should be more than a geometric line-up. If the rear piece is
  // defended and has the same/lower value than the attacking line piece,
  // capturing it is not a material win (for example bishop takes defended
  // knight). In that case, keep only the simpler "attacks the rook" signal.
  return !isRearDefended || rearValue > attackerValue;
}

function getAllSquares() {
  const squares = [];

  for (const file of "abcdefgh") {
    for (let rank = 1; rank <= 8; rank++) {
      squares.push(`${file}${rank}`);
    }
  }

  return squares;
}

function isSameSkewer(a, b) {
  return (
    a?.attacker?.square === b?.attacker?.square &&
    a?.front?.square === b?.front?.square &&
    a?.rear?.square === b?.rear?.square
  );
}

function findSkewers(chess, attackerColor) {
  const skewers = [];
  const enemyColor = attackerColor === "w" ? "b" : "w";

  for (const attackerSquare of getAllSquares()) {
    const attacker = chess.get(attackerSquare);

    if (!attacker || attacker.color !== attackerColor) continue;
    if (!["b", "r", "q"].includes(attacker.type)) continue;

    const start = squareToCoords(attackerSquare);
    const directions = LINE_DIRECTIONS[attacker.type] || [];

    for (const [df, dr] of directions) {
      let f = start.file + df;
      let r = start.rank + dr;
      let front = null;

      while (f >= 0 && f < 8 && r >= 0 && r < 8) {
        const square = coordsToSquare(f, r);
        const piece = chess.get(square);

        if (piece) {
          if (piece.color !== enemyColor) break;

          if (!front) {
            front = { ...piece, square };
          } else {
            const frontValue = PIECE_VALUES[front.type] || 0;
            const rearValue = PIECE_VALUES[piece.type] || 0;
            const rear = { ...piece, square };

            const frontIsImportant = ["k", "q", "r"].includes(front.type);
            const rearIsWorthMentioning = rearValue >= 3;
            const isRealSkewer =
              front.type === "k" || frontValue > rearValue;
            const rearCaptureIsRelevant = isRearCaptureMateriallyRelevant({
              chess,
              attacker,
              rear,
              enemyColor,
            });

            if (
              frontIsImportant &&
              rearIsWorthMentioning &&
              isRealSkewer &&
              rearCaptureIsRelevant
            ) {
              const frontIsKing = front.type === "k";
              const rearDefenders = getSafeDefenders(chess, rear.square, enemyColor);

              skewers.push({
                attacker: { ...attacker, square: attackerSquare },
                front,
                rear,
                rearIsDefended: rearDefenders.length > 0,
                rearDefenderCount: rearDefenders.length,
                strength: frontIsKing ? "xray" : "strong",
              });
            }

            break;
          }
        }

        f += df;
        r += dr;
      }
    }
  }

  return skewers;
}

function toSignal(skewer) {
  return {
    type: "skewer",
    targets: [
      {
        piece: skewer.front.type,
        square: skewer.front.square,
        value: PIECE_VALUES[skewer.front.type] || 0,
      },
      {
        piece: skewer.rear.type,
        square: skewer.rear.square,
        value: PIECE_VALUES[skewer.rear.type] || 0,
      },
    ],
    tags: {
      attacker: skewer.attacker.type,
      attackerSquare: skewer.attacker.square,
      frontIsKing: skewer.front.type === "k",
      strength: skewer.strength || "strong",
      rearIsDefended: Boolean(skewer.rearIsDefended),
      rearDefenderCount: skewer.rearDefenderCount || 0,
    },
  };
}

export function detectSkewer({ chessBefore, chessAfter, move } = {}) {
  if (!chessBefore || !chessAfter || !move?.color) return null;

  const ownColor = move.color;

  const before = findSkewers(chessBefore, ownColor);
  const after = findSkewers(chessAfter, ownColor);

  const newSkewer = after.find(
    (s) => !before.some((old) => isSameSkewer(old, s))
  );

  return newSkewer ? toSignal(newSkewer) : null;
}