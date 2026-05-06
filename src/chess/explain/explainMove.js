import { Chess } from "chess.js";
import { moveToHuman } from "../utils";
import { buildCoachMessage } from "./messagebuilder";
import { getPieceName, PIECE_VALUES } from "../core/pieces";

const SIGNAL_RULES = {
  // Critical / game-changing
  tacticalSequence: { priority: 102, group: "tactical", combinable: false, allowExtras: true },
  tacticalContinuation: { priority: 102, group: "tactical", combinable: false, allowExtras: true },
  greedyCapturePunishment: { priority: 101, group: "tactical", combinable: false, allowExtras: false },
  materialLoss: { priority: 100, group: "critical", combinable: false, allowExtras: false },
  mateThreat: { priority: 98, group: "critical", combinable: false, allowExtras: false },
  materialGain: { priority: 94, group: "critical", combinable: false, allowExtras: false },
  // Direct forcing / obvious moves
  recapture: { priority: 90, group: "positive", combinable: false, allowExtras: true },
  capture: { priority: 88, group: "positive", combinable: false, allowExtras: true },
  castle: { priority: 86, group: "positive", combinable: false, allowExtras: false },

  // Tactical motifs
  discoveredCheck: { priority: 85, group: "tactical", combinable: true, allowExtras: true },
  check: { priority: 84, group: "tactical", combinable: false, allowExtras: true },
  fork: { priority: 83, group: "tactical", combinable: true, allowExtras: true },
  skewer: { priority: 82, group: "tactical", combinable: true, allowExtras: true },
  discoveredAttack: { priority: 81, group: "tactical", combinable: true, allowExtras: true },
  pin: { priority: 80, group: "tactical", combinable: true, allowExtras: true },
  battery: { priority: 79, group: "tactical", combinable: true, allowExtras: true },
  removeDefender: { priority: 78, group: "tactical", combinable: true, allowExtras: true },
  attack: { priority: 77, group: "tactical", combinable: true, allowExtras: true },

  // Defensive / improving
  unpin: { priority: 76, group: "positive", combinable: true, allowExtras: true },
  moveToSafety: { priority: 75, group: "positive", combinable: true, allowExtras: true },
  protectsAttackedPiece: { priority: 74, group: "positive", combinable: true, allowExtras: true },

  // Warnings
  ignoredAttack: { priority: 72, group: "warning", combinable: true, allowExtras: true },
  hanging: { priority: 70, group: "warning", combinable: true, allowExtras: true },
  enemyPressure: { priority: 68, group: "tactical", combinable: true, allowExtras: true },
};

const EMPTY_TARGET_TYPES = [
  "attack",
  "battery",
  "pin",
  "unpin",
  "discoveredAttack",
  "enemyPressure",
  "ignoredAttack",
  "hanging",
  "skewer",
  "removeDefender",
  "protectsAttackedPiece",
];

const SUPPRESS_LABEL_TYPES = [
  "materialLoss",
  "materialGain",
  "mateThreat",
  "greedyCapturePunishment",
  "hanging",
  "enemyPressure",
  //"recapture",
  // "capture",
];

function getSignalRule(signal) {
  return SIGNAL_RULES[signal?.type] || {
    priority: 0,
    group: "other",
    combinable: false,
    allowExtras: false,
  };
}

function isUsableSignal(signal) {
  if (!signal) return false;

  if (
    signal.targets &&
    signal.targets.length === 0 &&
    EMPTY_TARGET_TYPES.includes(signal.type)
  ) {
    return false;
  }

  return Boolean(buildCoachMessage(signal));
}

function getSignalKey(signal) {
  const firstTarget = signal.targets?.[0];
  const targetKey = firstTarget
    ? `${firstTarget.piece || firstTarget.type || "piece"}-${firstTarget.square || ""}`
    : "";

  return `${signal.type}-${targetKey}-${signal.reason || ""}`;
}

