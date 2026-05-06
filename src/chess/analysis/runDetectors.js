import { Chess } from "chess.js";
import { detectIgnoredAttack } from "../detectors/detectIgnoredAttack";
import {
  detectMateThreat,
  detectBattery,
  detectAttack,
  detectHangingPiece,
  detectMaterialLoss,
  detectMaterialGain,
  detectMoveToSafety,
  detectPin,
  detectUnpin,
  detectDiscoveredAttack,
  detectDiscoveredCheck,
  detectFork,
  detectSkewer,
  detectProtectsAttackedPiece,
  detectRemoveDefender,
  detectBasicMove,
} from "../detectors";

function normalize(d) {
  if (!d) return null;

  return {
    type: d.type === "mateInOne" ? "mateThreat" : d.type || "unknown",
    severity: d.severity ?? 1,
    targets: d.targets ?? [],
    tags: {
      ...(d.tags ?? {}),
      ...(d.type === "mateInOne"
        ? {
            mate: true,
            opponent: d.side === "opponent",
          }
        : {}),
    },
    piece: d.piece,
    side: d.side,

    reason: d.reason ?? null, // 👈 AICI
  };
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

  const rawSignals = [
    detectMateThreat(features),

    detectBasicMove({
      chessBefore,
      chessAfter,
      move: playedMove,
      previousSan: features.previousSan,
    }),

    detectDiscoveredCheck({
      chessBefore,
      chessAfter,
      move: playedMove,
    }),

    detectSkewer({
      chessBefore,
      chessAfter,
      move: playedMove,
    }),

    detectMoveToSafety({
      chessBefore,
      chessAfter,
      move: playedMove,
    }),

    detectProtectsAttackedPiece({
      chessBefore,
      chessAfter,
      move: playedMove,
    }),

    detectPin({
      chessBefore,
      chessAfter,
      move: playedMove,
    }),

    detectUnpin({
      chessBefore,
      chessAfter,
      move: playedMove,
    }),

    detectDiscoveredAttack({
      chessBefore,
      chessAfter,
      move: playedMove,
    }),

    detectBattery(features),

    detectMaterialGain(features),

    detectRemoveDefender({
      chessBefore,
      chessAfter,
      move: playedMove,
    }),

    detectFork({
      chessAfter,
      move: playedMove,
    }),

    detectAttack({
      ...features,
      chessAfter,
      move: playedMove,
    }),

    detectMaterialLoss(features),
    detectIgnoredAttack(features),
    detectHangingPiece(features),
  ].filter(Boolean);

  return rawSignals.map(normalize).filter(Boolean);
}