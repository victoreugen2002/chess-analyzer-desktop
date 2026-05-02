import { extractFeatures } from "./extractFeatures";
import { runDetectors } from "./runDetectors";
import { explainMove } from "../explain/explainMove";
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

  } = input;
  const previousSan = moves?.[moveIndex - 1]?.san;
  // 1. FEATURES
  const features = extractFeatures({
    fenBefore,
    fenAfter,
    san,
    side,
    previousSan
  });



  const detections = runDetectors(features);
  const primary = detections[0] || null;

  // 3. LABEL
  const label = getLabelFromEval(loss);



  // 4. EXPLANATION
  const explanation = explainMove({
    label,
    loss,
    san,
    bestMove,
    beforeEval: bestEval,
    afterEval: playedEval,
    side,
    fenBefore,
    fenAfter,
    moveIndex,
    moves,
    playedLine,
    signal: primary,
    detections,
  });



  // 5. OUTPUT STANDARD
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
    detections,
    features,
    explanation,
  };
}