function removeDuplicateSignals(signals = []) {
  const seen = new Set();

  return signals.filter((signal) => {
    const key = getSignalKey(signal);

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function removeRedundantSignals(signals = []) {
  const types = new Set(signals.map((s) => s.type));

  const hasDirectTactic =
    types.has("fork") ||
    types.has("skewer") ||
    types.has("discoveredCheck") ||
    types.has("discoveredAttack") ||
    types.has("mateThreat");

  const attackSquares = signals
    .filter((s) => s.type === "attack")
    .flatMap((s) => s.targets?.map((t) => t.square) || []);

  const pinSquares = signals
    .filter((s) => s.type === "pin")
    .flatMap((s) => s.targets?.map((t) => t.square) || []);

  const skewerSquares = signals
  .filter((s) => s.type === "skewer")
  .flatMap((s) => s.targets?.map((t) => t.square) || []);

  const hasKingSkewer = signals.some(
    (s) => s.type === "skewer" && s.targets?.[0]?.piece === "k"
  );

  const captureSignals = signals.filter((s) =>
    ["capture", "recapture"].includes(s.type)
  );

  const removeDefenderSquares = signals
    .filter((s) => s.type === "removeDefender")
    .flatMap((s) => s.targets?.map((t) => t.square) || []);

  const hasMajorRecapture = captureSignals.some((s) => {
    if (s.type !== "recapture") return false;

    const target = s.targets?.[0];
    const value = target?.value || PIECE_VALUES[target?.piece] || 0;

    return value >= 3;
  });

  return signals.filter((signal) => {
    if (signal.type === "greedyCapturePunishment" && hasDirectTactic) {
      return false;
    }
    if (
      signal.type === "battery" &&
      signal.targets?.some((t) => attackSquares.includes(t.square))
    ) {
      return false;
    }

    if (
      signal.type === "removeDefender" &&
      types.has("recapture") &&
      signal.targets?.[0]?.piece === "p"
    ) {
      return false;
    }

    if (
      signal.type === "protectsAttackedPiece" &&
      hasMajorRecapture &&
      signal.targets?.[0]?.piece === "p"
    ) {
      return false;
    }

    if (
      signal.type === "attack" &&
      signal.targets?.some((t) => removeDefenderSquares.includes(t.square))
    ) {
      return false;
    }
    if (
      signal.type === "removeDefender" &&
      (
        types.has("fork") ||
        types.has("skewer") ||
        types.has("discoveredCheck") ||
        types.has("mateThreat") ||
        types.has("materialGain")
      )
    ) {
      return false;
    }


    if (
      signal.type === "protectsAttackedPiece" &&
      (
        types.has("fork") ||
        types.has("skewer") ||
        types.has("discoveredCheck") ||
        types.has("mateThreat") ||
        types.has("materialGain")
      )
    ) {
      return false;
    }
    if (types.has("skewer") && ["fork", "attack"].includes(signal.type)) {
      return false;
    }

    if (hasKingSkewer && signal.type === "check") {
      return false;
    }
    if (
      types.has("fork") &&
      ["attack", "check", "ignoredAttack", "hanging", "enemyPressure"].includes(signal.type)
    ) {
      return false;
    }

    if (types.has("discoveredCheck") && signal.type === "check") {
      return false;
    }

    if (
      signal.type === "moveToSafety" &&
      (
        types.has("recapture") ||
        types.has("capture") ||
        types.has("fork") ||
        types.has("skewer") ||
        types.has("discoveredCheck") ||
        types.has("check") ||
        types.has("attack") ||
        types.has("discoveredAttack")
      )
    ) {
      return false;
    }

    if (
      signal.type === "attack" &&
      signal.targets?.some((t) => pinSquares.includes(t.square))
    ) {
      return false;
    }

    if (
      signal.type === "enemyPressure" &&
      signal.targets?.some((t) => attackSquares.includes(t.square))
    ) {
      return false;
    }

    if (types.has("materialGain") && ["capture", "recapture"].includes(signal.type)) {
      return false;
    }

    if (types.has("recapture") && signal.type === "capture") {
      return false;
    }

    if (
      (types.has("tacticalSequence") || types.has("tacticalContinuation") || types.has("greedyCapturePunishment")) &&
      ["materialLoss", "capture", "recapture", "attack", "hanging", "enemyPressure", "ignoredAttack"].includes(signal.type)
    ) {
      return false;
    }

    if (types.has("materialLoss") && ["hanging", "enemyPressure"].includes(signal.type)) {
      return false;
    }

    if (signal.type === "hanging") {
      const target = signal.targets?.[0];

      const isEqualCaptureTrade = captureSignals.some((captureSignal) => {
        const captured = captureSignal.targets?.[0];

        if (!captured || !target) return false;
        if (captured.square !== target.square) return false;

        const capturedValue = PIECE_VALUES[captured.piece] || 0;
        const hangingValue = target.value || PIECE_VALUES[target.piece] || 0;

        return capturedValue >= hangingValue;
      });

      if (isEqualCaptureTrade) {
        return false;
      }
    }

    return true;
  });
}

function sortByPriority(signals = []) {
  return [...signals].sort(
    (a, b) => getSignalRule(b).priority - getSignalRule(a).priority
  );
}

function selectMessageSignals(detections = []) {
  const usable = removeRedundantSignals(
    removeDuplicateSignals(detections.filter(isUsableSignal))
  );

  const sorted = sortByPriority(usable);
  const primary = sorted[0];

  if (!primary) return [];

  const primaryRule = getSignalRule(primary);

  if (!primaryRule.allowExtras) {
    return [primary];
  }

  const extras = sorted.filter((signal) => {
    if (signal === primary) return false;
    return getSignalRule(signal).combinable;
  });

  return [primary, ...extras].slice(0, 3);
}

function orderSignalsForMessage(signals = []) {
  const hasCritical = signals.some(
    (signal) => getSignalRule(signal).group === "critical"
  );

  if (hasCritical) return sortByPriority(signals);

  const groupOrder = {
    positive: 1,
    tactical: 2,
    warning: 3,
    other: 4,
  };

  return [...signals].sort((a, b) => {
    const groupDiff =
      (groupOrder[getSignalRule(a).group] || 99) -
      (groupOrder[getSignalRule(b).group] || 99);

    if (groupDiff !== 0) return groupDiff;

    return getSignalRule(b).priority - getSignalRule(a).priority;
  });
}

function sentenceWithContrast(message) {
  if (!message) return "";
    return `However, ${message.charAt(0).toLowerCase()}${message.slice(1)}`;
  }

function buildCombinedMessage(signals = []) {
  const ordered = orderSignalsForMessage(signals);

  return ordered
    .map((signal, index) => {
      const message = buildCoachMessage(signal);
      if (!message) return "";

      const currentGroup = getSignalRule(signal).group;
      const previousGroup = getSignalRule(ordered[index - 1]).group;

      if (index > 0 && currentGroup === "warning" && previousGroup !== "warning") {
        return sentenceWithContrast(message);
      }

      return message;
    })
    .filter(Boolean)
    .join(" ");
}

function shouldShowLabel(label, signals = []) {
  if (!signals.length) return true;

  if (label === "Good") {
    return false;
  }

  return !signals.some((signal) => SUPPRESS_LABEL_TYPES.includes(signal.type));
}

function getLabelSentence(label) {
  if (label === "Blunder") return "This is a blunder.";
  if (label === "Mistake") return "This is a mistake.";
  if (label === "Inaccuracy") return "This move is slightly imprecise.";
  return "This is a natural move.";
}

function playMoveToken(chess, token) {
  if (!token) return null;

  if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(token)) {
    return chess.move({
      from: token.slice(0, 2),
      to: token.slice(2, 4),
      promotion: token[4] || "q",
    });
  }

  return chess.move(token, { sloppy: true });
}

function getBestMoveIdea(bestMove, fenBefore) {
  if (!bestMove || bestMove === "—") return "";

  try {
    const chess = new Chess(fenBefore);
    const move = playMoveToken(chess, bestMove);

    if (!move) return "";

    if (move.captured) {
      const captured = getPieceName(move.captured) || "piece";
      return `captures the ${captured}`;
    }

    if (move.flags?.includes("k") || move.flags?.includes("q")) {
      return "brings the king to safety";
    }

    if (move.piece === "p") {
      const file = move.to[0];

      if (["d", "e"].includes(file)) {
        return "gains space in the center";
      }

      if (["c", "f"].includes(file)) {
        return "supports the center";
      }

      return "";
    }

    return "";
  } catch {
    return "";
  }
}

function getPlayedLineTokens(playedLine) {
  if (!playedLine) return [];

  if (Array.isArray(playedLine)) {
    return playedLine.filter(Boolean);
  }

  return String(playedLine)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !/^\d+\.{1,3}$/.test(token))
    .filter((token) => !["1-0", "0-1", "1/2-1/2", "*"].includes(token));
}

function getFenAfterPlayedMove({ fenBefore, fenAfter, san, side }) {
  try {
    if (fenAfter) {
      const after = new Chess(fenAfter);

      // Dacă a mutat albul, după mutare trebuie să fie rândul negrului.
      // Dacă a mutat negrul, după mutare trebuie să fie rândul albului.
      if (after.turn() !== side) {
        return fenAfter;
      }
    }

    const chess = new Chess(fenBefore);
    playMoveToken(chess, san);

    return chess.fen();
  } catch {
    return fenAfter || fenBefore;
  }
}

function getFirstLegalReplyFromLine({ playedLine, fenBefore, fenAfter, san, side }) {
  const correctFenAfter = getFenAfterPlayedMove({
    fenBefore,
    fenAfter,
    san,
    side,
  });

  const tokens = getPlayedLineTokens(playedLine);

  if (!correctFenAfter || !tokens.length) return null;

  for (const token of tokens) {
    try {
      const chess = new Chess(correctFenAfter);
      const move = playMoveToken(chess, token);

      if (move) return move;
    } catch {
      // skip mutarea jucată sau token-uri ilegale
    }
  }

  return null;
}

function getPunishingReplyText({ playedLine, fenBefore, fenAfter, san, side }) {
  const reply = getFirstLegalReplyFromLine({
    playedLine,
    fenBefore,
    fenAfter,
    san,
    side,
  });

  if (!reply) return "";

  const opponent = side === "w" ? "Black" : "White";

  if (reply.captured) {
    const captured = getPieceName(reply.captured) || "piece";
    return `${opponent} can answer with ${reply.san}, winning the ${captured}`;
  }

  if (reply.san?.includes("#")) {
    return `${opponent} can answer with ${reply.san}, creating a forced mate threat`;
  }

  if (reply.san?.includes("+")) {
    return `${opponent} can answer with ${reply.san}, giving check`;
  }

  return `${opponent} can answer with ${reply.san}`;
}

export function explainMove({
  label,
  san,
  bestMove,
  side,
  fenBefore,
  fenAfter,
  detections,
  playedEval,
  playedLine,
}) {
  const opener = `${side === "w" ? "White" : "Black"} played ${san}.`;

  if (san?.includes("#")) {
    return `${opener} This is checkmate.`;
  }

  const bestHuman =
    bestMove && bestMove !== "—" ? moveToHuman(bestMove, fenBefore) : "";

  const isMateScore = Math.abs(playedEval) > 90000;

  if (label === "Blunder" && isMateScore) {
    return `${opener} This allows a forced checkmate.${
      bestHuman ? ` A better move was ${bestHuman}.` : ""
    }`.trim();
  }

  const messageSignals = selectMessageSignals(detections);
  const msg = buildCombinedMessage(messageSignals);

  const bestText =
    label !== "Good" && bestHuman && bestHuman !== san
      ? ` A better move was ${bestHuman}.`
      : "";

  const hasMaterialLoss = messageSignals.some(
    (signal) => signal.type === "materialLoss"
    );

    if (hasMaterialLoss && label !== "Good" && bestHuman) {
      const punishment = getPunishingReplyText({
        playedLine,
        fenBefore,
        fenAfter,
        san,
        side,
      });

      if (punishment) {
        const labelText = getLabelSentence(label).replace(/\.$/, "");
        return `${opener} ${labelText} because ${punishment}. A better move was ${bestHuman}.`;
      }
    }

  if (messageSignals.length && msg) {
    const labelText = shouldShowLabel(label, messageSignals)
      ? ` ${getLabelSentence(label)}`
      : "";

    return `${opener} ${msg}${labelText}${bestText}`.trim();
  }

  if ((label === "Blunder" || label === "Mistake") && bestHuman) {
    const punishment = getPunishingReplyText({
      playedLine,
      fenBefore,
      fenAfter,
      san,
      side,
    });

    if (punishment) {
      const labelText = getLabelSentence(label).replace(/\.$/, "");
      return `${opener} ${labelText} because ${punishment}. A better move was ${bestHuman}.`;
    }
  }

  if (label !== "Good" && bestHuman) {
    const idea = getBestMoveIdea(bestMove, fenBefore);

    return `${opener} ${getLabelSentence(label)} ${
      idea
        ? `A better move was ${bestHuman}, which ${idea}.`
        : `A better move was ${bestHuman}.`
    }`.trim();
  }

  return `${opener} ${getLabelSentence(label)}`;
}