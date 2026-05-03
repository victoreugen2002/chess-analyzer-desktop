import { PIECE_VALUES } from "../core/pieces";
import { squareToCoords, coordsToSquare } from "../utils";

const LINE_DIRECTIONS = {
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  q: [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]],
};

export function detectPin({ chessAfter, move } = {}) {
  if (!chessAfter || !move?.to) return null;

  const attacker = chessAfter.get(move.to);
  if (!attacker || !["b", "r", "q"].includes(attacker.type)) return null;

  const enemyColor = attacker.color === "w" ? "b" : "w";
  const directions = LINE_DIRECTIONS[attacker.type] || [];
  const start = squareToCoords(move.to);

  for (const [df, dr] of directions) {
    let f = start.file + df;
    let r = start.rank + dr;
    let pinned = null;

    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const square = coordsToSquare(f, r);
      const piece = chessAfter.get(square);

      if (piece) {
        if (piece.color === attacker.color) break;

        if (!pinned) {
          pinned = { ...piece, square };
        } else {
          if (piece.color === enemyColor && piece.type === "k") {
            return {
              type: "pin",
              targets: [
                {
                  piece: pinned.type,
                  square: pinned.square,
                  value: PIECE_VALUES[pinned.type] || 0,
                  isDefended: null,
                },
              ],
              tags: {
                pinnedTo: "king",
                attacker: attacker.type,
              },
            };
          }

          break;
        }
      }

      f += df;
      r += dr;
    }
  }

  return null;
}