import { Chess } from "chess.js";

import { getAttackedEnemyPieces } from "../features/attacks";
import { getHangingPieces } from "../features/hangingPieces";
import { getBatteryPatterns } from "../features/tactics";

function sameBatteryPattern(a, b) {
  return (
    a.frontPiece?.square === b.frontPiece?.square &&
    a.supporter?.square === b.supporter?.square &&
    (a.targetSquare || a.target?.square) ===
      (b.targetSquare || b.target?.square)
  );
}

export function extractFeatures({ fenBefore, fenAfter, san, side, previousSan}) {
  const enemySide = side === "w" ? "b" : "w";

  let from = null;
  let to = null;
  let capturedPiece = null;

  try {
    const chess = new Chess(fenBefore);
    const move = chess.move(san, { sloppy: true });

    from = move?.from || null;
    to = move?.to || null;
    capturedPiece = move?.captured || null;
  } catch {}


  const attackedEnemyPieces = getAttackedEnemyPieces(fenBefore, san, side);

  const ownHangingBefore = getHangingPieces(fenBefore, side);
  const ownHangingAfter = getHangingPieces(fenAfter, side);

  const enemyHangingBefore = getHangingPieces(fenBefore, enemySide);
  const enemyHangingAfter = getHangingPieces(fenAfter, enemySide);

  const ownHangingPieces = ownHangingAfter.filter(
    (after) =>
      !ownHangingBefore.some((before) => before.square === after.square)
  );

  const movedPieceHanging = ownHangingAfter.find(
    (piece) => piece.square === to
  );

  const enemyHangingPieces = enemyHangingAfter.filter(
    (after) =>
      !enemyHangingBefore.some((before) => before.square === after.square)
  );

  const batteryBefore = getBatteryPatterns(fenBefore, side);
  const batteryAfter = getBatteryPatterns(fenAfter, side);

  const batteryAttacks = batteryAfter.filter(
    (after) => !batteryBefore.some((before) => sameBatteryPattern(before, after))
  );

  return {
    fenBefore,
    fenAfter,
    san,
    side,

    from,
    to,
    capturedPiece,

    attackedEnemyPieces,

    ownHangingPieces,
    ownHangingBefore,
    ownHangingAfter,

    movedPieceHanging,
    enemyHangingPieces,

    previousSan,
    enemyHangingBefore,
    enemyHangingAfter,

    batteryAttacks,
  };
}