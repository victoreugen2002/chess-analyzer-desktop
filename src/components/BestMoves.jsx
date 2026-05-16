function getSideLabel(side) {
  return side === "w" ? "White" : side === "b" ? "Black" : "Move";
}

function getQualityKind(item) {
  return item?.moveQuality?.label || item?.qualityLabel || "Excellent";
}

function getQualitySymbol(item) {
  return item?.moveQuality?.symbol || item?.qualitySymbol || "!";
}

function getQualityReason(item) {
  return (
    item?.moveQuality?.reason ||
    "This was a strong tactical or practical move worth reviewing."
  );
}

function getQualityScore(item) {
  const loss = Number.isFinite(item?.loss) ? Math.abs(item.loss) : 0;
  const isBrilliant = getQualityKind(item) === "Brilliant";
  const hasRealReason = Boolean(item?.moveQuality?.reason);

  return (
    (isBrilliant ? 1000 : 500) +
    (hasRealReason ? 80 : 0) +
    Math.max(0, 25 - loss)
  );
}

function buildBestMoves(analysis) {
  if (!Array.isArray(analysis) || !analysis.length) return [];

  return analysis
    .filter((item) => item?.moveQuality || item?.qualitySymbol)
    .map((item) => ({ item, score: getQualityScore(item) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ item }) => item)
    .sort((a, b) => a.ply - b.ply);
}

export default function BestMoves({ analysis, onSelectMove }) {
  const bestMoves = buildBestMoves(analysis);

  return (
    <div className="best-moves-card">
      <div className="best-moves-card__header">
        <div>
          <div className="analysis-label">Best Moves</div>
          <div className="best-moves-card__subtitle">
            Strong tactical and practical decisions from this game.
          </div>
        </div>
        <div className="best-moves-card__count">{bestMoves.length}</div>
      </div>

      {bestMoves.length ? (
        <div className="best-moves-list">
          {bestMoves.map((move) => {
            const moveNumber = Math.ceil(move.ply / 2);
            const movePrefix = move.side === "b" ? `${moveNumber}...` : `${moveNumber}.`;
            const kind = getQualityKind(move);

            return (
              <button
                key={`${move.ply}-${move.san}`}
                type="button"
                className={`best-move best-move--${kind.toLowerCase()}`}
                onClick={() => onSelectMove?.(move.ply)}
              >
                <div className="best-move__topline">
                  <span className="best-move__kind">
                    {kind} {getQualitySymbol(move)}
                  </span>
                  <span className="best-move__move">
                    {movePrefix} {move.san}
                  </span>
                </div>

                <div className="best-move__title">
                  {getSideLabel(move.side)} played {move.san}
                </div>

                <div className="best-move__text">{getQualityReason(move)}</div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="best-moves-empty">
          No standout tactical moves were detected yet. Strong moves marked with ! or !! will appear here after analysis.
        </div>
      )}
    </div>
  );
}
