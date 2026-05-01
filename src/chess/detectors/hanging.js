export function detectHangingPiece(features) {
  const ownTarget = features?.ownHangingPieces?.[0];
  const enemyTarget = features?.enemyHangingPieces?.[0];

  if (ownTarget?.isHanging) {
    return {
      type: "hanging",
      piece: ownTarget.type,
      square: ownTarget.square,
      targets: [
        {
          piece: ownTarget.type,
          square: ownTarget.square,
        },
      ],
    };
  }

  if (enemyTarget) {
    return {
      type: "enemyPressure",
      piece: enemyTarget.type,
      square: enemyTarget.square,
      targets: [
        {
          piece: enemyTarget.type,
          square: enemyTarget.square,
        },
      ],
    };
  }

  return null;
}