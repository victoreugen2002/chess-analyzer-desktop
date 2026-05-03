import React from "react";
import { getMoveBadgeClass, getMoveSymbol } from "../chess/ui/uiHelpers";

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

              <button
                onMouseEnter={() => {
                  if (selectedPly === white?.ply) {
                    setHoveredMove(whiteAnalysis);
                  }
                }}
                onMouseLeave={() => setHoveredMove(null)}
                onClick={() => {
                  if (!white) return;
                  resetPreview();
                  setSelectedPly(white.ply);
                  setHoveredMove(whiteAnalysis);
                  sounds.playFromSan(white.san);
                }}
                className={`move-btn ${selectedPly === white?.ply ? "move-btn--active" : ""}`}
              >
                <div className="move-san">
                  {white?.san || ""}
                  {whiteAnalysis?.label && (
                    <span className={getMoveBadgeClass(whiteAnalysis.label)}>
                      {getMoveSymbol(whiteAnalysis.label)}
                    </span>
                  )}
                </div>
              </button>

              <button
                onMouseEnter={() => {
                  if (selectedPly === black?.ply) {
                    setHoveredMove(blackAnalysis);
                  }
                }}
                onMouseLeave={() => setHoveredMove(null)}
                onClick={() => {
                  if (!black) return;
                  resetPreview();
                  setSelectedPly(black.ply);
                  setHoveredMove(blackAnalysis);
                  sounds.playFromSan(black.san);
                }}
                className={`move-btn ${selectedPly === black?.ply ? "move-btn--active" : ""}`}
              >
                <div className="move-san">{black?.san || ""}</div>
                {blackAnalysis?.label ? (
                  <span className={getMoveBadgeClass(blackAnalysis.label)}>
                    {getMoveSymbol(blackAnalysis.label)}
                  </span>
                ) : null}
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}