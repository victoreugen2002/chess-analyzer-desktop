import { Chess } from "chess.js";
import { useEffect, useMemo, useState } from "react";
import Board from "./Board";
import { buildRelevantPreviewLine, joinLineTokens, useLinePreview } from "../chess/ui/useLinePreview";
import {
  deletePuzzle,
  getPuzzles,
  syncPuzzlesFromAnalyzedGames,
  updatePuzzleAttempt,
} from "../chess/storage/puzzleStorage";
import { getSavedGames } from "../chess/storage/gameStorage";

const SAFE_MOVE_ENGINE_DEPTH = 8;
const SAFE_MOVE_TIMEOUT_MS = 6500;
const SAFE_MOVE_MIN_CP_LOSS = 80;
const SAFE_MOVE_MAX_CP_LOSS = 140;

function getPuzzleStatusLabel(status) {
  if (status === "solved") return "Solved";
  if (status === "failed") return "Needs review";
  return "Unsolved";
}

function isMistakeReview(puzzle) {
  return puzzle?.trainingType === "mistakeReview" ||
    puzzle?.reasonType === "continuationMaterialLoss" ||
    puzzle?.reasonType === "continuationMaterialLossPayoff";
}

function getTrainingTypeLabel(puzzle) {
  if (isMistakeReview(puzzle)) return "Mistake Review";
  return puzzle?.trainingTypeLabel || "Tactical Puzzle";
}

function getReasonLabel(puzzle) {
  if (puzzle?.reasonLabel) return puzzle.reasonLabel;

  const type = String(puzzle?.reasonType || "tactic");

  if (type === "continuationMaterialLoss" || type === "continuationMaterialLossPayoff") {
    return "material safety";
  }

  return type.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

function getDisplayQualityTags(puzzle) {
  const tags = Array.isArray(puzzle?.qualityTags) ? puzzle.qualityTags : [];
  const visibleTags = tags.filter((tag) => !["Tactical Puzzle", "Mistake Review"].includes(tag));
  return visibleTags.join(" / ");
}

function getMoveReference(puzzle) {
  const titleMatch = String(puzzle?.title || "").match(/Instead of\s+(.+?),\s+find/i);
  if (titleMatch?.[1]) return titleMatch[1];
  return puzzle?.playedSan || "the game move";
}

function getPuzzleTitle(puzzle) {
  if (!puzzle) return "";
  const title = String(puzzle.title || "");

  if (/^Find a safer move after /i.test(title)) {
    return title.replace(/^Find a safer move after (.+)$/i, "Instead of $1, find a safer move");
  }

  if (/^Find the best move after /i.test(title)) {
    return title.replace(/^Find the best move after (.+)$/i, "Instead of $1, find the best move");
  }

  return title || puzzle.label || "Training position";
}

function getPuzzleIntroText(puzzle) {
  const played = puzzle?.playedSan || "the game move";

  if (isMistakeReview(puzzle)) {
    return (
      <>
        You played <strong>{played}</strong>, which allowed a material-losing continuation. From the position before that move, find a safer alternative.
      </>
    );
  }

  return (
    <>
      You played <strong>{played}</strong>. From the position before that move, find the better move you missed.
    </>
  );
}


function pickRandomPuzzle(puzzles) {
  if (!puzzles.length) return null;

  const unsolved = puzzles.filter((puzzle) => puzzle.status !== "solved");
  const pool = unsolved.length ? unsolved : puzzles;
  return pool[Math.floor(Math.random() * pool.length)] || null;
}

function getFenAfterMove(fen, uci) {
  if (!fen || !uci || uci.length < 4) return fen;

  try {
    const chess = new Chess(fen);
    const moveInput = {
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
    };

    if (uci[4]) moveInput.promotion = uci[4];

    chess.move(moveInput);
    return chess.fen();
  } catch {
    return fen;
  }
}

function getAttemptUci(from, to, expectedMove) {
  if (!from || !to) return "";
  const promotion = expectedMove?.length >= 5 ? expectedMove[4] : "";
  return `${from}${to}${promotion}`;
}

function getNormalizedScore(analysis) {
  const value = Number(analysis?.normalizedScore);
  return Number.isFinite(value) ? value : null;
}

function getMoveLossForSide(beforeScore, afterScore, side) {
  if (!Number.isFinite(beforeScore) || !Number.isFinite(afterScore)) return null;
  return side === "w" ? beforeScore - afterScore : afterScore - beforeScore;
}

function getSafeMoveMaxLoss(puzzle) {
  const originalLoss = Number(puzzle?.cpLoss);

  if (!Number.isFinite(originalLoss) || originalLoss <= 0) {
    return SAFE_MOVE_MAX_CP_LOSS;
  }

  return Math.max(
    SAFE_MOVE_MIN_CP_LOSS,
    Math.min(SAFE_MOVE_MAX_CP_LOSS, originalLoss - 80)
  );
}

function formatCp(value) {
  if (!Number.isFinite(Number(value))) return "";
  return `${Math.round(Math.abs(Number(value)))} cp`;
}

function getAttemptMoveInput(from, to, expectedMove = "") {
  if (!from || !to) return null;

  const moveInput = { from, to };
  if (expectedMove?.length >= 5) moveInput.promotion = expectedMove[4];

  return moveInput;
}

function withTimeout(promise, timeoutMs, label = "Operation") {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`${label} timed out`));
    }, timeoutMs);

    Promise.resolve(promise)
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function analyzeFenSafely(engineApi, fen, depth) {
  return withTimeout(
    engineApi.analyzeFen(fen, depth),
    SAFE_MOVE_TIMEOUT_MS,
    "Safe move engine check"
  );
}

