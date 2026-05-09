import { PIECE_VALUES, getPieceName } from "../core/pieces";
import { detectDiscoveredAttack, detectDiscoveredCheck } from "../detectors/discoveredAttack";
import { detectFork } from "../detectors/forkDetector";
import { detectRemoveDefender } from "../detectors/removeDefender";
import { detectSkewer } from "../detectors/skewerDetector";

function safeDetect(detector) {
  try {
    return detector() || null;
  } catch {
    return null;
  }
}

function detectStrongMaterialGain(reply) {
  if (!reply?.captured) return null;

  const value = PIECE_VALUES[reply.captured] || 0;
  if (value < 3) return null;

  return {
    type: "materialGain",
    targets: [
      {
        piece: reply.captured,
        square: reply.to,
        value,
      },
    ],
  };
}

export function getContinuationTactic({ chessBeforeReply, chessAfterReply, tacticalReply }) {
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
    safeDetect(() => detectStrongMaterialGain(tacticalReply)),
  ].filter(Boolean);

  return checks[0] || null;
}

function formatTargetList(targets = []) {
  const names = targets
    .map((target) => getPieceName(target?.piece) || "piece")
    .filter(Boolean);

  if (!names.length) return "material";
  if (names.length === 1) return `the ${names[0]}`;

  return `the ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function getMotifText(signal) {
  if (!signal) return "with a tactical response";

  switch (signal.type) {
    case "fork":
      return `forking ${formatTargetList(signal.targets)}`;
    case "skewer":
      return "creating a skewer";
    case "discoveredCheck":
      return "with a discovered check";
    case "discoveredAttack":
      return "with a discovered attack";
    case "removeDefender":
      return "by removing a defender";
    case "materialGain":
      return "winning material";
    default:
      return "with a tactical response";
  }
}