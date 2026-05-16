function getSideLabel(side) {
  return side === "w" ? "White" : side === "b" ? "Black" : "Move";
}

function isGenericMoveText(item, text) {
  const san = String(item?.san || "").replace(/[+#?!]+/g, "");
  const side = getSideLabel(item?.side);
  const normalized = String(text || "").trim().replace(/[+#?!]+/g, "");

  return (
    !normalized ||
    normalized === `${side} played ${san}.` ||
    normalized === `${side} played ${san}` ||
    /^\w+ played .+\.?$/.test(normalized)
  );
}

function getLoss(item) {
  return Number.isFinite(item?.loss) ? Math.abs(item.loss) : 0;
}

function isOpeningExit(item) {
  const explanation = String(item?.explanation || "").toLowerCase();
  return (
    explanation.includes("leaves the opening book") ||
    explanation.includes("beyond the exact book line") ||
    explanation.includes("no longer in the exact book line")
  );
}

function isClearlyNormalOpeningMove(item) {
  const explanation = String(item?.explanation || "").toLowerCase();
  return (
    explanation.includes("normal move") ||
    explanation.includes("normal thematic move") ||
    explanation.includes("still a normal")
  );
}

function getLossText(item) {
  const cp = Math.round(getLoss(item));
  if (cp < 100) return "";

  if (cp >= 250) {
    return `This was a major turning point: the position worsened by about ${cp} centipawns.`;
  }

  return `This was an important moment: the position worsened by about ${cp} centipawns.`;
}

function getShortExplanation(item) {
  const text = item?.explanation;
  const firstSentence = String(text || "").split(/(?<=[.!?])\s+/)[0];

  if (!text || isGenericMoveText(item, firstSentence)) {
    const fallback = getLossText(item);
    if (fallback) return `${fallback} Review the engine recommendation here.`;
    return "Review this move with the engine recommendation.";
  }

  return firstSentence.length > 150
    ? `${firstSentence.slice(0, 147).trim()}...`
    : firstSentence;
}

function hasRealExplanation(item) {
  const text = item?.explanation;
  if (!text) return false;

  const firstSentence = String(text).split(/(?<=[.!?])\s+/)[0];
  return !isGenericMoveText(item, firstSentence);
}

function getMomentKind(item) {
  if (item?.label === "Blunder") return "Blunder";
  if (item?.label === "Mistake") return "Mistake";
  if (item?.label === "Inaccuracy") return "Inaccuracy";
  if (isOpeningExit(item)) return "Opening turning point";
  return "Critical moment";
}

function getMomentScore(item) {
  const loss = getLoss(item);
  let score = loss;

  if (item?.label === "Blunder") score += 1000;
  else if (item?.label === "Mistake") score += 700;
  else if (item?.label === "Inaccuracy") score += 260;

  if (isOpeningExit(item)) score += 120;
  if (hasRealExplanation(item)) score += 80;

  return score;
}

function isCandidateMoment(item) {
  if (!item || !item.ply) return false;

  const loss = getLoss(item);

  if (item.label === "Blunder") return true;
  if (item.label === "Mistake") return loss >= 100;
  if (item.label === "Inaccuracy") return loss >= 120;

  // Opening moments belong here only if they actually hurt the position.
  // Normal theoretical deviations should not appear as critical moments.
  if (isOpeningExit(item) && !isClearlyNormalOpeningMove(item) && loss >= 100) {
    return true;
  }

  return false;
}

function buildCriticalMoments(analysis) {
  if (!Array.isArray(analysis) || !analysis.length) return [];

  const candidates = analysis
    .filter(isCandidateMoment)
    .map((item) => ({
      item,
      score: getMomentScore(item),
    }))
    .sort((a, b) => b.score - a.score);

  const selected = [];
  const usedPlies = new Set();
  let usedOpeningMoment = false;

  for (const candidate of candidates) {
    const item = candidate.item;
    const ply = item.ply;
    const kind = getMomentKind(item);

    if (usedPlies.has(ply)) continue;
    if (kind === "Opening turning point" && usedOpeningMoment) continue;

    selected.push(item);
    usedPlies.add(ply);

    if (kind === "Opening turning point") usedOpeningMoment = true;
    if (selected.length >= 3) break;
  }

  return selected.sort((a, b) => a.ply - b.ply);
}

export default function CriticalMoments({ analysis, onSelectMoment }) {
  const moments = buildCriticalMoments(analysis);

  return (
    <div className="critical-moments-card">
      <div className="critical-moments-card__header">
        <div>
          <div className="analysis-label">Critical Moments</div>
          <div className="critical-moments-card__subtitle">
            Top turning points and costly decisions from this game.
          </div>
        </div>
        <div className="critical-moments-card__count">{moments.length}</div>
      </div>

      {moments.length ? (
        <div className="critical-moments-list">
          {moments.map((moment) => {
            const kind = getMomentKind(moment);
            const moveNumber = Math.ceil(moment.ply / 2);
            const movePrefix = moment.side === "b" ? `${moveNumber}...` : `${moveNumber}.`;

            return (
              <button
                key={`${moment.ply}-${moment.san}`}
                type="button"
                className={`critical-moment critical-moment--${String(moment.label || kind)
                  .toLowerCase()
                  .replace(/\s+/g, "-")}`}
                onClick={() => onSelectMoment?.(moment.ply)}
              >
                <div className="critical-moment__topline">
                  <span className="critical-moment__kind">{kind}</span>
                  <span className="critical-moment__move">
                    {movePrefix} {moment.san}
                  </span>
                </div>

                <div className="critical-moment__title">
                  {getSideLabel(moment.side)} played {moment.san}
                  {Number.isFinite(moment.loss) && moment.label !== "Good"
                    ? ` · ${Math.round(Math.abs(moment.loss))} cp loss`
                    : ""}
                </div>

                <div className="critical-moment__text">
                  {getShortExplanation(moment)}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="critical-moments-empty">
          No major turning points were detected. Mistakes, blunders, and large evaluation drops will appear here after analysis.
        </div>
      )}
    </div>
  );
}
