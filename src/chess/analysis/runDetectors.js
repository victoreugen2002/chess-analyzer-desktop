import { Chess } from "chess.js";

import {
  detectMateThreat,
  detectBattery,
  detectAttack,
  detectHangingPiece,
  detectMaterialLoss,
  detectMaterialGain,
  detectMoveToSafety,
} from "../detectors";

function normalize(d) {
  if (!d) return null;

  const base = {
    priority: d.priority ?? 99,
    severity: d.severity ?? 1,
    targets: d.targets ?? [],
    tags: d.tags ?? {},
  };

  switch (d.type) {
    case "mateInOne":
      return {
        type: "mateThreat",
        ...base,
        priority: 1,
        severity: 3,
        tags: {
          ...base.tags,
          mate: true,
          opponent: d.side === "opponent",
        },
      };

    case "materialLoss":
      return {
        type: "materialLoss",
        ...base,
        priority: 2,
        severity: 3,
      };

    case "materialGain":
      return {
        type: "materialGain",
        ...base,
        priority: 2,
        severity: 2,
      };

    case "moveToSafety":
      return {
        type: "moveToSafety",
        ...base,
        priority: 2,
        severity: 2,
      };

    case "hanging":
    case "pressure":
    case "enemyPressure":
      return {
        type: "attack",
        ...base,
        priority: 2,
        severity: 3,
      };

    case "battery":
      return {
          type: "battery",
          ...base,
          priority: 3,
          severity: 2,
      };

    case "attack":
      return {
        type: "attack",
        ...base,
        priority: 3,
        severity: 2,
      };

    default:
      return {
        type: d.type || "unknown",
        ...base,
      };
  }
}

function resolveConflicts(signals) {
  const hasMate = signals.some((s) => s.type === "mateThreat");

  if (hasMate) {
    return signals.filter((s) => s.type === "mateThreat");
  }

  return signals;
}

export function runDetectors(features) {
  let chessBefore = null;
  let chessAfter = null;
  let playedMove = null;

  try {
    chessBefore = new Chess(features.fenBefore);
    chessAfter = new Chess(features.fenBefore);
    playedMove = chessAfter.move(features.san, { sloppy: true });
  } catch {
    chessBefore = null;
    chessAfter = null;
    playedMove = null;
  }


  const raw = [
    detectMateThreat(features),

    detectMoveToSafety({
      chessBefore,
      chessAfter,
      move: playedMove,
      
    }),

    detectBattery(features),

    detectMaterialGain(features),

    detectAttack({
      ...features,
      chessAfter,
      move: playedMove,

    }),

    detectMaterialLoss(features),
    detectHangingPiece(features),


  ].filter(Boolean);

  const normalized = raw.map(normalize).filter(Boolean);
  const cleaned = resolveConflicts(normalized);

  cleaned.sort((a, b) => a.priority - b.priority);

  return cleaned;
}