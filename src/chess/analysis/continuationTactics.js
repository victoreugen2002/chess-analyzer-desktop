import { getPieceName } from "../core/pieces";
import { detectAttack } from "../detectors/attackDetector";
import { detectDiscoveredAttack, detectDiscoveredCheck } from "../detectors/discoveredAttack";
import { detectFork } from "../detectors/forkDetector";
import { detectRemoveDefender } from "../detectors/removeDefender";
import { detectSkewer } from "../detectors/skewerDetector";
import {
  attachMaterialPayoff,
  formatMaterialPayoff,
  formatRecapturePunishment,
  getCapturedMaterialPayoff,
  getRecapturePunishment,
} from "./materialPayoff";

function safeDetect(detector) {
  try {
    return detector() || null;
  } catch {
    return null;
  }
}


function getMaxTargetValue(signal) {
  return Math.max(
    0,
    ...(signal?.targets || []).map((target) => Number(target?.value) || 0)
  );
}

function isUsefulContinuationSignal(signal, capturePayoff) {
  if (!signal) return false;

  // Keep only continuation ideas with real material payoff
  if ((capturePayoff?.value || 0) >= 3) return true;

  // These are too noisy unless material payoff already confirmed above
  if (
    signal.type === "attack" ||
    signal.type === "discoveredAttack" ||
    signal.type === "removeDefender"
  ) {
    return false;
  }

  return true;
}

function detectStrongMaterialGain(reply) {
  const payoff = getCapturedMaterialPayoff(reply, { minValue: 3 });
  if (!payoff) return null;

  return {
    type: "materialGain",
    targets: [
      {
        piece: payoff.piece,
        square: payoff.square,
        value: payoff.value,
      },
    ],
    tags: {
      materialPayoff: payoff,
    },
  };
}

function attachPayoffDetails(signal, capturePayoff, recapturePunishment) {
  if (!signal) return signal;

  const withPayoff = attachMaterialPayoff(signal, capturePayoff);
  const punishmentText = formatRecapturePunishment(recapturePunishment);

  if (!recapturePunishment && !punishmentText) return withPayoff;

  return {
    ...withPayoff,
    tags: {
      ...(withPayoff.tags || {}),
      recapturePunishment,
      recapturePunishmentText: punishmentText,
    },
  };
}

export function getContinuationTactic({ chessBeforeReply, chessAfterReply, tacticalReply }) {
  const capturePayoff = getCapturedMaterialPayoff(tacticalReply, { minValue: 3 });
  const recapturePunishment = getRecapturePunishment({
    chessAfterReply,
    tacticalReply,
  });

  const checks = [
    safeDetect(() => detectFork({ chessAfter: chessAfterReply, move: tacticalReply })),
    safeDetect(() =>
      detectSkewer({
        chessBefore: chessBeforeReply,
        chessAfter: chessAfterReply,
        move: tacticalReply,
      })
    ),
    safeDetect(() =>
      detectDiscoveredCheck({
        chessBefore: chessBeforeReply,
        chessAfter: chessAfterReply,
        move: tacticalReply,
      })
    ),
    safeDetect(() =>
      detectDiscoveredAttack({
        chessBefore: chessBeforeReply,
        chessAfter: chessAfterReply,
        move: tacticalReply,
      })
    ),
    safeDetect(() =>
      detectRemoveDefender({
        chessBefore: chessBeforeReply,
        chessAfter: chessAfterReply,
        move: tacticalReply,
      })
    ),
    safeDetect(() =>
      detectAttack({
        chessAfter: chessAfterReply,
        move: tacticalReply,
      })
    ),
  ]
    .filter(Boolean)
    .filter((signal) => isUsefulContinuationSignal(signal, capturePayoff))
    .map((signal) => attachPayoffDetails(signal, capturePayoff, recapturePunishment));

  return checks[0] || detectStrongMaterialGain(tacticalReply);
}

function formatTargetList(targets = []) {
  const names = targets
    .map((target) => getPieceName(target?.piece) || "piece")
    .filter(Boolean);

  if (!names.length) return "material";
  if (names.length === 1) return `the ${names[0]}`;

  return `the ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function withMaterialPayoff(signal, text) {
  const payoffText = formatMaterialPayoff(signal?.tags?.materialPayoff);
  if (!payoffText) return text;

  return `${payoffText} and ${text}`;
}

export function getMotifText(signal) {
  if (!signal) return "with a tactical response";

  switch (signal.type) {
    case "fork": {
      const targets = formatTargetList(signal.targets);

      if (
        signal.tags?.kind === "doubleAttack" &&
        signal.tags?.includesCheck &&
        !signal.tags?.directCheck
      ) {
        return withMaterialPayoff(
          signal,
          `with a discovered check and attacking ${targets}`
        );
      }

      return withMaterialPayoff(signal, `forking ${targets}`);
    }
    case "skewer":
      return withMaterialPayoff(signal, "creating a skewer");
    case "discoveredCheck":
      return withMaterialPayoff(signal, "with a discovered check");
    case "discoveredAttack":
      return formatMaterialPayoff(signal.tags?.materialPayoff) || "with a tactical response";
    case "removeDefender":
      return formatMaterialPayoff(signal.tags?.materialPayoff) || "with a tactical response";
    case "attack":
      return withMaterialPayoff(signal, `attacking ${formatTargetList(signal.targets)}`);
    case "materialGain":
      return formatMaterialPayoff(signal.tags?.materialPayoff) || "winning material";
    default:
      return withMaterialPayoff(signal, "with a tactical response");
  }
}