function getSolutionLine(puzzle) {
  if (Array.isArray(puzzle?.solutionLine) && puzzle.solutionLine.length) {
    return puzzle.solutionLine;
  }

  if (!puzzle?.bestMove) return [];

  return [
    {
      uci: puzzle.bestMove,
      san: puzzle.bestMoveSan || puzzle.bestMove,
      side: puzzle.side,
      fenBefore: puzzle.fenBefore,
      fenAfter: getFenAfterMove(puzzle.fenBefore, puzzle.bestMove),
    },
  ];
}

function getExpectedUserStep(solutionLine, startIndex, userSide) {
  for (let index = startIndex; index < solutionLine.length; index += 1) {
    if (solutionLine[index]?.side === userSide) return index;
  }

  return -1;
}

function isConcreteSolutionMove(move) {
  const san = String(move?.san || "");
  const uci = String(move?.uci || "");

  return (
    san.includes("x") ||
    san.includes("+") ||
    san.includes("#") ||
    san.includes("=") ||
    uci.length >= 5
  );
}

function getMistakeProblemText(puzzle) {
  if (!isMistakeReview(puzzle)) return "";

  if (puzzle?.whatWentWrong) return puzzle.whatWentWrong;

  const moveReference = getMoveReference(puzzle);
  const materialTarget = puzzle?.materialTarget || "material";

  if (puzzle?.punishmentLine) {
    return `What went wrong: after ${moveReference}, the opponent can continue with ${puzzle.punishmentLine}, leading to loss of ${materialTarget}.`;
  }

  return `What went wrong: ${moveReference} allowed a continuation where you lose material. Look for a safer move from the position before ${puzzle?.playedSan || "that move"}.`;
}

function getMistakeProblemSummary(puzzle) {
  if (!isMistakeReview(puzzle)) return "What went wrong";
  return `What went wrong with ${puzzle?.playedSan || "the game move"}`;
}

function getMistakeReviewExplanation(puzzle) {
  if (!isMistakeReview(puzzle)) return "";
  return puzzle?.reason || getMistakeProblemText(puzzle);
}


function buildMistakePunishmentPreviewLine(puzzle) {
  if (!isMistakeReview(puzzle)) return "";

  return buildRelevantPreviewLine({
    playedMove: puzzle?.playedMove || puzzle?.playedSan || "",
    playedSan: puzzle?.playedSan || "",
    relevantLine: puzzle?.punishmentLine || "",
    includePlayedMove: true,
    maxMoves: 5,
  });
}

