import { getSavedGameDisplayInfo } from "../chess/storage/gameStorage";

function formatSavedGameDate(date) {
  if (!date) return "Unknown date";

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(date));
  } catch {
    return date;
  }
}

export default function GameHistoryPanel({
  bgStyleApp,
  onBack,
  savedGames,
  refreshSavedGames,
  openSavedGame,
  removeSavedGame,
}) {
  return (
    <div className="app-bg" style={bgStyleApp}>
      <button
        onClick={onBack}
        className="btn btn--ghost"
        style={{ marginBottom: "10px" }}
      >
        ← Back
      </button>

      <div className="app-wrap">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h1 className="page-title">Game History</h1>
              <p className="panel-subtitle">
                Saved games can be reopened in Game Review.
              </p>
            </div>

            <button className="btn btn--ghost" onClick={refreshSavedGames}>
              Refresh
            </button>
          </div>

          {savedGames.length === 0 ? (
            <div className="coach-box" style={{ marginTop: "14px" }}>
              No saved games yet. Play a game and use Review this game, or analyze an imported PGN.
            </div>
          ) : (
            <div style={{ display: "grid", gap: "12px", marginTop: "16px" }}>
              {savedGames.map((savedGame) => {
                const displayInfo = getSavedGameDisplayInfo(savedGame);

                return (
                  <div
                    key={savedGame.id}
                    className="analysis-card"
                    style={{
                      display: "grid",
                      gap: "10px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "16px" }}>
                          {displayInfo.title || "Saved game"}
                        </div>
                        <div style={{ opacity: 0.75, marginTop: "4px" }}>
                          {formatSavedGameDate(savedGame.date)}
                        </div>
                      </div>

                      <div style={{ opacity: 0.8 }}>
                        {savedGame.moveCount || savedGame.gameData?.moves?.length || 0} plies · Result {displayInfo.resultLabel}
                      </div>
                    </div>

                    {(savedGame.meta?.openingName || savedGame.meta?.openingEco) && (
                      <div className="coach-box">
                        Opening: <strong>{savedGame.meta.openingName || "Unknown opening"}</strong>
                        {savedGame.meta.openingEco ? ` (${savedGame.meta.openingEco})` : ""}
                      </div>
                    )}

                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <button className="btn btn--success" onClick={() => openSavedGame(savedGame)}>
                        Open Review
                      </button>
                      <button className="btn btn--ghost" onClick={() => removeSavedGame(savedGame.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
