export const PIECE_VALUES = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 100,
};

export const PIECE_NAMES = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

export function getPieceName(piece) {
  console.log("getPieceName input:", piece);
  if (!piece) return "";

  const type = typeof piece === "string" ? piece : piece.type;

  return PIECE_NAMES[type] || "";
}

export function getPieceValue(piece) {
  if (!piece) return 0;

  const type = typeof piece === "string" ? piece : piece.type;

  return PIECE_VALUES[type] || 0;
}
