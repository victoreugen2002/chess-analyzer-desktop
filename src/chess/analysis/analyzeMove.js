import { extractFeatures } from "./extractFeatures";
import { runDetectors } from "./runDetectors";
import {
  createSignalMessageContext,
  explainMove,
  selectMessageSignals,
} from "../explain/explainMove";
import { getLabelFromEval  } from "../explain/labels";
import { getOpeningMoveContext } from "../explain/openingInfo";

function getMaxTargetValue(signal) {
  return Math.max(
    0,
    ...(signal?.targets || []).map((target) => Number(target?.value) || 0)
  );
}

function hasConcretePositiveSignal(signal) {
  if (!signal?.type) return false;

  const concreteTypes = new Set([
    "fork",
    "skewer",
    "validatedSkewer",
    "discoveredAttack",
    "discoveredCheck",
    "materialGain",
    "capturePayoff",
    "mateThreat",
    "tacticalSequence",
  ]);

  if (concreteTypes.has(signal.type)) return true;

  // These can be good, but only if they have a clear tactical payoff.
  if (["pin", "battery", "removeDefender"].includes(signal.type)) {
    return getMaxTargetValue(signal) >= 5 || Boolean(signal.tags?.materialPayoff);
  }

  return false;
}

function describePositiveSignal(signal) {
  const targetValue = getMaxTargetValue(signal);

  switch (signal?.type) {
    case "fork":
      return "This creates a concrete fork and puts multiple enemy pieces under pressure.";
    case "skewer":
    case "validatedSkewer":
      return "This creates a skewer, forcing the opponent to deal with a more valuable piece first.";
    case "discoveredAttack":
      return "This creates a discovered attack and activates a hidden line of pressure.";
    case "discoveredCheck":
      return "This creates a discovered check, a forcing tactical resource.";
    case "mateThreat":
      return "This creates a serious mating threat that the opponent must answer.";
    case "materialGain":
    case "capturePayoff":
      return targetValue >= 5
        ? "This move wins significant material or confirms a strong material payoff."
        : "This move wins material with a concrete tactical justification.";
    case "pin":
      return "This creates a meaningful pin with real tactical pressure.";
    case "battery":
      return "This builds a dangerous battery and increases tactical pressure on the position.";
    case "removeDefender":
      return "This removes an important defender and creates a concrete tactical target.";
    case "tacticalSequence":
      return "This starts a concrete tactical sequence worth reviewing.";
    default:
      return "This was a concrete tactical move worth reviewing.";
  }
}

function isNormalOpeningMove(openingContext, moveIndex) {
  if (!openingContext) return false;

  const isBook =
    openingContext.inBook === true ||
    openingContext.isBook === true ||
    openingContext.status === "inBook" ||
    /follows the opening book|still book/i.test(openingContext.message || "") ||
    /follows the opening book|still book/i.test(openingContext.description || "");

  return isBook && moveIndex < 16;
}

function getPositiveMoveQuality({
  label,
  loss,
  bestMove,
  lan,
  detections,
  openingContext,
  moveIndex,
}) {
  const safeLoss = Number.isFinite(loss) ? Math.abs(loss) : 0;

  if (label !== "Good" || safeLoss > 15) return null;

  const tacticalSignals = (detections || []).filter(hasConcretePositiveSignal);
  if (!tacticalSignals.length) return null;

  const maxTargetValue = Math.max(0, ...tacticalSignals.map(getMaxTargetValue));
  const primarySignal = tacticalSignals.find((signal) =>
    ["mateThreat", "discoveredCheck", "validatedSkewer", "fork"].includes(signal.type)
  ) || tacticalSignals[0];

  const hasForcingSignal = tacticalSignals.some((signal) =>
    ["mateThreat", "discoveredCheck", "validatedSkewer", "fork", "tacticalSequence"].includes(signal.type)
  );

  const isBestMove =
    bestMove &&
    lan &&
    String(bestMove).slice(0, 5).toLowerCase() === String(lan).slice(0, 5).toLowerCase();

  // Do not award ! to normal early book/development moves unless there is a
  // very concrete tactical payoff. This prevents moves like ...Nc6 from being
  // called excellent just because they are legal, good, and natural.
  if (isNormalOpeningMove(openingContext, moveIndex) && !hasForcingSignal && maxTargetValue < 5) {
    return null;
  }

  const hasConcretePayoff = hasForcingSignal || maxTargetValue >= 5;
  if (!hasConcretePayoff) return null;

  if (safeLoss <= 5 && isBestMove && (hasForcingSignal || maxTargetValue >= 9)) {
    return {
      label: "Brilliant",
      symbol: "!!",
      reason: describePositiveSignal(primarySignal),
    };
  }

  if (safeLoss <= 12 && isBestMove && hasConcretePayoff) {
    return {
      label: "Excellent",
      symbol: "!",
      reason: describePositiveSignal(primarySignal),
    };
  }

  return null;
}

