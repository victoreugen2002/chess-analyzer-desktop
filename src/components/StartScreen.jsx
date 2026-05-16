function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.25" />
      <path d="M10 8.75v6.5L15.25 12Z" />
    </svg>
  );
}

function IconCoach() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.5 5.75h11A2.75 2.75 0 0 1 20.25 8.5v5.25a2.75 2.75 0 0 1-2.75 2.75H12l-4.5 3v-3h-1A2.75 2.75 0 0 1 3.75 13.75V8.5A2.75 2.75 0 0 1 6.5 5.75Z" />
      <path d="M8.4 11.4l2.1 2.1 4.9-5" />
    </svg>
  );
}

function IconReview() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.75" cy="10.75" r="5.75" />
      <path d="M15.25 15.25 19 19" />
      <path d="M8.5 10.9 10.2 12.6 13.5 9.3" />
    </svg>
  );
}

function IconHistory() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4.75h9.5A2.5 2.5 0 0 1 19 7.25v9.5a2.5 2.5 0 0 1-2.5 2.5H7a2.5 2.5 0 0 1-2.5-2.5v-9.5A2.5 2.5 0 0 1 7 4.75Z" />
      <path d="M8 8.5h7.5" />
      <path d="M8 12h7.5" />
      <path d="M8 15.5h4.75" />
    </svg>
  );
}


function IconPuzzle() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.25 6.75h7.5v3.5h-7.5Z" />
      <path d="M7 10.25h10v7a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2Z" />
      <path d="M9.5 14.25h5" />
      <path d="M12 11.75v5" />
    </svg>
  );
}

function IconProfile() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8.4" r="3.2" />
      <path d="M5.75 18.5c1.45-3.05 3.55-4.55 6.25-4.55s4.8 1.5 6.25 4.55" />
    </svg>
  );
}
const features = [
  "Move-by-move explanations",
  "Live coach feedback",
  "Opening book context",
  "Game summaries & ratings",
];

export default function StartScreen({
  bgStyle,
  chessIcon,
  onPlayGame,
  onPlayWithCoach,
  coachElo,
  coachLevelLabel,
  onCoachEloChange,
  onReviewGame,
  onGameHistory,
  onMyPuzzles,
  activeProfile,
  profiles = [],
  twoPlayerWhiteProfileId,
  twoPlayerBlackProfileId,
  onTwoPlayerWhiteChange,
  onTwoPlayerBlackChange,
  onProfile,
}) {
  const displayedElo = coachElo >= 3000 ? "3000+" : coachElo;
  const profileOptions = [
    ...profiles.map((profile) => ({
      id: profile.id,
      label: profile.name,
      rating: profile.currentRating || profile.startingRating || 1500,
    })),
    { id: "guest", label: "Guest / Player 2", rating: null },
  ];

  return (
    <div className="intro intro--premium" style={bgStyle}>
      <div className="intro-glow" />

      <div className="intro-card intro-card--premium">
        <div className="intro-icon intro-icon--premium">
          <img src={chessIcon} className="intro-logo" alt="Chess Analyzer" />
        </div>

        <div className="intro-kicker">Engine-powered chess coach</div>
        <h1>Chess Analyzer</h1>

        <p className="intro-subtitle">
          Play games, get live coach feedback, then review every move with clear engine-powered explanations.
        </p>

        <button className="intro-profile-chip" type="button" onClick={onProfile}>
          <span className="intro-profile-chip__icon"><IconProfile /></span>
          <span>Profile: <strong>{activeProfile?.name || "You"}</strong></span>
          <span className="intro-profile-chip__rating">~{activeProfile?.currentRating || 1500}</span>
        </button>

        <div className="intro-features intro-features--premium">
          {features.map((feature) => (
            <div key={feature} className="intro-feature-pill">
              <span>✓</span>
              {feature}
            </div>
          ))}
        </div>

        <div className="two-player-card">
          <div className="two-player-card__header">
            <div>
              <div className="two-player-card__label">2 Players setup</div>
              <div className="two-player-card__hint">Used only when starting Play Game.</div>
            </div>
          </div>

          <div className="two-player-selectors">
            <label className="two-player-select">
              <span>White</span>
              <select
                value={twoPlayerWhiteProfileId || activeProfile?.id || "guest"}
                onChange={(event) => onTwoPlayerWhiteChange?.(event.target.value)}
              >
                {profileOptions.map((option) => (
                  <option key={`white-${option.id}`} value={option.id}>
                    {option.label}{option.rating ? ` ~${option.rating}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="two-player-select">
              <span>Black</span>
              <select
                value={twoPlayerBlackProfileId || "guest"}
                onChange={(event) => onTwoPlayerBlackChange?.(event.target.value)}
              >
                {profileOptions.map((option) => (
                  <option key={`black-${option.id}`} value={option.id}>
                    {option.label}{option.rating ? ` ~${option.rating}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button onClick={onPlayGame} className="intro-action intro-action--primary intro-action--full">
            <span className="intro-action__icon"><IconPlay /></span>
            <span>Play Game</span>
          </button>
        </div>

        <div className="coach-level-card coach-level-card--attached">
          <div className="coach-level-card__header">
            <div>
              <div className="coach-level-card__label">Play with Coach level</div>
              <div className="coach-level-card__name">{coachLevelLabel}</div>
            </div>
            <div className="coach-level-card__elo">~{displayedElo}</div>
          </div>

          <input
            className="coach-level-slider"
            type="range"
            min="1800"
            max="3000"
            step="50"
            value={coachElo}
            onChange={(event) => onCoachEloChange(Number(event.target.value))}
          />

          <div className="coach-level-card__scale">
            <span>1800</span>
            <span>2200</span>
            <span>2500</span>
            <span>3000+</span>
          </div>

          <button onClick={onPlayWithCoach} className="intro-action intro-action--coach intro-action--coach-full">
            <span className="intro-action__icon"><IconCoach /></span>
            <span>Play with Coach</span>
          </button>
        </div>

        <div className="intro-actions intro-actions--premium intro-actions--secondary">
          <button onClick={onReviewGame} className="intro-action">
            <span className="intro-action__icon"><IconReview /></span>
            <span>Review Game</span>
          </button>

          <button onClick={onMyPuzzles} className="intro-action">
            <span className="intro-action__icon"><IconPuzzle /></span>
            <span>My Puzzles</span>
          </button>

          <button onClick={onGameHistory} className="intro-action">
            <span className="intro-action__icon"><IconHistory /></span>
            <span>Game History</span>
          </button>
        </div>
      </div>
    </div>
  );
}
