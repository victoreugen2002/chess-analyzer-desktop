import { buildAnalyzedMove } from "./buildAnalyzedMove";

export async function buildGameAnalysis({
  moves,
  depth,
  engineApi,
}) {
  if (!engineApi?.analyzeGame) {
    throw new Error("Engine API not available");
  }

  const raw = await engineApi.analyzeGame(moves, depth);
  const results = [];

  for (let index = 0; index < raw.length; index++) {
    const item = raw[index];

    const analyzedMove = await buildAnalyzedMove({
      item,
      moves,
      moveIndex: index,
      analyzeFen: engineApi.analyzeFen,
      depth,
    });

    results.push(analyzedMove);
  }

  return results;
}