export function analyzeMove(input) {
  const {
    fenBefore,
    fenAfter,
    san,
    side,
    bestMove,
    bestEval,
    playedEval,
    loss,
    moves,
    moveIndex,
    playedLine,
    greedyCaptureValidations,
    tacticalValidations,

  } = input;
  const previousSan = moves?.[moveIndex - 1]?.san;
  // 1. FEATURES
  const features = extractFeatures({
    fenBefore,
    fenAfter,
    san,
    side,
    previousSan,
    moves,
    moveIndex,
    playedLine,
    greedyCaptureValidations,
    tacticalValidations,
  });



  const detections = runDetectors(features);
  const openingContext = getOpeningMoveContext(moves, moveIndex);

  // 3. LABEL
  const label = getLabelFromEval(loss);
  const moveQuality = getPositiveMoveQuality({
    label,
    loss,
    bestMove,
    lan: input.lan ?? moves?.[moveIndex]?.lan ?? null,
    detections,
    openingContext,
    moveIndex,
  });

  // 4. PRIMARY SIGNAL
  const messageContext = createSignalMessageContext({
    san,
    fenBefore,
    label,
  });

  const messageSignals = selectMessageSignals(detections, messageContext);
  const primary = messageSignals[0] || null;

  const continuationMaterialSignal =
    detections.find((signal) => signal?.type === "continuationMaterialLoss") ||
    messageSignals.find((signal) => signal?.type === "continuationMaterialLoss") ||
    null;

  const relevantContinuation =
    continuationMaterialSignal?.tags?.relevantLineSans || null;

  const relevantContinuationUci =
    continuationMaterialSignal?.tags?.relevantLineUci || null;

  const greedyMaterialSignal =
    detections.find((signal) => signal?.type === "greedyCapturePunishment") ||
    messageSignals.find((signal) => signal?.type === "greedyCapturePunishment") ||
    null;

  const greedyMaterialPreview =
    greedyMaterialSignal?.tags?.greedyPreviewLineSans || null;


  // 5. EXPLANATION
  const explanation = explainMove({
    label,
    loss,
    san,
    bestMove,
    beforeEval: bestEval,
    afterEval: playedEval,
    playedEval,
    side,
    fenBefore,
    fenAfter,
    moveIndex,
    moves,
    playedLine,
    signal: primary,
    detections,
    openingContext,
  });



  // 6. OUTPUT STANDARD
  return {
    ply: input.ply,
    side,
    previousSan,
    san,
    fenBefore,
    fenAfter,

    bestMove: bestMove ?? null,
    bestLine: input.bestLine ?? input.pv ?? null,
    pv: input.pv ?? null,
    playedLine: input.playedLine ?? null,
    relevantContinuation,
    relevantContinuationUci,
    greedyMaterialPreview,
    bestContinuation: input.bestLine ?? input.pv ?? null,
    bestEval: bestEval ?? null,
    playedEval: playedEval ?? null,
    loss: Number.isFinite(loss) ? loss : null,
    lan: input.lan ?? moves?.[moveIndex]?.lan ?? null,

    label,
    moveQuality,
    qualitySymbol: moveQuality?.symbol ?? null,
    qualityLabel: moveQuality?.label ?? null,
    primary,
    messageSignals,
    detections,
    features,
    openingContext,
    explanation,
  };
}