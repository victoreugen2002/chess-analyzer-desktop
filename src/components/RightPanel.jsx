import AnalysisCard from "./AnalysisCard";
import GameStatsCards from "./GameStatsCards";
import MoveList from "./MoveList";
import CriticalMoments from "./CriticalMoments";
import BestMoves from "./BestMoves";
import PerformanceCard from "./PerformanceCard";
import PlayControls from "./PlayControls";
import { buildRelevantPreviewLine } from "../chess/ui/useLinePreview";

function buildPlayedMovePreviewLine(currentMove, currentAnalysis) {
  return buildRelevantPreviewLine({
    playedMove: currentAnalysis?.lan || currentMove?.lan || "",
    playedSan: currentAnalysis?.san || currentMove?.san || "",
    relevantLine: currentAnalysis?.relevantContinuationUci || currentAnalysis?.relevantContinuation || "",
    fallbackLine: currentAnalysis?.playedLine || "",
    includePlayedMove: true,
    maxMoves: 5,
  });
}

function getPreviewInfoText(previewInfo) {
  if (!previewInfo) return "";

  const current = previewInfo.currentSan
    ? `Move ${previewInfo.current}/${previewInfo.total}: ${previewInfo.currentSan}`
    : previewInfo.lineSan;

  return `${current}${!previewInfo.isPlaying && previewInfo.currentSan ? " · finished" : ""}`;
}

