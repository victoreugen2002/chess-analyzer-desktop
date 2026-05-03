import React from "react";
import { getMoveBadgeClass } from "../chess/ui/uiHelpers";
import { uciLineToSanLine } from "../chess/utils";
import { formatEval } from "../chess/explain/evalFormat";

export default function AnalysisCard({
  currentMove,
  currentAnalysis,
  hasAlternativeBestMove,
  setIsHoveringBestMove,
  playLinePreview,
}) {
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
                  playLinePreview(currentAnalysis.fenBefore, currentAnalysis.bestLine)
                }
                style={{ cursor: "pointer" }}
              >
                <span>Best continuation:</span>{" "}
                {uciLineToSanLine(currentAnalysis.fenBefore, currentAnalysis.bestLine, 8)}
              </div>

              <div
                className="pv-box"
                onClick={() =>
                  playLinePreview(currentMove?.fenBefore, currentAnalysis.playedLine)
                }
                style={{ cursor: "pointer" }}
              >
                <span>After your move:</span>{" "}
                {uciLineToSanLine(currentMove?.fenBefore, currentAnalysis.playedLine, 8)}
              </div>
            </>
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