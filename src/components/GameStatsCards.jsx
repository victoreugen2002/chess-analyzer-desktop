export default function GameStatsCards({
  whiteRating,
  blackRating,
  whiteAccuracy,
  blackAccuracy,
  summary,
  betterPlayerText,
}) {
  return (
    <div className="summary-wrapper">
      <div className="summary-grid">
        <div className="summary-card">
          <div className="summary-label">White</div>
          <div className="summary-rating">
            <span className="summary-rating__label">Game Rating</span>
            <span className="summary-rating__value">{whiteRating}</span>
          </div>
          <div className="summary-accuracy">
            <strong>{whiteAccuracy}%</strong> accuracy
          </div>
          <div className="accuracy-bar">
            <div className="accuracy-fill" style={{ width: `${whiteAccuracy}%` }} />
          </div>

          <div className="summary-mini-grid">
            <div className="summary-mini">
              <span className="summary-mini__label">Inaccuracies</span>
              <span className="summary-value summary-value--inaccuracy">
                {summary.white.Inaccuracy}
              </span>
            </div>

            <div className="summary-mini">
              <span className="summary-mini__label">Mistakes</span>
              <span className="summary-value summary-value--mistake">
                {summary.white.Mistake}
              </span>
            </div>

            <div className="summary-mini">
              <span className="summary-mini__label">Blunders</span>
              <span className="summary-value summary-value--blunder">
                {summary.white.Blunder}
              </span>
            </div>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-label">Black</div>
          <div className="summary-rating">
            <span className="summary-rating__label">Game Rating</span>
            <span className="summary-rating__value">{blackRating}</span>
          </div>
          <div className="summary-accuracy">
            <strong>{blackAccuracy}%</strong> accuracy
          </div>
          <div className="accuracy-bar">
            <div className="accuracy-fill" style={{ width: `${blackAccuracy}%` }} />
          </div>

          <div className="summary-mini-grid">
            <div className="summary-mini">
              <span className="summary-mini__label">Inaccuracies</span>
              <span className="summary-value summary-value--inaccuracy">
                {summary.black.Inaccuracy}
              </span>
            </div>

            <div className="summary-mini">
              <span className="summary-mini__label">Mistakes</span>
              <span className="summary-value summary-value--mistake">
                {summary.black.Mistake}
              </span>
            </div>

            <div className="summary-mini">
              <span className="summary-mini__label">Blunders</span>
              <span className="summary-value summary-value--blunder">
                {summary.black.Blunder}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="summary-overview">
        {betterPlayerText}
      </div>
    </div>
  );
}