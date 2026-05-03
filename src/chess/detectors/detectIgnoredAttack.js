export function detectIgnoredAttack(features) {
  const before = features?.ownHangingBefore || [];
  const after = features?.ownHangingAfter || [];

  const from = features?.from;
  const to = features?.to;

  for (const pieceBefore of before) {
    const sameAfter = after.find((p) => p.square === pieceBefore.square);

    if (!sameAfter) continue;

    const wasUnderAttack =
      pieceBefore.isHanging || pieceBefore.isUnderPressure;

    const stillUnderAttack =
      sameAfter.isHanging || sameAfter.isUnderPressure;

    const notMoved =
      pieceBefore.square !== from && pieceBefore.square !== to;

    if (wasUnderAttack && stillUnderAttack && notMoved) {
    return {
        type: "ignoredAttack",
        piece: pieceBefore.type,
        name: pieceBefore.name,
        square: pieceBefore.square,
        targets: [
        {
            piece: pieceBefore.type,
            name: pieceBefore.name,
            square: pieceBefore.square,
        },
        ],
    };
    }
  }

  return null;
}