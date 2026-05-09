import { analyzeMove } from "./analyzeMove";
import { buildGreedyCaptureValidations } from "./greedyCaptureValidation";
import { buildTacticalValidations } from "./tacticalValidation";

export async function buildAnalyzedMove({
  item,
  moves,
  moveIndex,
  analyzeFen,
  depth,
}) {
  const safeDepth = Math.min(depth, 10);

  const greedyCaptureValidations = await buildGreedyCaptureValidations({
    item,
    moves,
    moveIndex,
    analyzeFen,
    depth: safeDepth,
  });

  const tacticalValidations = await buildTacticalValidations({
    item,
    analyzeFen,
    depth: safeDepth,
  });

  return analyzeMove({
    ...item,
    moves,
    moveIndex,
    greedyCaptureValidations,
    tacticalValidations,
  });
}