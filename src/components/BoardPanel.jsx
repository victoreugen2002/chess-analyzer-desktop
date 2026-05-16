import Board from "./Board";
import { formatEval } from "../chess/explain/evalFormat";
import { getProgressWidth } from "../chess/ui/uiHelpers";

export default function BoardPanel({
  currentFen,
  boardSize,
  boardHoveredMove,
  boardHighlights,
  bestMoveArrow,
  handleSquareClick,
  handleMove,
  selectedPly,
  setSelectedPly,
  gameData,
  sounds,
  resetPreview,
  currentAnalysis,
}) {
  function goToStart() {
    resetPreview();

    if (selectedPly !== 0) {
      sounds.playMove();
    }

    setSelectedPly(0);
  }

  function goToPreviousMove() {
    resetPreview();

    setSelectedPly((value) => {
      const nextValue = Math.max(0, value - 1);

      if (nextValue !== value) {
        sounds.playMove();
      }

      return nextValue;
    });
  }

  function goToNextMove() {
    resetPreview();

    setSelectedPly((value) => {
      const nextValue = Math.min(gameData.moves.length, value + 1);

      if (nextValue !== value && nextValue > 0) {
        const move = gameData.moves[nextValue - 1];
        sounds.playFromSan(move?.san);
      }

      return nextValue;
    });
  }

  return (
    <section className="panel panel--board">
      <div className="board-top-row">
        <div>
          <h2 className="panel-title">Board Review</h2>
          <p className="panel-subtitle">
            Use ← → or buttons to navigate moves.
          </p>
        </div>

        <div className="eval-card">
          <div className="eval-head">
            <span>Evaluation</span>
            <span>{formatEval(currentAnalysis?.playedEval ?? 0)}</span>
          </div>
          <div className="eval-track">
            <div
              className="eval-fill"
              style={{ width: `${getProgressWidth(currentAnalysis?.playedEval ?? 0)}%` }}
            />
          </div>
        </div>
      </div>

      <Board
        fen={currentFen}
        size={boardSize}
        hoveredMove={boardHoveredMove}
        highlights={boardHighlights}
        arrowFrom={bestMoveArrow?.from}
        arrowTo={bestMoveArrow?.to}
        onSquareClick={handleSquareClick}
        onMove={handleMove}
      />

      <div className="nav-row">
        <button onClick={goToStart} className="btn btn--ghost">
          Start
        </button>
        <button onClick={goToPreviousMove} className="btn btn--ghost">
          Previous
        </button>
        <button onClick={goToNextMove} className="btn btn--ghost">
          Next
        </button>
        <div className="ply-box">
          Ply <strong>{selectedPly}</strong> / {gameData.moves.length}
        </div>
      </div>
    </section>
  );
}
