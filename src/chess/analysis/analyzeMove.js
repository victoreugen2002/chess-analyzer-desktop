import { extractFeatures } from "./extractFeatures";
import { runDetectors } from "./runDetectors";
import {
  createSignalMessageContext,
  explainMove,
  selectMessageSignals,
} from "../explain/explainMove";
import { getLabelFromEval  } from "../explain/labels";

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

  // 3. LABEL
  const label = getLabelFromEval(loss);

  // 4. PRIMARY SIGNAL
  const messageContext = createSignalMessageContext({
    san,
    fenBefore,
    label,
  });

  const messageSignals = selectMessageSignals(detections, messageContext);
  const primary = messageSignals[0] || null;


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
    bestContinuation: input.bestLine ?? input.pv ?? null,
    bestEval: bestEval ?? null,
    playedEval: playedEval ?? null,
    loss: Number.isFinite(loss) ? loss : null,
    lan: input.lan ?? moves?.[moveIndex]?.lan ?? null,

    label,
    primary,
    messageSignals,
    detections,
    features,
    explanation,
  };
}