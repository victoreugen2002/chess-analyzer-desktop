import GameStatsCards from "./GameStatsCards";

export default function PgnPanel({
  pgn, setPgn, error, depth, setDepth,
  importPgn, runAnalysis, isAnalyzing, gameData,
  whiteRating, blackRating, whiteAccuracy, blackAccuracy,
  summary, betterPlayerText,
}) {
  return (

    <section className="panel">
        <div className="panel-head">
        <h2 className="panel-title">PGN Import</h2>
        <p className="panel-subtitle">
            Paste a PGN → Import → Run Analysis.
        </p>
        </div>

        <label className="field-label">PGN</label>
        
        <textarea value={pgn} onChange={(e) => setPgn(e.target.value)} className="pgn-input" />
        {error ? <div className="error-box">{error}</div> : null}
        <div className="range-row">
        <label className="field-label">Depth</label>
        <input type="range" min="10" max="20" value={depth} onChange={(e) => setDepth(Number(e.target.value))} className="depth-slider" />
        <div className="meta-line">Depth: {depth}</div>
        </div>

        <div className="button-grid">
        <button onClick={importPgn} className="btn btn--primary">Import PGN</button>
        <button onClick={() => runAnalysis()} disabled={isAnalyzing || gameData.moves.length === 0} className="btn btn--success">{isAnalyzing ? "Analyzing..." : "Run Analysis"}</button>
        </div>

        <GameStatsCards
            whiteRating={whiteRating}
            blackRating={blackRating}
            whiteAccuracy={whiteAccuracy}
            blackAccuracy={blackAccuracy}
            summary={summary}
            betterPlayerText={betterPlayerText}
        />


    </section>

  );
}