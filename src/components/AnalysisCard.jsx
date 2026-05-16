import React from "react";
import { getMoveBadgeClass } from "../chess/ui/uiHelpers";
import { uciLineToSanLine } from "../chess/utils";
import { formatEval } from "../chess/explain/evalFormat";
import { buildRelevantPreviewLine } from "../chess/ui/useLinePreview";

function buildPlayedMovePreviewLine(currentMove, currentAnalysis) {
  return buildRelevantPreviewLine({
    playedMove: currentAnalysis?.lan || currentMove?.lan || "",
    playedSan: currentAnalysis?.san || currentMove?.san || "",
    relevantLine: currentAnalysis?.relevantContinuationUci || currentAnalysis?.relevantContinuation || "",
    fallbackLine: currentAnalysis?.playedLine || "",
    includePlayedMove: true,
    maxMoves: 5,
  });
}

export default function AnalysisCard({
  currentMove,
  currentAnalysis,
  hasAlternativeBestMove,
  setIsHoveringBestMove,
  playLinePreview,
  previewInfo,
  resetPreview,
  stepPreviewBack,
  stepPreviewForward,
}) {
  const relevantContinuationText = currentAnalysis?.relevantContinuationUci
    ? uciLineToSanLine(
        currentMove?.fenAfter,
        currentAnalysis.relevantContinuationUci,
        6
      )
    : currentAnalysis?.relevantContinuation || "—";

  const hasRelevantContinuation =
    currentAnalysis?.relevantContinuationUci || currentAnalysis?.relevantContinuation;

  const greedyMaterialPreviewText =
    currentAnalysis?.greedyMaterialPreview || "—";

  const hasGreedyMaterialPreview =
    currentAnalysis?.greedyMaterialPreview;
  const playedMovePreviewLine = buildPlayedMovePreviewLine(currentMove, currentAnalysis);

  return (
    <div className="analysis-card">
      {currentMove ? (
        <>
          <div className="analysis-top">
            <div>
              <div className="analysis-label">Selected move</div>
              <div className="analysis-title">
                {currentMove.side === "w" ? "White" : "Black"} played {currentMove.san}
              </div>
            </div>
            <div className={getMoveBadgeClass(currentAnalysis?.label)}>
              {currentAnalysis?.label || "Not analyzed"}
            </div>
          </div>

          <div className="stat-grid">
            <div
              className="stat-box"
              style={{ cursor: hasAlternativeBestMove ? "pointer" : "default" }}
              onMouseEnter={() => hasAlternativeBestMove && setIsHoveringBestMove(true)}
              onMouseLeave={() => setIsHoveringBestMove(false)}
            >
              <span>Best move:</span>{" "}
              {currentAnalysis?.bestMove
                ? uciLineToSanLine(currentAnalysis.fenBefore, currentAnalysis.bestMove, 1)
                : "—"}
            </div>

            <div className="stat-box">
              <span>Best eval:</span> {formatEval(currentAnalysis?.bestEval)}
            </div>

            <div className="stat-box">
              <span>Played eval:</span> {formatEval(currentAnalysis?.playedEval)}
            </div>

            <div className="stat-box">
              <span>Centipawn loss:</span>{" "}
              {currentAnalysis ? Math.round(currentAnalysis.loss) : "—"}
            </div>
          </div>

          {currentAnalysis && currentAnalysis.label !== "Good" ? (
            <>
              <div
                className="pv-box"
                onClick={() =>
                  playLinePreview(currentAnalysis.fenBefore, currentAnalysis.bestLine, {
                    label: "Best continuation",
                    maxMoves: 6,
                  })
                }
                style={{ cursor: "pointer" }}
              >
                <span>Best continuation:</span>{" "}
                {uciLineToSanLine(currentAnalysis.fenBefore, currentAnalysis.bestLine, 6)}
              </div>

              <div
                className="pv-box"
                onClick={() =>
                  playLinePreview(currentMove?.fenBefore, playedMovePreviewLine, {
                    label: "After your move",
                    maxMoves: 6,
                  })
                }
                style={{ cursor: "pointer" }}
              >
                <span>After your move:</span>{" "}
                {uciLineToSanLine(currentMove?.fenBefore, playedMovePreviewLine, 6)}
              </div>

              {hasRelevantContinuation ? (
                <div
                  className="pv-box pv-box--relevant"
                  onClick={() =>
                    playLinePreview(
                      currentMove?.fenAfter,
                      currentAnalysis.relevantContinuationUci || currentAnalysis.relevantContinuation,
                      { label: "Preview" }
                    )
                  }
                  style={{ cursor: "pointer" }}
                >
                  <span>Relevant continuation:</span>{" "}
                  {relevantContinuationText}
                </div>
              ) : null}
            </>
          ) : null}

          {hasGreedyMaterialPreview ? (
            <div
              className="pv-box pv-box--greedy"
              onClick={() =>
                playLinePreview(
                  currentMove?.fenAfter,
                  currentAnalysis.greedyMaterialPreview,
                  { label: "Greedy preview" }
                )
              }
              style={{ cursor: "pointer" }}
            >
              <span>Greedy material line:</span>{" "}
              {greedyMaterialPreviewText}
            </div>
          ) : null}

          {previewInfo ? (
            <div className="line-preview-box">
              <div>
                <span>{previewInfo.label}:</span>{" "}
                {previewInfo.currentSan
                  ? `Move ${previewInfo.current}/${previewInfo.total}: ${previewInfo.currentSan}`
                  : previewInfo.lineSan}
                {!previewInfo.isPlaying && previewInfo.currentSan ? " · finished" : ""}
              </div>
              <div className="line-preview-controls">
                <button className="btn btn--ghost btn--mini" type="button" onClick={stepPreviewBack} disabled={!previewInfo.canStepBack}>
                  ← Step back
                </button>
                <button className="btn btn--ghost btn--mini" type="button" onClick={stepPreviewForward} disabled={!previewInfo.canStepForward}>
                  Step forward →
                </button>
                <button className="btn btn--ghost btn--mini" type="button" onClick={resetPreview}>
                  Back to game position
                </button>
              </div>
            </div>
          ) : null}

          <div className="coach-box">
            {currentAnalysis?.explanation ||
              "Run the analysis to generate a coach explanation for this move."}
          </div>
        </>
      ) : (
        <div className="empty-note">
          Select a move to see evaluation, best line, and explanation.
        </div>
      )}
    </div>
  );
}