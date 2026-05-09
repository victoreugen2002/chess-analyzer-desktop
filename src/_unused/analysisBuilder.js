import { analyzeMove } from "../analysis/analyzeMove";

export function buildAnalysisResults(raw, moves) {
  return raw.map((item, index) =>
    analyzeMove({
      ...item,
      moves,
      moveIndex: index,
    })
  );
}