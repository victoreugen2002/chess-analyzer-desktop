import { PIECE_VALUES } from "../core/pieces";
import { isSquareDefended } from "../utils";

export function detectMaterialGain(features) {
  if (!features?.capturedPiece || !features?.to) return null;

  const value = PIECE_VALUES[features.capturedPiece] || 0;

  const isRecapture = features?.previousSan?.includes("x");
  const materialChange = features?.materialChange ?? 0;

  // ❌ NU e gain dacă e recapture sau schimb egal
  if (isRecapture || Math.abs(materialChange) < 0.5) {
    return null;
  }

  return {
    type: "materialGain",
    targets: [
      {
        piece: features.capturedPiece,
        square: features.to,
        value,
        isDefended: false,
      },
    ],
  };
}
export function detectMaterialLoss(features) {
  const loss = features.materialChange;
  if (!Number.isFinite(loss) || loss >= 0) return null;

  const piece = features.capturedPiece || "p";
  const value = PIECE_VALUES[piece] || 0;

  return {
    type: "materialLoss",
    targets: features?.to
      ? [
          {
            piece,
            square: features.to,
            value,
            isDefended: false,
          },
        ]
      : [],
  };
}