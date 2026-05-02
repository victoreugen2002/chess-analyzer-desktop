import { moveToHuman } from "../utils";
import { buildCoachMessage } from "./messagebuilder";
import { getPieceName } from "../core/pieces";

function getSecondarySignal(detections, primary) {
  return detections?.find(
    (d) =>
      d !== primary &&
      ["attack", "battery"].includes(d.type) &&
      d.targets?.length
  );
}

function getHangingText(detections, label) {
  const hanging = detections?.find(
    (d) => d.type === "attack" && d.targets?.length && d.severity === 3
  );

  if (!hanging || label === "Good") return "";

  const target = hanging.targets[0];
  const name = getPieceName(target.piece) || "piece";

  return ` However, the ${name} on ${target.square} is hanging.`;
}

export function explainMove({
  label,
  san,
  bestMove,
  side,
  signal,
  fenBefore,
  detections,
}) {
  const opener = `${side === "w" ? "White" : "Black"} played ${san}.`;

  const bestHuman =
    bestMove && bestMove !== "—" ? moveToHuman(bestMove, fenBefore) : "";

  const bestText =
    label !== "Good" && bestHuman && bestHuman !== san
      ? ` A better move was ${bestHuman}.`
      : "";

  const hangingText = getHangingText(detections, label);

  if (signal) {
    const msg = buildCoachMessage(signal);
    const secondary = getSecondarySignal(detections, signal);

    if (msg && signal.type === "moveToSafety" && secondary) {
      const target = secondary.targets[0];
      const name = getPieceName(target.piece) || "piece";

      return `${opener} ${msg} It also attacks the ${name} on ${target.square}.${hangingText}${bestText}`.trim();
    }

    if (msg) {
      return `${opener} ${msg}${hangingText}${bestText}`.trim();
    }
  }

  if (label === "Blunder") {
    return `${opener} This is a blunder.${hangingText}${bestText}`;
  }

  if (label === "Mistake") {
    return `${opener} This is a mistake.${hangingText}${bestText}`;
  }

  if (label === "Good") {
    return `${opener} This is a natural move.`;
  }

  return `${opener} This move is slightly imprecise.${hangingText}${bestText}`;
}