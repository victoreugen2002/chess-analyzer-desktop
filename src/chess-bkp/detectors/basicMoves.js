import { getPieceName } from "../core/pieces";

export function detectBasicMove({ chessAfter, move, previousSan } = {}) {
  if (!move) return null;

  const san = move.san || "";

  // 1. Castling
  if (san === "O-O" || san === "O-O-O") {
    return {
      type: "castle",
      side: san === "O-O" ? "kingside" : "queenside",
    };
  }

  // 2. Check
  if (san.includes("+")) {
    return {
      type: "check",
    };
  }

  // 3. Capture / Recapture
  if (move.captured) {
    const isRecapture =
      previousSan?.includes("x") &&
      previousSan?.replace(/[+#?!]/g, "").slice(-2) === move.to;

    return {
      type: isRecapture ? "recapture" : "capture",
      targets: [
        {
          piece: move.captured,
          name: getPieceName(move.captured),
          square: move.to,
        },
      ],
    };
  }

  return null;
}