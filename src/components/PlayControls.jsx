function IconNewGame() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="7.25" />
      <path d="M12 8.4v7.2M8.4 12h7.2" />
    </svg>
  );
}

function IconLoadGame() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.25 5.25h7.5l3 3v10.5H7.25Z" />
      <path d="M14.75 5.25v3h3" />
      <path d="M9.75 14.25h5.5" />
      <path d="M12.5 11.5l2.75 2.75L12.5 17" />
    </svg>
  );
}

function IconTakeBack() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9.25 7.25 4.5 12l4.75 4.75" />
      <path d="M5.25 12h8.25a5.25 5.25 0 1 1 0 10.5h-1.25" />
    </svg>
  );
}

function IconOfferDraw() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.25 7.25h11.5" />
      <path d="M6.25 12h11.5" />
      <path d="M6.25 16.75h11.5" />
      <path d="M7.25 4.75h9.5A2.25 2.25 0 0 1 19 7v10a2.25 2.25 0 0 1-2.25 2.25h-9.5A2.25 2.25 0 0 1 5 17V7a2.25 2.25 0 0 1 2.25-2.25Z" />
    </svg>
  );
}

function IconResign() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.25 19.5V5" />
      <path d="M7.25 5h9.1c.52 0 .83.57.55 1.01L15.1 8.8l1.8 2.8c.28.44-.03 1.01-.55 1.01h-9.1" />
    </svg>
  );
}

function IconReview() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.75" cy="10.75" r="5.75" />
      <path d="m15.25 15.25 4 4" />
      <path d="M8.75 10.9 10.25 12.4 13.25 9.25" />
    </svg>
  );
}

export default function PlayControls({
  mode,
  coachEnabled,
  coachElo,
  coachLevelLabel,
  onToggleCoach,
  analysisCount,
  onNewGame,
  onReviewCurrentGame,
  canReviewCurrentGame,
  onLoadGame,
  canLoadGame,
  onTakeBack,
  canTakeBack,
  onOfferDraw,
  canOfferDraw,
  onResign,
  canResign,
}) {
  const isReviewMode = mode === "review";

  return (
    <div className="panel-head play-controls">
      <div className="play-controls__topline">
        <div className="play-controls__status-group">
          {!isReviewMode && (
            <button
              onClick={onToggleCoach}
              className={`coach-toggle ${coachEnabled ? "is-on" : ""}`}
            >
              <span className="coach-toggle__dot" />
              Coach: {coachEnabled ? "ON" : "OFF"}
            </button>
          )}

          {!isReviewMode && (
            <div className="coach-level-pill" title={`Selected coach strength: ${coachLevelLabel} ${coachElo >= 3000 ? "3000+" : coachElo}`}>
              {coachLevelLabel} · {coachElo >= 3000 ? "3000+" : coachElo}
            </div>
          )}
        </div>

        <div className={`analysis-status ${analysisCount ? "is-analyzed" : ""}`}>
          {analysisCount ? "Analyzed" : "Waiting"}
        </div>
      </div>

      <div className="panel-head--row play-controls__title-row">
        <h2 className="panel-title">Move Review</h2>
      </div>

      {!isReviewMode && (
        <div className="play-controls__grid">
          <button onClick={onNewGame} className="btn btn--premium btn--new-game">
            <span className="btn-icon btn-icon--new-game"><IconNewGame /></span>
            <span className="btn-label">New Game</span>
          </button>

          <button
            onClick={onLoadGame}
            disabled={!canLoadGame}
            className="btn btn--premium btn--load-game"
          >
            <span className="btn-icon btn-icon--load-game"><IconLoadGame /></span>
            <span className="btn-label">Load Game</span>
          </button>

          <button
            onClick={onTakeBack}
            disabled={!canTakeBack}
            className="btn btn--premium btn--take-back"
          >
            <span className="btn-icon btn-icon--take-back"><IconTakeBack /></span>
            <span className="btn-label">Take Back</span>
          </button>

          <button
            onClick={onOfferDraw}
            disabled={!canOfferDraw}
            className="btn btn--premium btn--offer-draw"
          >
            <span className="btn-icon btn-icon--offer-draw"><IconOfferDraw /></span>
            <span className="btn-label">Offer Draw</span>
          </button>

          <button
            onClick={onResign}
            disabled={!canResign}
            className="btn btn--premium btn--resign"
          >
            <span className="btn-icon btn-icon--resign"><IconResign /></span>
            <span className="btn-label">Resign</span>
          </button>

          <button
            onClick={onReviewCurrentGame}
            disabled={!canReviewCurrentGame}
            className="btn btn--premium btn--review-game"
          >
            <span className="btn-icon btn-icon--review-game"><IconReview /></span>
            <span className="btn-label">Review Game</span>
          </button>
        </div>
      )}
    </div>
  );
}
