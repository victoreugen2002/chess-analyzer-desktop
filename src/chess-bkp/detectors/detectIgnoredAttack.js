export function detectIgnoredAttack(features) {
  const before = features?.ownHangingBefore || [];
  const after = features?.ownHangingAfter || [];

  const from = features?.from;
  const to = features?.to;

  const targets = [];

  for (const pieceBefore of before) {
    if (pieceBefore.type === "p") continue;

    const sameAfter = after.find((p) => p.square === pieceBefore.square);
    if (!sameAfter) continue;

    const notMoved =
      pieceBefore.square !== from && pieceBefore.square !== to;

    if (!notMoved) continue;

    const isPawn = pieceBefore.type === "p";

    const wasReallyThreatened = isPawn
      ? pieceBefore.isHanging
      : pieceBefore.isHanging || pieceBefore.isUnderPressure;

    const stillReallyThreatened = isPawn
      ? sameAfter.isHanging
      : sameAfter.isHanging || sameAfter.isUnderPressure;

    if (wasReallyThreatened && stillReallyThreatened) {
      targets.push({
        piece: pieceBefore.type,
        name: pieceBefore.name,
        square: pieceBefore.square,
      });
    }
  }

  if (!targets.length) return null;

  return {
    type: "ignoredAttack",
    targets,
  };
}