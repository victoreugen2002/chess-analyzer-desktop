import { Chess } from "chess.js";
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

function getReasonText(detections, label, playedTo) {
  if (label === "Good") return "";

  const attack = detections?.find(
    (d) => d.type === "attack" && d.targets?.length && d.severity === 3
  );

  if (!attack) return "";

  const target = attack.targets[0];
  const name = getPieceName(target.piece) || "piece";

  if (target.square === playedTo) {
    if (!target.isDefended && target.value >= 3) {
      return ` because the ${name} on ${target.square} is hanging`;
    }

    return "";
  }

  if (!target.isDefended) {
    return ` because the ${name} on ${target.square} can be captured`;
  }

  return ` because the ${name} on ${target.square} is under pressure`;
}

function buildLabelText(label, reasonText, bestText) {
  if (label === "Inaccuracy" && !reasonText) {
    return `This move is slightly imprecise — it doesn’t improve your position.${bestText}`;
  }

  const labelText =
    label === "Blunder" ? "This is a blunder" :
    label === "Mistake" ? "This is a mistake" :
    label === "Inaccuracy" ? "This move is slightly imprecise" :
    "This is a natural move";

  return `${labelText}${reasonText ? `${reasonText}.` : "."}${bestText}`;
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

  let playedTo = null;

  try {
    const chess = new Chess(fenBefore);
    const move = chess.move(san, { sloppy: true });
    playedTo = move?.to || null;
  } catch {
    playedTo = null;
  }

  const shouldFilterPlayedTo = (d) =>
    !["capture", "recapture"].includes(d?.type);

  const cleanSignal =
    signal?.targets && shouldFilterPlayedTo(signal)
      ? {
          ...signal,
          targets: signal.targets.filter((t) => t.square !== playedTo),
        }
      : signal;

  const cleanDetections = detections?.map((d) =>
    d.targets && shouldFilterPlayedTo(d)
      ? { ...d, targets: d.targets.filter((t) => t.square !== playedTo) }
      : d
  );

  const usableSignal =
    cleanSignal?.targets &&
    cleanSignal.targets.length === 0 &&
    ["attack", "battery", "pin", "ignoredAttack"].includes(cleanSignal.type)
      ? null
      : cleanSignal;

  const bestHuman =
    bestMove && bestMove !== "—" ? moveToHuman(bestMove, fenBefore) : "";

  const bestText =
    label !== "Good" && bestHuman && bestHuman !== san
      ? ` A better move was ${bestHuman}.`
      : "";

  const reasonText = getReasonText(cleanDetections, label, playedTo);

  if (usableSignal) {
    const msg = buildCoachMessage(usableSignal);
    const secondary = getSecondarySignal(cleanDetections, usableSignal);

    if (
      msg &&
      ["moveToSafety", "capture", "recapture"].includes(usableSignal.type) &&
      secondary
    ) {
      const target = secondary.targets?.[0];
      if (!target) return `${opener} ${msg}${bestText}`.trim();

      const name = getPieceName(target.piece) || "piece";

      return `${opener} ${msg} It also attacks the ${name} on ${target.square}.${bestText}`.trim();
    }

    if (msg) {
      if (label === "Good") {
        return `${opener} ${msg}${bestText}`.trim();
      }

      const cleanMsg = msg.replace(/\.$/, "");

      const labelText =
        label === "Blunder" ? "This is a blunder." :
        label === "Mistake" ? "This is a mistake." :
        "This move is slightly imprecise.";

      return `${opener} ${cleanMsg}. ${labelText}${bestText}`.trim();
    }
  }

  console.log("EXPLAIN", san, {
    label,
    signal,
    usableSignal,
    detections,
  });

  return `${opener} ${buildLabelText(label, reasonText, bestText)}`;
}