export default function RightPanel({
  rightTab,
  setRightTab,
  mode,
  showPlayAnalysis,
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
  performanceCards,
  performanceCardTitle,
  analysis,
  gameData,
  analysisMap,
  selectedPly,
  setSelectedPly,
  setHoveredMove,
  resetPreview,
  sounds,
  moveListRef,
  fullAnalysisVisible,
  currentMove,
  currentAnalysis,
  hasAlternativeBestMove,
  setIsHoveringBestMove,
  playLinePreview,
  previewInfo,
  stepPreviewBack,
  stepPreviewForward,
  coachMessage,
  waitingForCoachConfirm,
  setWaitingForCoachConfirm,
  makeEngineMove,
  whiteRating,
  blackRating,
  whiteAccuracy,
  blackAccuracy,
  summary,
  betterPlayerText,
  gameTitle,
  opening,
  summaryText,
  showStory,
  setShowStory,
  narrativeText,
}) {
  const canShowSummaryTab = mode === "review" || showPlayAnalysis;
  const canShowAnalysisCard = mode === "review" || fullAnalysisVisible;
  const canShowCoachMessage =
    coachEnabled && coachMessage && !fullAnalysisVisible && mode !== "review";
  const liveCoachPreviewLine = canShowCoachMessage
    ? buildPlayedMovePreviewLine(currentMove, currentAnalysis)
    : "";
  const canPreviewLiveCoachLine = Boolean(
    canShowCoachMessage &&
    currentMove?.fenBefore &&
    liveCoachPreviewLine &&
    ["Mistake", "Blunder"].includes(currentAnalysis?.label)
  );

  return (
    <section className="panel panel--right right-panel-premium">
      <div className="tabs">
        <button
          className={rightTab === "moves" ? "is-active" : ""}
          onClick={() => setRightTab("moves")}
        >
          Moves
        </button>

        {canShowSummaryTab && (
          <button
            className={rightTab === "summary" ? "is-active" : ""}
            onClick={() => setRightTab("summary")}
          >
            Summary
          </button>
        )}
      </div>

      {rightTab === "moves" && (
        <>
          <PlayControls
            mode={mode}
            coachEnabled={coachEnabled}
            coachElo={coachElo}
            coachLevelLabel={coachLevelLabel}
            onToggleCoach={onToggleCoach}
            analysisCount={analysisCount}
            onNewGame={onNewGame}
            onReviewCurrentGame={onReviewCurrentGame}
            canReviewCurrentGame={canReviewCurrentGame}
            onLoadGame={onLoadGame}
            canLoadGame={canLoadGame}
            onTakeBack={onTakeBack}
            canTakeBack={canTakeBack}
            onOfferDraw={onOfferDraw}
            canOfferDraw={canOfferDraw}
            onResign={onResign}
            canResign={canResign}
          />

          <PerformanceCard
            performanceCards={performanceCards}
            title={performanceCardTitle}
            mode={mode}
          />

          <MoveList
            gameData={gameData}
            analysisMap={analysisMap}
            selectedPly={selectedPly}
            setSelectedPly={setSelectedPly}
            setHoveredMove={setHoveredMove}
            resetPreview={resetPreview}
            sounds={sounds}
            moveListRef={moveListRef}
          />

          {canShowAnalysisCard && (
            <AnalysisCard
              currentMove={currentMove}
              currentAnalysis={currentAnalysis}
              hasAlternativeBestMove={hasAlternativeBestMove}
              setIsHoveringBestMove={setIsHoveringBestMove}
              playLinePreview={playLinePreview}
              previewInfo={previewInfo}
              resetPreview={resetPreview}
              stepPreviewBack={stepPreviewBack}
              stepPreviewForward={stepPreviewForward}
            />
          )}

          {canShowCoachMessage && (
            <div className="coach-box coach-box--live">
              <div>{coachMessage}</div>

              {canPreviewLiveCoachLine && (
                <button
                  className="btn btn--ghost"
                  type="button"
                  style={{ marginTop: "10px" }}
                  onClick={() =>
                    playLinePreview(currentMove.fenBefore, liveCoachPreviewLine, {
                      label: "Why this was bad",
                      maxMoves: 6,
                    })
                  }
                >
                  Preview why this was bad
                </button>
              )}

              {previewInfo && canPreviewLiveCoachLine && (
                <div className="line-preview-box" style={{ marginTop: "10px" }}>
                  <div>
                    <span>{previewInfo.label}:</span> {getPreviewInfoText(previewInfo)}
                  </div>
                  <div className="line-preview-controls">
                    <button className="btn btn--ghost btn--mini" type="button" onClick={stepPreviewBack} disabled={!previewInfo.canStepBack}>
                      ← Step back
                    </button>
                    <button className="btn btn--ghost btn--mini" type="button" onClick={stepPreviewForward} disabled={!previewInfo.canStepForward}>
                      Step forward →
                    </button>
                    <button className="btn btn--ghost btn--mini" type="button" onClick={resetPreview}>
                      Back to game position
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {waitingForCoachConfirm && (
            <button
              className="btn btn--success coach-continue-btn btn--premium"
              onClick={() => {
                resetPreview();
                setWaitingForCoachConfirm(false);
                makeEngineMove();
              }}
            >
              Continue
            </button>
          )}
        </>
      )}

      {rightTab === "summary" && (
        <>

          <CriticalMoments
            analysis={analysis}
            onSelectMoment={(ply) => {
              setSelectedPly(ply);
              setRightTab("moves");
            }}
          />

          <BestMoves
            analysis={analysis}
            onSelectMove={(ply) => {
              setSelectedPly(ply);
              setRightTab("moves");
            }}
          />

          <div className="analysis-card">
            {canShowSummaryTab && (
              <GameStatsCards
                whiteRating={whiteRating}
                blackRating={blackRating}
                whiteAccuracy={whiteAccuracy}
                blackAccuracy={blackAccuracy}
                summary={summary}
                betterPlayerText={betterPlayerText}
              />
            )}

            <div className="analysis-label">Game Title</div>
            <div className="coach-box" style={{ fontWeight: "600" }}>
              {gameTitle || "Run analysis to generate title."}
            </div>
          </div>

          {opening && (
            <div className="analysis-card" style={{ marginTop: "20px" }}>
              <div className="analysis-label">Opening</div>
              <div className="coach-box">
                <strong>{opening.name}</strong>
                <br />
                {opening.description.split("\n").map((line, i) =>
                  line.startsWith("Plan:") ? (
                    <div key={i}>
                      <strong>Plan:</strong> {line.replace("Plan: ", "")}
                    </div>
                  ) : (
                    <div key={i}>{line}</div>
                  )
                )}
              </div>
            </div>
          )}

          <div className="analysis-card" style={{ marginTop: "20px" }}>
            <div className="analysis-label">Game Summary</div>
            <div className="coach-box">
              {summaryText || "Run analysis to see summary."}
            </div>

            <button
              className="btn btn--ghost"
              style={{ marginTop: "12px" }}
              onClick={() => setShowStory((value) => !value)}
            >
              {showStory ? "Show less ▲" : "Show more ▼"}
            </button>

            {showStory && (
              <div className="coach-box" style={{ marginTop: "12px" }}>
                {narrativeText || "Run analysis to see the story of the game."}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
