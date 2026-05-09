import { Chess } from "chess.js";
import { PIECE_VALUES } from "../core/pieces";
import {
  getAttackersOfSquare,
  getDefendersOfSquare,
} from "../features/attacks";

function withValue(piece) {
  if (!piece) return null;

  return {
    ...piece,
    value: piece.value || PIECE_VALUES[piece.type] || 0,
  };
}

function uniqueBySquare(pieces = []) {
  const seen = new Set();

  return pieces.filter((piece) => {
    if (!piece?.square || seen.has(piece.square)) return false;
    seen.add(piece.square);
    return true;
  });
}

function cheapestValue(pieces = []) {
  const values = pieces
    .map((piece) => piece.value || PIECE_VALUES[piece.type] || 0)
    .filter((value) => value > 0);

  return values.length ? Math.min(...values) : 0;
}

export function detectBattery(features) {
  const battery = features?.batteryAttacks?.[0];
  if (!battery || !battery.target) return null;

  if (
    battery.frontPiece?.square !== features.to &&
    battery.supporter?.square !== features.to
  ) {
    return null;
  }

  const chessAfter = new Chess(features.fenBefore);
  chessAfter.move(features.san, { sloppy: true });

  const targetSquare = battery.targetSquare || battery.target.square;
  const boardTarget = chessAfter.get(targetSquare);

  if (!boardTarget) return null;

  const target = {
    ...battery.target,
    type: boardTarget.type,
    color: boardTarget.color,
    square: targetSquare,
  };

  const targetValue = PIECE_VALUES[target.type] || 0;

  const directAttackers = getAttackersOfSquare(
    chessAfter,
    targetSquare,
    features.side,
    false
  );

  const batteryAttackers = [battery.frontPiece, battery.supporter]
    .map(withValue)
    .filter(Boolean);

  const attackers = uniqueBySquare([
    ...directAttackers.map(withValue),
    ...batteryAttackers,
  ]).filter(Boolean);

  const defenders = getDefendersOfSquare(
    chessAfter,
    targetSquare,
    target.color
  ).map(withValue);

  const attackersCount = attackers.length;
  const defendersCount = defenders.length;

  const cheapestAttackerValue = cheapestValue(attackers);
  const cheapestDefenderValue = cheapestValue(defenders);

  const isUndefended = defendersCount === 0;

  const attackersOutnumberDefenders =
    attackersCount > defendersCount;

  const equalAttackersButBetterTrade =
    attackersCount === defendersCount &&
    defendersCount > 0 &&
    cheapestAttackerValue > 0 &&
    cheapestDefenderValue > 0 &&
    cheapestAttackerValue < cheapestDefenderValue;

  const isGood =
    isUndefended ||
    attackersOutnumberDefenders ||
    equalAttackersButBetterTrade;

  if (!isGood) return null;

  return {
    type: "battery",
    targets: [
      {
        piece: target.type,
        square: targetSquare,
        value: targetValue,
        isDefended: defendersCount > 0,
      },
    ],
    tags: {
      attackersCount,
      defendersCount,
      cheapestAttackerValue,
      cheapestDefenderValue,
    },
  };
}