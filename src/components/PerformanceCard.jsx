function UserPerformanceIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8.4" r="3.2" />
      <path d="M5.75 18.5c1.45-3.05 3.55-4.55 6.25-4.55s4.8 1.5 6.25 4.55" />
    </svg>
  );
}

function CoachPerformanceIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 9l3 3 3-5 3 5 3-3" />
      <path d="M7.5 14.5h9" />
      <path d="M8.5 18h7" />
    </svg>
  );
}

export default function PerformanceCard({ performanceCards, title, mode }) {
  if (!performanceCards?.length) return null;

  return (
    <div className="performance-card">
      <div className="performance-card__header">
        <div className="analysis-label">{title}</div>
      </div>

      <div className="performance-card__rows">
        {performanceCards.map((item, index) => {
          const isCoach = String(item.label || "").toLowerCase().includes("coach");

          return (
            <div
              key={item.side}
              className={`performance-card__row ${index === 0 ? "is-primary" : "is-secondary"}`}
            >
              <div className="performance-card__identity">
                <span className="performance-card__avatar" aria-hidden="true">
                  {isCoach ? <CoachPerformanceIcon /> : <UserPerformanceIcon />}
                </span>

                <div className="performance-card__text">
                  <div className="performance-card__name">{item.label}</div>
                  <div className="performance-card__meta">
                    {item.accuracy}% accuracy · {item.moveCount} moves
                  </div>
                </div>
              </div>

              <div className="performance-card__rating">~{item.rating}</div>
            </div>
          );
        })}
      </div>

      {mode !== "review" && (
        <div className="performance-card__note">
          Estimates play quality in this game, not selected coach strength.
        </div>
      )}
    </div>
  );
}
