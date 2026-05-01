import { PIECE_VALUES } from "../core/pieces";
import { isSquareDefended } from "../utils";

export function detectMaterialGain(features) {
  if (!features?.capturedPiece || !features?.to) return null;

  const value = PIECE_VALUES[features.capturedPiece] || 0;

  return {
    type: "materialGain",
    targets: [
      {
        piece: features.capturedPiece,
        square: features.to,
        value,
        isDefended: false, // capturată deja
      },
    ],
    tags: {
      recapture: features?.previousSan?.includes("x"),
    },
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