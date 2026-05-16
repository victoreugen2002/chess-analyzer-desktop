import React from "react";
import { getMoveBadgeClass, getMoveSymbol } from "../chess/ui/uiHelpers";

function getAnalysisBadge(analysis) {
  if (!analysis) return null;

  if (analysis.qualitySymbol) {
    return {
      className:
        analysis.qualityLabel === "Brilliant"
          ? "badge badge--brilliant"
          : "badge badge--excellent",
      symbol: analysis.qualitySymbol,
    };
  }

  if (!analysis.label || analysis.label === "Good") return null;

  return {
    className: getMoveBadgeClass(analysis.label),
    symbol: getMoveSymbol(analysis.label),
  };
}

function MoveCell({ move, analysis, selectedPly, setSelectedPly, setHoveredMove, resetPreview, sounds }) {
  const badge = getAnalysisBadge(analysis);

  return (
    <button
      onMouseEnter={() => {
        if (selectedPly === move?.ply) {
          setHoveredMove(analysis);
        }
      }}
      onMouseLeave={() => setHoveredMove(null)}
      onClick={() => {
        if (!move) return;
        resetPreview();
        setSelectedPly(move.ply);
        setHoveredMove(analysis);
        sounds.playFromSan(move.san);
      }}
      className={`move-btn ${selectedPly === move?.ply ? "move-btn--active" : ""}`}
    >
      <div className="move-san">
        {move?.san || ""}
        {badge && <span className={badge.className}>{badge.symbol}</span>}
      </div>
    </button>
  );
}

export default function MoveList({
  gameData,
  analysisMap,
  selectedPly,
  setSelectedPly,
  setHoveredMove,
  resetPreview,
  sounds,
  moveListRef,
}) {
  return (
    <div className="move-list" ref={moveListRef}>
      <div className="move-list-grid">
        {Array.from({ length: Math.ceil(gameData.moves.length / 2) }).map((_, idx) => {
          const white = gameData.moves[idx * 2];
          const black = gameData.moves[idx * 2 + 1];
          const whiteAnalysis = white ? analysisMap.get(white.ply) : null;
          const blackAnalysis = black ? analysisMap.get(black.ply) : null;

          return (
            <React.Fragment key={idx}>
              <div className="move-number">{idx + 1}</div>

              <MoveCell
                move={white}
                analysis={whiteAnalysis}
                selectedPly={selectedPly}
                setSelectedPly={setSelectedPly}
                setHoveredMove={setHoveredMove}
                resetPreview={resetPreview}
                sounds={sounds}
              />

              <MoveCell
                move={black}
                analysis={blackAnalysis}
                selectedPly={selectedPly}
                setSelectedPly={setSelectedPly}
                setHoveredMove={setHoveredMove}
                resetPreview={resetPreview}
                sounds={sounds}
              />
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
