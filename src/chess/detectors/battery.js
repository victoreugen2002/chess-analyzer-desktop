import { Chess } from "chess.js";
import { PIECE_VALUES } from "../core/pieces";
import { isSquareDefended } from "../utils";

export function detectBattery(features) {
  const battery = features?.batteryAttacks?.[0];
  if (!battery || !battery.target) return null;

  if (
    battery.frontPiece?.square !== features.to &&
    battery.supporter?.square !== features.to
  ) {
    return null;
  }

  const target = battery.target;
  const targetValue = PIECE_VALUES[target.type] || 0;

  const chessAfter = new Chess(features.fenBefore);
  chessAfter.move(features.san, { sloppy: true });

  const isDefended = isSquareDefended(
    chessAfter,
    battery.targetSquare || target.square,
    target.color
  );

  const attackerValue = PIECE_VALUES[battery.frontPiece?.type] || 0;

  const isGood =
    !isDefended || (isDefended && targetValue > attackerValue);

  if (!isGood) return null;

  return {
    type: "battery",
    targets: [
      {
        piece: target.type,
        square: battery.targetSquare || target.square,
        value: targetValue,
        isDefended,
      },
    ],
  };
}