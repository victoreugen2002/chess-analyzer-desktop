import { PIECE_VALUES } from "../core/pieces";
import { squareToCoords, coordsToSquare } from "../utils";

const LINE_DIRECTIONS = {
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  q: [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]],
};

const IMPORTANT_TARGETS = ["k", "q", "r"];

function getAllSquares() {
  const squares = [];

  for (const file of "abcdefgh") {
    for (let rank = 1; rank <= 8; rank++) {
      squares.push(`${file}${rank}`);
    }
  }

  return squares;
}

function targetName(type) {
  if (type === "k") return "king";
  if (type === "q") return "queen";
  if (type === "r") return "rook";
  return "piece";
}

function isSamePin(a, b) {
  return (
    a?.attacker?.square === b?.attacker?.square &&
    a?.pinned?.square === b?.pinned?.square &&
    a?.target?.square === b?.target?.square &&
    a?.target?.type === b?.target?.type
  );
}

function toSignal(pin, type = "pin") {
  return {
    type,
    targets: [
      {
        piece: pin.pinned.type,
        square: pin.pinned.square,
        value: PIECE_VALUES[pin.pinned.type] || 0,
        isDefended: null,
      },
    ],
    tags: {
      pinnedTo: targetName(pin.target.type),
      attacker: pin.attacker.type,
      attackerSquare: pin.attacker.square,
      targetPiece: pin.target.type,
      targetSquare: pin.target.square,
      pinnedPiece: pin.pinned.type,
    },
  };
}

function findPins(chess, pinnedColor) {
  const pins = [];
  const attackerColor = pinnedColor === "w" ? "b" : "w";

  for (const attackerSquare of getAllSquares()) {
    const attacker = chess.get(attackerSquare);

    if (!attacker || attacker.color !== attackerColor) continue;
    if (!["b", "r", "q"].includes(attacker.type)) continue;

    const directions = LINE_DIRECTIONS[attacker.type] || [];
    const start = squareToCoords(attackerSquare);

    for (const [df, dr] of directions) {
      let f = start.file + df;
      let r = start.rank + dr;
      let pinned = null;

      while (f >= 0 && f < 8 && r >= 0 && r < 8) {
        const square = coordsToSquare(f, r);
        const piece = chess.get(square);

        if (piece) {
          if (piece.color !== pinnedColor) break;

          if (!pinned) {
            pinned = { ...piece, square };
          } else {
            const targetValue = PIECE_VALUES[piece.type] || 0;
            const pinnedValue = PIECE_VALUES[pinned.type] || 0;

            const isImportantTarget = IMPORTANT_TARGETS.includes(piece.type);
            const isUsefulRelativePin =
              piece.type === "k" || targetValue > pinnedValue;

            if (pinned.type === "p" && piece.type !== "k") {
              break;
            }

            if (isImportantTarget && isUsefulRelativePin) {
              pins.push({
                attacker: { ...attacker, square: attackerSquare },
                pinned,
                target: { ...piece, square },
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

  return pins;
}

export function detectPin({ chessBefore, chessAfter, move } = {}) {
  if (!chessBefore || !chessAfter || !move?.to) return null;

  const movedPiece = chessAfter.get(move.to);
  if (!movedPiece) return null;

  const enemyColor = movedPiece.color === "w" ? "b" : "w";

  const pinsBefore = findPins(chessBefore, enemyColor);
  const pinsAfter = findPins(chessAfter, enemyColor);

  const newPin = pinsAfter.find(
    (after) => !pinsBefore.some((before) => isSamePin(before, after))
  );

  return newPin ? toSignal(newPin, "pin") : null;
}

export function detectUnpin({ chessBefore, chessAfter, move } = {}) {
  if (!chessBefore || !chessAfter || !move?.color) return null;

  const ownColor = move.color;

  const pinsBefore = findPins(chessBefore, ownColor);
  const pinsAfter = findPins(chessAfter, ownColor);

  const removedPin = pinsBefore.find((before) => {
    const stillSamePiece = chessAfter.get(before.pinned.square);

    if (
      !stillSamePiece ||
      stillSamePiece.type !== before.pinned.type ||
      stillSamePiece.color !== before.pinned.color
    ) {
      return false;
    }

    return !pinsAfter.some((after) => isSamePin(before, after));
  });

  return removedPin ? toSignal(removedPin, "unpin") : null;
}