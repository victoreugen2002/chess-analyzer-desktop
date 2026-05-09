import { useMemo, useState } from "react";
import { analyzeMove } from "../analysis/analyzeMove";
import { estimatePlayerRating, calculateAccuracy } from "../explain/gameSummary";
import { getOpeningInfo } from "../explain/openingInfo";
import { generateGameSummary, generateNarrativeSummary, generateGameTitle } from "../explain/gameSummary";
import { getAdvantageSide } from "../explain/labels";

export function useChessAnalysis(gameData) {
  const [analysis, setAnalysis] = useState([]);

  const analysisMap = useMemo(() => {
    const map = new Map();
    analysis.forEach((a) => map.set(a.ply, a));
    return map;
  }, [analysis]);

  const whiteMoves = useMemo(
    () => analysis.filter((m) => m.side === "w"),
    [analysis]
  );

  const blackMoves = useMemo(
    () => analysis.filter((m) => m.side === "b"),
    [analysis]
  );

  const whiteAccuracy = calculateAccuracy(whiteMoves);
  const blackAccuracy = calculateAccuracy(blackMoves);

  const whiteRating = estimatePlayerRating(analysis, gameData.result, "w");
  const blackRating = estimatePlayerRating(analysis, gameData.result, "b");

  const summary = useMemo(() => {
    const white = { Blunder: 0, Mistake: 0, Inaccuracy: 0 };
    const black = { Blunder: 0, Mistake: 0, Inaccuracy: 0 };

    analysis.forEach((item) => {
      const target = item.side === "w" ? white : black;
      if (target[item.label] != null) {
        target[item.label] += 1;
      }
    });

    return { white, black };
  }, [analysis]);

  const opening = useMemo(
    () => getOpeningInfo(gameData.moves),
    [gameData.moves]
  );

  const summaryText = useMemo(() => {
    return generateGameSummary(analysis, gameData.result);
  }, [analysis, gameData.result]);

  const narrativeText = useMemo(() => {
    return generateNarrativeSummary(
      analysis,
      gameData.result,
      getAdvantageSide
    );
  }, [analysis, gameData.result]);

  const gameTitle = useMemo(() => {
    return generateGameTitle(analysis, gameData.result);
  }, [analysis, gameData.result]);

  let betterPlayerText = "Both sides played at a similar level.";
  if (whiteAccuracy > blackAccuracy) betterPlayerText = "White played better overall.";
  if (blackAccuracy > whiteAccuracy) betterPlayerText = "Black played better overall.";

  async function runAnalysis(engineApi, moves, depth) {
    if (!engineApi?.analyzeGame) {
      throw new Error("Engine API not available");
    }

    const raw = await engineApi.analyzeGame(moves, depth);

    const results = raw.map((item, index) =>
      analyzeMove({
        ...item,
        moves,
        moveIndex: index,
      })
    );

    setAnalysis(results);
  }

  return {
    analysis,
    setAnalysis,

    analysisMap,

    whiteMoves,
    blackMoves,

    whiteAccuracy,
    blackAccuracy,

    whiteRating,
    blackRating,

    summary,

    opening,

    summaryText,
    narrativeText,
    gameTitle,

    betterPlayerText,

    runAnalysis,
  };
}