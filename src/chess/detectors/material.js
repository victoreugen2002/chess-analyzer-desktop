import { PIECE_VALUES } from "../core/pieces";


export function detectMaterialGain(features) {
  if (!features?.capturedPiece || !features?.to) return null;

  const value = PIECE_VALUES[features.capturedPiece] || 0;

  const isRecapture =
    features?.previousSan?.includes("x") &&
    features?.previousSan?.slice(-2) === features?.to;
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
  const hanging = features?.movedPieceHanging;
  if (!hanging || (hanging.value ?? 0) < 3) return null;

  const piece = hanging.type || hanging.piece;
  const hangingValue = PIECE_VALUES[piece] || hanging.value || 0;
  const capturedValue = PIECE_VALUES[features?.capturedPiece] || 0;

  // Dacă tocmai ai capturat o piesă de valoare egală sau mai mare,
  // nu e material loss, e schimb/captură calculată.
  if (features?.capturedPiece && capturedValue >= hangingValue) {
    return null;
  }

  return {
    type: "materialLoss",
    piece,
    square: hanging.square,
    reason: hanging.isDefended ? "recapture" : "undefended",
    targets: [
      {
        piece,
        name: hanging.name,
        square: hanging.square,
        value: hanging.value,
        isDefended: hanging.isDefended,
      },
    ],
  };
}