function buildSolutionPreviewLine(solutionLine) {
  if (!Array.isArray(solutionLine) || !solutionLine.length) return "";
  return joinLineTokens(solutionLine.map((move) => move?.uci || move?.san).filter(Boolean), 5);
}

function getPreviewInfoText(previewInfo) {
  if (!previewInfo) return "";

  const current = previewInfo.currentSan
    ? `Move ${previewInfo.current}/${previewInfo.total}: ${previewInfo.currentSan}`
    : previewInfo.lineSan;

  return `${current}${!previewInfo.isPlaying && previewInfo.currentSan ? " · finished" : ""}`;
}

export default function MyPuzzles({ bgStyleApp, activeProfile, onBack, sounds }) {
  const profileId = activeProfile?.id;
  const [puzzles, setPuzzles] = useState(() => getPuzzles(profileId));
  const [selectedPuzzle, setSelectedPuzzle] = useState(() => pickRandomPuzzle(getPuzzles(profileId)));
  const [feedback, setFeedback] = useState("");
  const [boardFen, setBoardFen] = useState(selectedPuzzle?.fenBefore || new Chess().fen());
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [isCheckingSafeMove, setIsCheckingSafeMove] = useState(false);
  const [solutionStep, setSolutionStep] = useState(0);
  const [isSolved, setIsSolved] = useState(false);
  const [syncInfo, setSyncInfo] = useState(null);
  const {
    previewFen,
    previewInfo,
    resetPreview,
    playLinePreview,
    stepPreviewBack,
    stepPreviewForward,
  } = useLinePreview(sounds);

  useEffect(() => {
    const syncResult = profileId
      ? syncPuzzlesFromAnalyzedGames(getSavedGames(), {
          profileId,
          profileName: activeProfile?.name || "",
        })
      : null;

    setSyncInfo(syncResult);

    const nextPuzzles = getPuzzles(profileId);
    setPuzzles(nextPuzzles);
    const nextSelected = pickRandomPuzzle(nextPuzzles);
    setSelectedPuzzle(nextSelected);
    setBoardFen(nextSelected?.fenBefore || new Chess().fen());
    setFeedback("");
    setSelectedSquare(null);
    setIsCheckingSafeMove(false);
    setSolutionStep(0);
    setIsSolved(false);
    resetPreview();
  }, [profileId]);

  const stats = useMemo(() => {
    const solved = puzzles.filter((puzzle) => puzzle.status === "solved").length;
    const unsolved = puzzles.filter((puzzle) => puzzle.status !== "solved").length;

    return { solved, unsolved, total: puzzles.length };
  }, [puzzles]);

  const solutionLine = useMemo(() => getSolutionLine(selectedPuzzle), [selectedPuzzle]);
  const expectedStep = selectedPuzzle
    ? getExpectedUserStep(solutionLine, solutionStep, selectedPuzzle.side)
    : -1;
  const expectedMove = expectedStep >= 0 ? solutionLine[expectedStep] : null;
  const totalUserMoves = solutionLine.filter((move) => move.side === selectedPuzzle?.side).length || 1;
  const completedUserMoves = solutionLine
    .slice(0, Math.max(0, solutionStep))
    .filter((move) => move.side === selectedPuzzle?.side).length;

  const mistakePreviewLine = selectedPuzzle ? buildMistakePunishmentPreviewLine(selectedPuzzle) : "";
  const solutionPreviewLine = buildSolutionPreviewLine(solutionLine);
  const canPreviewMistakeLine = Boolean(selectedPuzzle?.fenBefore && mistakePreviewLine);
  const canPreviewSolutionLine = Boolean(
    selectedPuzzle?.fenBefore &&
    solutionPreviewLine &&
    (isSolved || (feedback && !feedback.startsWith("Correct")))
  );

  function previewMistakeLine() {
    if (!selectedPuzzle?.fenBefore || !mistakePreviewLine) return;

    playLinePreview(selectedPuzzle.fenBefore, mistakePreviewLine, {
      label: "What went wrong",
      maxMoves: 6,
    });
  }

  function previewSolutionLine() {
    if (!selectedPuzzle?.fenBefore || !solutionPreviewLine) return;

    playLinePreview(selectedPuzzle.fenBefore, solutionPreviewLine, {
      label: isMistakeReview(selectedPuzzle) ? "Safer line" : "Solution line",
      maxMoves: 6,
    });
  }

  function refreshPuzzles(nextSelected = selectedPuzzle) {
    const nextPuzzles = getPuzzles(profileId);
    setPuzzles(nextPuzzles);

    if (nextSelected) {
      const updatedSelected = nextPuzzles.find((puzzle) => puzzle.id === nextSelected.id) || nextSelected;
      setSelectedPuzzle(updatedSelected);
    }
  }

  function startPuzzle(puzzle) {
    resetPreview();
    setSelectedPuzzle(puzzle);
    setBoardFen(puzzle?.fenBefore || new Chess().fen());
    setFeedback("");
    setSelectedSquare(null);
    setIsCheckingSafeMove(false);
    setSolutionStep(0);
    setIsSolved(false);
  }

  function chooseRandomPuzzle() {
    startPuzzle(pickRandomPuzzle(puzzles));
  }

  function chooseNextPuzzle() {
    if (!puzzles.length) return;

    const available = puzzles.filter(
      (puzzle) => puzzle.status !== "solved" && puzzle.id !== selectedPuzzle?.id
    );
    const pool = available.length
      ? available
      : puzzles.filter((puzzle) => puzzle.id !== selectedPuzzle?.id);

    startPuzzle(pickRandomPuzzle(pool.length ? pool : puzzles));
  }

  function resetCurrentPuzzle() {
    resetPreview();
    setBoardFen(selectedPuzzle?.fenBefore || new Chess().fen());
    setFeedback("");
    setSelectedSquare(null);
    setIsCheckingSafeMove(false);
    setSolutionStep(0);
    setIsSolved(false);
  }

  function removePuzzle(puzzleId) {
    if (!profileId || !puzzleId) return;

    const nextPuzzles = deletePuzzle(profileId, puzzleId);
    setPuzzles(nextPuzzles);
    startPuzzle(pickRandomPuzzle(nextPuzzles));
  }

  function finishPuzzle(finalFen) {
    setBoardFen(finalFen || boardFen);
    setIsSolved(true);

    const moveText = selectedPuzzle.bestMoveSan || selectedPuzzle.bestMove;
    const successText = isMistakeReview(selectedPuzzle)
      ? `Correct — ${moveText} was the safer move for this review. You can go to the next position.`
      : `Correct — ${moveText} started the right solution. You can go to the next puzzle.`;

    setFeedback(successText);
    updatePuzzleAttempt(profileId, selectedPuzzle.id, { solved: true });
    refreshPuzzles(selectedPuzzle);
  }

  function applyOpponentReplies(chess, fromIndex) {
    let index = fromIndex;

    while (index < solutionLine.length) {
      const reply = solutionLine[index];
      if (!reply) break;

      if (reply.side === selectedPuzzle.side) break;

      const moveInput = {
        from: reply.uci.slice(0, 2),
        to: reply.uci.slice(2, 4),
      };

      if (reply.uci[4]) moveInput.promotion = reply.uci[4];

      const move = chess.move(moveInput);
      if (!move) break;

      sounds?.playFromSan?.(move.san);
      index += 1;
    }

    return index;
  }

  async function evaluateMistakeReviewMove(from, to, currentExpectedMove) {
    if (!isMistakeReview(selectedPuzzle)) {
      return { accepted: false, reason: "not-review" };
    }

    if (!selectedPuzzle?.fenBefore || currentExpectedMove?.side !== selectedPuzzle.side) {
      return { accepted: false, reason: "not-start" };
    }

    const engineApi = typeof window !== "undefined" ? window.engineApi : null;
    if (typeof engineApi?.analyzeFen !== "function") {
      return { accepted: false, reason: "no-engine" };
    }

    try {
      const chess = new Chess(selectedPuzzle.fenBefore);
      const moveInput = getAttemptMoveInput(from, to, currentExpectedMove?.uci || selectedPuzzle?.bestMove || "");
      const move = moveInput ? chess.move(moveInput) : null;

      if (!move) {
        return { accepted: false, reason: "illegal" };
      }

      // Run these sequentially instead of Promise.all. In Electron the Stockfish
      // bridge is usually single-engine/single-worker, so two parallel analyzeFen
      // calls can leave the UI waiting on the safe-move check for too long.
      const beforeAnalysis = await analyzeFenSafely(
        engineApi,
        selectedPuzzle.fenBefore,
        SAFE_MOVE_ENGINE_DEPTH
      );
      const afterAnalysis = await analyzeFenSafely(
        engineApi,
        chess.fen(),
        SAFE_MOVE_ENGINE_DEPTH
      );

      const beforeScore = getNormalizedScore(beforeAnalysis);
      const afterScore = getNormalizedScore(afterAnalysis);
      const loss = getMoveLossForSide(beforeScore, afterScore, selectedPuzzle.side);
      const maxLoss = getSafeMoveMaxLoss(selectedPuzzle);

      if (!Number.isFinite(loss)) {
        return { accepted: false, reason: "no-score", move, fenAfter: chess.fen() };
      }

      return {
        accepted: loss <= maxLoss,
        reason: loss <= maxLoss ? "safe" : "too-much-loss",
        move,
        fenAfter: chess.fen(),
        loss,
        maxLoss,
        engineBestMove: beforeAnalysis?.bestMove || selectedPuzzle?.bestMove || "",
      };
    } catch (error) {
      console.warn("Could not evaluate safe puzzle move:", error);
      return {
        accepted: false,
        reason: String(error?.message || "").toLowerCase().includes("timed out")
          ? "timeout"
          : "engine-error",
      };
    }
  }

  function finishMistakeReviewWithSafeMove(result, currentExpectedMove) {
    const safeMove = result?.move;
    const safeMoveText = safeMove?.san || safeMove?.lan || "that move";
    const bestMoveText = currentExpectedMove?.san || selectedPuzzle?.bestMoveSan || selectedPuzzle?.bestMove || "the engine move";
    const lossText = formatCp(result?.loss);

    setBoardFen(result?.fenAfter || boardFen || selectedPuzzle?.fenBefore);
    setIsSolved(true);
    setSelectedSquare(null);
    setSolutionStep(solutionLine.length);
    sounds?.playFromSan?.(safeMove?.san);

    setFeedback(
      `Good enough — ${safeMoveText} is a safe alternative${lossText ? ` (${lossText} loss)` : ""}. Engine best was ${bestMoveText}, but your move avoids the main material-losing problem.`
    );

    updatePuzzleAttempt(profileId, selectedPuzzle.id, { solved: true });
    refreshPuzzles(selectedPuzzle);
  }

  function getSafeMoveFailureText(result) {
    if (result?.reason === "no-engine") {
      return "Not the review move — I could not verify this alternative as safe, so try the safer move that avoids the material-losing continuation.";
    }

    if (result?.reason === "timeout") {
      return "I could not verify that move quickly enough, so I reset the board. Try the main safer move, or try another candidate.";
    }

    if (result?.reason === "engine-error") {
      return "I could not verify that alternative with the engine, so I reset the board. Try the main safer move, or try another candidate.";
    }

    if (result?.reason === "too-much-loss" && Number.isFinite(result.loss)) {
      const lossText = formatCp(result.loss);
      const maxText = formatCp(result.maxLoss);
      return `That move still looks risky (${lossText} loss${maxText ? `; safe target is about ${maxText} or less` : ""}). Try a safer alternative.`;
    }

    return "Not safe enough yet — try a move that avoids the material-losing continuation.";
  }

  async function handlePuzzleAttempt(from, to) {
    if (!selectedPuzzle || !profileId || isSolved || isCheckingSafeMove) return;

    if (previewFen) {
      setSelectedSquare(null);
      setFeedback("Preview mode is active. Use Back to puzzle position before trying a move.");
      return;
    }

    resetPreview();

    const currentExpectedStep = getExpectedUserStep(solutionLine, solutionStep, selectedPuzzle.side);
    const currentExpectedMove = currentExpectedStep >= 0 ? solutionLine[currentExpectedStep] : null;

    if (!currentExpectedMove?.uci) return;

    const attempt = getAttemptUci(from, to, currentExpectedMove.uci);
    const isPromotionPuzzle = currentExpectedMove.uci?.length >= 5;
    const isCorrect = isPromotionPuzzle
      ? attempt === currentExpectedMove.uci
      : attempt === currentExpectedMove.uci || attempt.slice(0, 4) === currentExpectedMove.uci.slice(0, 4);

    if (!isCorrect) {
      if (isMistakeReview(selectedPuzzle) && solutionStep === 0) {
        setIsCheckingSafeMove(true);
        setFeedback("Checking whether that move is safe enough...");

        let safeResult = { accepted: false, reason: "engine-error" };
        try {
          safeResult = await evaluateMistakeReviewMove(from, to, currentExpectedMove);
        } finally {
          setIsCheckingSafeMove(false);
        }

        if (safeResult.accepted) {
          finishMistakeReviewWithSafeMove(safeResult, currentExpectedMove);
          return;
        }

        setBoardFen(selectedPuzzle.fenBefore || new Chess().fen());
        setFeedback(getSafeMoveFailureText(safeResult));
        updatePuzzleAttempt(profileId, selectedPuzzle.id, { solved: false });
        refreshPuzzles(selectedPuzzle);
        return;
      }

      setBoardFen(boardFen || selectedPuzzle.fenBefore || new Chess().fen());
      setFeedback(
        isMistakeReview(selectedPuzzle)
          ? "Not safe enough yet — try a move that avoids the material-losing continuation."
          : "Incorrect — try again. The position has not changed."
      );
      updatePuzzleAttempt(profileId, selectedPuzzle.id, { solved: false });
      refreshPuzzles(selectedPuzzle);
      return;
    }

    try {
      const chess = new Chess(boardFen || selectedPuzzle.fenBefore);
      const moveInput = {
        from: currentExpectedMove.uci.slice(0, 2),
        to: currentExpectedMove.uci.slice(2, 4),
      };

      if (currentExpectedMove.uci[4]) moveInput.promotion = currentExpectedMove.uci[4];

      const userMove = chess.move(moveInput);
      if (!userMove) throw new Error("Could not play puzzle move");
      sounds?.playFromSan?.(userMove.san);

      const nextUserStepBeforeReply = getExpectedUserStep(
        solutionLine,
        currentExpectedStep + 1,
        selectedPuzzle.side
      );

      // Only continue as a multi-move puzzle when the next required user move
      // is concrete enough to be useful as training. Quiet follow-up moves can
      // be correct, but they are confusing without a full lesson/explanation,
      // so v1.2 treats the first key move as solving the puzzle.
      if (
        nextUserStepBeforeReply === -1 ||
        !isConcreteSolutionMove(solutionLine[nextUserStepBeforeReply])
      ) {
        setSelectedSquare(null);
        setSolutionStep(solutionLine.length);
        finishPuzzle(chess.fen());
        return;
      }

      const nextStep = applyOpponentReplies(chess, currentExpectedStep + 1);
      const nextUserStep = getExpectedUserStep(solutionLine, nextStep, selectedPuzzle.side);
      const nextFen = chess.fen();

      setBoardFen(nextFen);
      setSelectedSquare(null);

      if (nextUserStep === -1) {
        setSolutionStep(solutionLine.length);
        finishPuzzle(nextFen);
        return;
      }

      setSolutionStep(nextStep);
      setFeedback(
        isMistakeReview(selectedPuzzle)
          ? `Correct — ${currentExpectedMove.san || currentExpectedMove.uci}. The opponent replied automatically. Continue the safer line.`
          : `Correct — ${currentExpectedMove.san || currentExpectedMove.uci}. The opponent replied automatically. Find the next move.`
      );
    } catch {
      setFeedback(isMistakeReview(selectedPuzzle)
        ? "Correct review move found, but the continuation could not be played. You can go to the next position."
        : "Correct move found, but the continuation could not be played. You can go to the next puzzle."
      );
      finishPuzzle(boardFen);
    }
  }

  function handleSquareClick(square) {
    if (!selectedPuzzle || isSolved || isCheckingSafeMove) return;
    if (previewFen) {
      setSelectedSquare(null);
      return;
    }

    try {
      const chess = new Chess(boardFen);
      const piece = chess.get(square);

      if (!selectedSquare && piece?.color === chess.turn()) {
        setSelectedSquare(square);
        return;
      }

      if (selectedSquare === square) {
        setSelectedSquare(null);
        return;
      }

      if (selectedSquare) {
        handlePuzzleAttempt(selectedSquare, square);
        setSelectedSquare(null);
      }
    } catch {
      setSelectedSquare(null);
    }
  }

  const highlights = {
    ...(selectedSquare ? { [selectedSquare]: "selected" } : {}),
  };

  return (
    <div className="app-bg" style={bgStyleApp}>
      <button
        onClick={onBack}
        className="btn btn--ghost"
        style={{
          position: "absolute",
          top: "24px",
          left: "24px",
          zIndex: 20,
        }}
      >
        ← Back
      </button>

      <div className="my-puzzles-wrap">
        <section className="my-puzzles-panel my-puzzles-panel--board">
          <div className="my-puzzles-header">
            <div>
              <div className="analysis-label">My Puzzles</div>
              <h1 className="panel-title">Train from your own mistakes</h1>
              <p className="panel-subtitle">
                Training positions are generated from analyzed mistakes and blunders in your saved games.
              </p>
            </div>

            <div className="my-puzzles-stats">
              <span>{stats.total} total</span>
              <span>{stats.solved} solved</span>
              <span>{stats.unsolved} open</span>
            </div>
          </div>

          {selectedPuzzle ? (
            <>
              <Board
                fen={previewFen || boardFen}
                size={460}
                highlights={highlights}
                onSquareClick={handleSquareClick}
                onMove={handlePuzzleAttempt}
              />

              <div className={`puzzle-feedback ${(feedback.startsWith("Correct") || feedback.startsWith("Good enough")) ? "is-correct" : feedback ? "is-wrong" : ""}`}>
                {feedback || selectedPuzzle.prompt || (isMistakeReview(selectedPuzzle) ? "Find the safer move." : "Find the best move.")}
              </div>

              {previewInfo && (
                <div className="line-preview-box">
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
                      Back to puzzle position
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="my-puzzles-empty-main">
              No puzzles yet. Analyze completed games with mistakes or blunders, and they will appear here.
            </div>
          )}
        </section>

        <aside className="my-puzzles-panel my-puzzles-panel--side">
          <div className="my-puzzles-actions">
            <button className="btn btn--premium" type="button" onClick={chooseRandomPuzzle} disabled={!puzzles.length}>
              Random Position
            </button>
            <button
              className="btn btn--ghost"
              type="button"
              onClick={chooseNextPuzzle}
              disabled={!puzzles.length || !isSolved}
              title={isSolved ? "Go to the next puzzle" : "Solve the current puzzle first"}
            >
              Next Puzzle
            </button>
            <button className="btn btn--ghost" type="button" onClick={resetCurrentPuzzle} disabled={!selectedPuzzle}>
              Reset
            </button>
          </div>

          {syncInfo && (
            <div className="puzzle-sync-card">
              <strong>{syncInfo.scannedCount} analyzed games scanned</strong> · {stats.total} training positions available
              {syncInfo.generatedCount > 0 && (
                <span> · {syncInfo.generatedCount} new added</span>
              )}
              <div className="puzzle-sync-card__details">
                {syncInfo.candidateCount} puzzle/review-quality positions from {syncInfo.analyzedMoveCount} analyzed moves
                {syncInfo.skippedGameCount > 0 && (
                  <span> · {syncInfo.skippedGameCount} games skipped</span>
                )}
              </div>
            </div>
          )}

          {selectedPuzzle && (
            <div className="puzzle-detail-card">
              <div className="puzzle-detail-card__topline">
                <span>{getPuzzleStatusLabel(selectedPuzzle.status)}</span>
                <span>~{selectedPuzzle.difficulty}</span>
              </div>
              <h2>{getPuzzleTitle(selectedPuzzle)}</h2>
              <p>{getPuzzleIntroText(selectedPuzzle)}</p>
              {solutionLine.length > 1 && (
                <div className="puzzle-detail-card__meta">
                  Line progress: {Math.min(completedUserMoves, totalUserMoves)} / {totalUserMoves} moves
                </div>
              )}
              <div className="puzzle-detail-card__meta">
                {selectedPuzzle.label} · {selectedPuzzle.cpLoss} cp loss · {selectedPuzzle.gameTitle}
              </div>

              {selectedPuzzle.reasonType && (
                <div className="puzzle-detail-card__meta">
                  Type: {getTrainingTypeLabel(selectedPuzzle)} · Focus: {getReasonLabel(selectedPuzzle)}
                  {getDisplayQualityTags(selectedPuzzle) && (
                    <> · {getDisplayQualityTags(selectedPuzzle)}</>
                  )}
                </div>
              )}

              {isMistakeReview(selectedPuzzle) && getMistakeProblemText(selectedPuzzle) && (
                <details className="puzzle-detail-card__lesson">
                  <summary>{getMistakeProblemSummary(selectedPuzzle)}</summary>
                  <p>{getMistakeProblemText(selectedPuzzle)}</p>
                </details>
              )}

              {(canPreviewMistakeLine || canPreviewSolutionLine) && (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px" }}>
                  {canPreviewMistakeLine && (
                    <button className="btn btn--ghost" type="button" onClick={previewMistakeLine}>
                      Preview what went wrong
                    </button>
                  )}
                  {canPreviewSolutionLine && (
                    <button className="btn btn--ghost" type="button" onClick={previewSolutionLine}>
                      {isMistakeReview(selectedPuzzle) ? "Preview safer line" : "Preview solution"}
                    </button>
                  )}
                </div>
              )}

              {selectedPuzzle.debugReason && (
                <details className="puzzle-detail-card__debug">
                  <summary>Why this became a puzzle</summary>
                  <p>{selectedPuzzle.debugReason}</p>
                </details>
              )}

              {(isSolved || (feedback && !feedback.startsWith("Correct"))) && isMistakeReview(selectedPuzzle) && getMistakeReviewExplanation(selectedPuzzle) && (
                <div className="puzzle-detail-card__reason">
                  {getMistakeReviewExplanation(selectedPuzzle)}
                </div>
              )}

              {(isSolved || (feedback && !feedback.startsWith("Correct"))) && !isMistakeReview(selectedPuzzle) && selectedPuzzle.reason && (
                <div className="puzzle-detail-card__reason">
                  {selectedPuzzle.reason}
                </div>
              )}
            </div>
          )}

          <div className="puzzle-list">
            {puzzles.map((puzzle) => (
              <div
                key={puzzle.id}
                className={`puzzle-list-item ${selectedPuzzle?.id === puzzle.id ? "is-active" : ""}`}
              >
                <div>
                  <div className="puzzle-list-item__title">{getPuzzleTitle(puzzle)}</div>
                  <div className="puzzle-list-item__meta">
                    {getTrainingTypeLabel(puzzle)} · {puzzle.label} · ~{puzzle.difficulty} · {getPuzzleStatusLabel(puzzle.status)}
                  </div>
                </div>
                <span>{puzzle.status === "solved" ? "✓" : puzzle.status === "failed" ? "✕" : "?"}</span>
              </div>
            ))}
          </div>

          {selectedPuzzle && (
            <button
              className="btn btn--ghost puzzle-delete-btn"
              type="button"
              onClick={() => removePuzzle(selectedPuzzle.id)}
            >
              Delete selected puzzle
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
