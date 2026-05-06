export function detectHangingPiece(features) {
  const ownTargets = features?.ownHangingPieces || [];
  const enemyTargets = features?.enemyHangingPieces || [];

  const pickHighestValue = (items) =>
    [...items].sort((a, b) => (b.value || 0) - (a.value || 0))[0];

  const ownHanging = ownTargets.filter((p) => p.isHanging);
  const enemyHanging = enemyTargets.filter((p) => p.isHanging);

  if (ownHanging.length) {
    const target = pickHighestValue(ownHanging);

    return {
      type: "hanging",
      piece: target.type,
      square: target.square,
      targets: [
        {
          piece: target.type,
          name: target.name,
          square: target.square,
          value: target.value,
          isDefended: target.isDefended,
        },
      ],
    };
  }

  if (enemyHanging.length) {
    const target = pickHighestValue(enemyHanging);

    return {
      type: "enemyPressure",
      piece: target.type,
      square: target.square,
      targets: [
        {
          piece: target.type,
          name: target.name,
          square: target.square,
          value: target.value,
          isDefended: target.isDefended,
        },
      ],
    };
  }

  return null;
}