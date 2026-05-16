import { Chess } from "chess.js";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  selectMessageSignals,
  createSignalMessageContext,
} from "./chess/explain/explainMove"; 
import { useLinePreview } from "./chess/ui/useLinePreview";
import { buildAnalyzedMove } from "./chess/analysis/buildAnalyzedMove";
import { buildMoveObjectsFromFen, buildMoveObjectsFromPgn } from "./chess/pgn/pgnParser";
import { getBoardPixelSize } from "./chess/ui/uiHelpers";
import { createMoveAudio } from "./chess/ui/sounds";
import { buildGameAnalysis } from "./chess/analysis/buildGameAnalysis";
import { getAdvantageSide } from "./chess/explain/labels";
import { getOpeningInfo } from "./chess/explain/openingInfo";
import { generateGameTitle, generateGameSummary, generateNarrativeSummary, estimatePlayerRating, calculateAccuracy } from "./chess/explain/gameSummary";
import PgnPanel from "./components/PgnPanel";
import AnalysisProgressOverlay from "./components/AnalysisProgressOverlay";
import GameHistoryPanel from "./components/GameHistoryPanel";
import ProfilePanel from "./components/ProfilePanel";
import MyPuzzles from "./components/MyPuzzles";
import StartScreen from "./components/StartScreen";
import BoardPanel from "./components/BoardPanel";
import RightPanel from "./components/RightPanel";
import "./app.css"; 
import moveSound from "./assets/sounds/move.mp3";
import captureSound from "./assets/sounds/capture.mp3";
import chessIcon from "./assets/chess-icon.png";
import bgChess from "./assets/bg-chess.png";
import bgChessApp from "./assets/bg-chess-app.png";
import { START_PGN } from "./chess/pgn/samplePgn";
import {
  buildGameSnapshot,
  deleteGame,
  deleteUnfinishedGame,
  getSavedGames,
  getUnfinishedGames,
  saveGame,
  saveLastReviewGame,
  saveUnfinishedGame,
} from "./chess/storage/gameStorage";
import {
  applyTrainingRatingUpdate,
  createProfile,
  deleteProfile,
  getActiveProfile,
  getProfiles,
  saveProfiles,
  setActiveProfileId,
  updateProfile,
} from "./chess/storage/profileStorage";
import { saveGeneratedPuzzlesFromSnapshot } from "./chess/storage/puzzleStorage";


function clampCoachElo(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 2500;
  return Math.max(1800, Math.min(3000, parsed));
}

function getCoachLevelLabel(elo) {
  const value = clampCoachElo(elo);

  if (value >= 3000) return "Engine Coach";
  if (value >= 2800) return "Super GM Coach";
  if (value >= 2500) return "GM Coach";
  if (value >= 2400) return "IM Coach";
  if (value >= 2300) return "FM Coach";
  if (value >= 2200) return "Expert Coach";
  if (value >= 2000) return "Strong Club Coach";
  return "Club Coach";
}

function getCoachSearchDepth(elo) {
  const value = clampCoachElo(elo);

  if (value >= 3000) return 18;
  if (value >= 2500) return 16;
  if (value >= 2200) return 15;
  return 14;
}

function clampRatingChange(value, min = -18, max = 22) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function calculateTrainingRatingChange({
  currentRating,
  performanceRating,
  accuracy,
  moveCount,
  result,
  opponentRating,
} = {}) {
  const current = Number(currentRating) || 1500;
  const performance = Number(performanceRating) || current;
  const moves = Number(moveCount) || 0;

  // Training rating should be stable. Very short games are useful for review,
  // but they are too noisy to meaningfully change the long-term skill estimate.
  if (moves < 10) return 0;

  const accuracyValue = Number(accuracy) || 0;
  const confidence = Math.max(0.25, Math.min(1, moves / 32));

  let change = (performance - current) * 0.035 * confidence;

  if (accuracyValue >= 90 && moves >= 12) change += 3;
  if (accuracyValue < 55 && moves >= 12) change -= 3;

  if (result === "1-0") change += 4;
  if (result === "0-1") change -= 4;
  if (result === "1/2-1/2" && opponentRating) {
    change += opponentRating > current ? 3 : 0;
  }

  if (moves < 20) {
    return clampRatingChange(change, -3, 3);
  }

  return clampRatingChange(change);
}

function getResultForSide(result, side) {
  if (side !== "b") return result;
  if (result === "1-0") return "0-1";
  if (result === "0-1") return "1-0";
  return result;
}

function getProfileRating(profile) {
  if (!profile) return null;
  return Number(profile.currentRating || profile.startingRating || 1500);
}

export default function App() {
  const [mode, setMode] = useState("play");
  const [fullAnalysisVisible, setFullAnalysisVisible] = useState(false);
  const [coachEnabled, setCoachEnabled] = useState(true);
  const [coachElo, setCoachElo] = useState(() => clampCoachElo(localStorage.getItem("coachElo")));
  const [isEngineThinking, setIsEngineThinking] = useState(false);
  const [showPlayAnalysis, setShowPlayAnalysis] = useState(false);
  const [lastMoveSquares, setLastMoveSquares] = useState(null);
  const sounds = useMemo(() => createMoveAudio(moveSound, captureSound), []);
  const {
    previewFen,
    previewInfo,
    resetPreview,
    playLinePreview,
    stepPreviewBack,
    stepPreviewForward,
  } = useLinePreview(sounds);
  const moveListRef = useRef(null);
  const [waitingForCoachConfirm, setWaitingForCoachConfirm] = useState(false);
  const [chess] = useState(() => new Chess());
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [rightTab, setRightTab] = useState("moves");
  const [showStory, setShowStory] = useState(false);
  const [pgn, setPgn] = useState(START_PGN);
  const [testFen, setTestFen] = useState("");
  const [gameData, setGameData] = useState(() => buildMoveObjectsFromPgn(START_PGN));
  const [selectedPly, setSelectedPly] = useState(0);
  const [analysis, setAnalysis] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAnalysisProgress, setShowAnalysisProgress] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [error, setError] = useState("");
  const [boardSize, setBoardSize] = useState(560);
  const [coachMessage, setCoachMessage] = useState(null);
  const [depth, setDepth] = useState(15);
  const whiteMoves = analysis.filter((m) => m.side === "w");
  const blackMoves = analysis.filter((m) => m.side === "b");
  const opening = getOpeningInfo(gameData.moves);
  const [started, setStarted] = useState(false);
  const whiteRating = estimatePlayerRating(analysis, gameData.result, "w");
  const blackRating = estimatePlayerRating(analysis, gameData.result, "b");
  const [hoveredMove, setHoveredMove] = useState(null);
  const whiteAccuracy = calculateAccuracy(whiteMoves);
  const blackAccuracy = calculateAccuracy(blackMoves);
  const [isHoveringBestMove, setIsHoveringBestMove] = useState(false);
  const [liveCoachAnalysis, setLiveCoachAnalysis] = useState(null);
  const [savedGames, setSavedGames] = useState(() => getSavedGames());
  const [unfinishedGames, setUnfinishedGames] = useState(() => getUnfinishedGames());
  const [showLoadGameModal, setShowLoadGameModal] = useState(false);
  const playSessionIdRef = useRef(null);
  const [profiles, setProfiles] = useState(() => getProfiles());
  const [activeProfile, setActiveProfile] = useState(() => getActiveProfile());
  const [currentReviewGameId, setCurrentReviewGameId] = useState(null);
  const whitePlayedBetter = whiteAccuracy > blackAccuracy;
  const blackPlayedBetter = blackAccuracy > whiteAccuracy;
  const coachLevelLabel = getCoachLevelLabel(coachElo);
  const activeProfileName = activeProfile?.name || "You";
  const [twoPlayerWhiteProfileId, setTwoPlayerWhiteProfileId] = useState(() => activeProfile?.id || "guest");
  const [twoPlayerBlackProfileId, setTwoPlayerBlackProfileId] = useState("guest");

  function getLocalPlayerFromProfileId(profileId, fallbackName = "Player 2") {
    if (!profileId || profileId === "guest") {
      return {
        profileId: null,
        name: fallbackName,
        rating: null,
        isGuest: true,
      };
    }

    const profile = profiles.find((item) => item.id === profileId);

    if (!profile) {
      return {
        profileId: null,
        name: fallbackName,
        rating: null,
        isGuest: true,
      };
    }

    return {
      profileId: profile.id,
      name: profile.name || fallbackName,
      rating: profile.currentRating || profile.startingRating || 1500,
      isGuest: false,
    };
  }

  const twoPlayerWhite = getLocalPlayerFromProfileId(
    twoPlayerWhiteProfileId,
    activeProfileName
  );
  const twoPlayerBlack = getLocalPlayerFromProfileId(
    twoPlayerBlackProfileId,
    "Player 2"
  );

  useEffect(() => {
    localStorage.setItem("coachElo", String(coachElo));
  }, [coachElo]);

  useEffect(() => {
    if (!profiles.some((profile) => profile.id === twoPlayerWhiteProfileId)) {
      setTwoPlayerWhiteProfileId(activeProfile?.id || "guest");
    }

    if (
      twoPlayerBlackProfileId !== "guest" &&
      !profiles.some((profile) => profile.id === twoPlayerBlackProfileId)
    ) {
      setTwoPlayerBlackProfileId("guest");
    }
  }, [profiles, activeProfile, twoPlayerWhiteProfileId, twoPlayerBlackProfileId]);

  function squareToXY(square, cellSize) {
    const file = square.charCodeAt(0) - 97; // a=0
    const rank = 8 - parseInt(square[1], 10); // 8->0
    return {
      x: file * cellSize + cellSize / 2,
      y: rank * cellSize + cellSize / 2,
    };
  }


  const summaryText = useMemo(() => {
    return generateGameSummary(analysis, gameData.result);
  }, [analysis]);
  const narrativeText = useMemo(() => {
    return generateNarrativeSummary(analysis, gameData.result, getAdvantageSide);
  }, [analysis, gameData.result]);
  const gameTitle = useMemo(() => {
    return generateGameTitle(analysis, gameData.result);
  }, [analysis, gameData.result]);

  let betterPlayerText = "Both sides played at a similar level.";
  if (whitePlayedBetter) betterPlayerText = "White played better overall.";
  if (blackPlayedBetter) betterPlayerText = "Black played better overall.";

  function startNewGame(modeType) {
    chess.reset();

    playSessionIdRef.current = `unfinished-${Date.now()}`;
    setCurrentReviewGameId(null);

    const headers =
      modeType === "coach"
        ? {
            White: activeProfileName,
            Black: "Coach",
            Result: "*",
          }
        : modeType === "play"
          ? {
              White: twoPlayerWhite.name,
              Black: twoPlayerBlack.name,
              Result: "*",
            }
          : {};

    setPgn("");
    setGameData({
      headers,
      result: "*",
      moves: [],
      initialFen: chess.fen(),
    });

    setSelectedPly(0);
    setAnalysis([]);
    setShowPlayAnalysis(false);
    setSelectedSquare(null);
    setPendingPromotion(null);
    setLastMoveSquares(null);

    setMode(modeType);
    setStarted(true);

    setCoachMessage(null);
    setLiveCoachAnalysis(null);
    setWaitingForCoachConfirm(false);

    setFullAnalysisVisible(false);
    setHoveredMove(null);
    setIsHoveringBestMove(false);
    clearCurrentUnfinishedGame();
  }

  function handleSquareClick(square) {
    if (previewFen) return;
    if (isEngineThinking) return;

    const piece = chess.get(square);

    if (!selectedSquare && !piece) return;

    if (selectedSquare === square) {
      setSelectedSquare(null);
      return;
    }

    if (piece && piece.color === chess.turn()) {
      setSelectedSquare(square);
      return;
    }

    if (!selectedSquare) return;

    const from = selectedSquare;

    setSelectedSquare(null);
    handleMove(from, square);
  }

  function buildMove(from, to, promotion) {
    const move = { from, to };

    if (promotion) {
      move.promotion = promotion;
    }

    return move;
  }

  function isPromotionMove(from, to) {
    const piece = chess.get(from);

    if (!piece || piece.type !== "p") return false;

    const targetRank = to?.[1];
    return (piece.color === "w" && targetRank === "8") ||
      (piece.color === "b" && targetRank === "1");
  }

  function clearPendingPromotion() {
    setPendingPromotion(null);
    setSelectedSquare(null);
  }

  function choosePromotionPiece(piece) {
    const pending = pendingPromotion;
    if (!pending) return;

    setPendingPromotion(null);
    handleMove(pending.from, pending.to, piece);
  }

  function syncCurrentGameFromChess({ clearLiveCoach = false } = {}) {
    const newPgn = chess.pgn();
    const built = buildMoveObjectsFromPgn(newPgn);
    const history = chess.history({ verbose: true });

    setPgn(newPgn);
    setGameData(built);
    setSelectedPly(history.length);

    if (["play", "coach"].includes(mode)) {
      if (built?.result === "*" && built.moves?.length) {
        saveCurrentUnfinishedGame({ nextPgn: newPgn, built });
      } else {
        clearCurrentUnfinishedGame();
      }
    }

    if (clearLiveCoach) {
      setLiveCoachAnalysis(null);
    }

    return { newPgn, built, history };
  }

  function getMoveLoss(before, after, side) {
    if (before.normalizedScore === null || after.normalizedScore === null) {
      return 0;
    }

    return side === "w"
      ? before.normalizedScore - after.normalizedScore
      : after.normalizedScore - before.normalizedScore;
  }

  function setResultHeaderForPgn(chessInstance, result) {
    if (!result) return;

    if (typeof chessInstance.header === "function") {
      chessInstance.header("Result", result);
    }

    if (typeof chessInstance.setHeader === "function") {
      chessInstance.setHeader("Result", result);
    }
  }

  function getResultMessage(result) {
    switch (result) {
      case "1-0":
        return "White won.";
      case "0-1":
        return "Black won.";
      case "1/2-1/2":
        return "The game was drawn.";
      default:
        return "The game is over.";
    }
  }

  async function analyzeSinglePlayedMove({ move, fenBefore, history }) {
    const before = await window.engineApi.analyzeFen(fenBefore, 10);
    const after = await window.engineApi.analyzeFen(chess.fen(), 10);

    const moveAnalysis = await buildAnalyzedMove({
      item: {
        ply: history.length,
        fenBefore,
        fenAfter: chess.fen(),
        san: move.san,
        side: move.color,
        bestMove: before.bestMove,
        bestEval: before.normalizedScore,
        playedEval: after.normalizedScore,
        loss: getMoveLoss(before, after, move.color),
        bestLine: before?.pv,
        pv: before?.pv,
        playedLine: after?.pv || move.lan,
        lan: move.lan,
      },
      moves: history,
      moveIndex: history.length - 1,
      analyzeFen: window.engineApi.analyzeFen,
      depth,
    });

    setAnalysis((prev) => {
      const withoutCurrentMove = prev.filter(
        (item) => item.ply !== moveAnalysis.ply
      );

      return [...withoutCurrentMove, moveAnalysis];
    });

    return moveAnalysis;
  }

  function applyLiveCoachFeedback(moveAnalysis) {
    setLiveCoachAnalysis(moveAnalysis);

    const shouldShowCoachMessage = ["Mistake", "Blunder"].includes(
      moveAnalysis?.label
    );

    const shouldPauseEngine = mode === "coach" && shouldShowCoachMessage;

    setWaitingForCoachConfirm(shouldPauseEngine);
    setCoachMessage(shouldShowCoachMessage ? moveAnalysis.explanation : null);
    setShowPlayAnalysis(true);

    return shouldPauseEngine;
  }

  async function makeEngineMove() {
    if (mode !== "coach" || chess.isGameOver() || gameData.result !== "*") return;

    setIsEngineThinking(true);
    setCoachMessage(null);
    setWaitingForCoachConfirm(false);

    try {
      await new Promise((r) => setTimeout(r, 400));

      const previousFen = chess.fen();
      const result = await window.engineApi.getBestMove(
        previousFen,
        coachElo >= 3000 ? 3000 : coachElo,
        getCoachSearchDepth(coachElo)
      );

      if (!result?.bestMove) return;

      const engineMove = chess.move(
        buildMove(
          result.bestMove.slice(0, 2),
          result.bestMove.slice(2, 4),
          result.bestMove[4]
        )
      );

      if (!engineMove) return;

      sounds.playFromSan(engineMove.san);
      setLastMoveSquares({ from: engineMove.from, to: engineMove.to });

      const { history } = syncCurrentGameFromChess({ clearLiveCoach: true });

      await analyzeSinglePlayedMove({
        move: engineMove,
        fenBefore: previousFen,
        history,
      });
    } catch (error) {
      console.error("Engine move failed:", error);
    } finally {
      setIsEngineThinking(false);
    }
  }



  async function handleMove(from, to, promotion) {
    if (previewFen) return;
    if (mode === "coach" && chess.turn() !== "w") return;
    if (isEngineThinking || gameData.result !== "*") return;

    const previousFen = chess.fen();

    let move = null;

    if (!promotion && isPromotionMove(from, to)) {
      setPendingPromotion({ from, to });
      setSelectedSquare(null);
      return;
    }

    try {
      move = chess.move(buildMove(from, to, promotion));
    } catch {
      move = null;
    }

    if (!move) return;

    setSelectedSquare(null);
    sounds.playFromSan(move.san);
    setLastMoveSquares({ from: move.from, to: move.to });

    const { history } = syncCurrentGameFromChess();

    setFullAnalysisVisible(false);

    if (mode !== "review") {
      try {
        const lastMoveAnalysis = await analyzeSinglePlayedMove({
          move,
          fenBefore: previousFen,
          history,
        });

        if (coachEnabled) {
          const shouldPauseEngine = applyLiveCoachFeedback(lastMoveAnalysis);

          if (shouldPauseEngine) {
            return;
          }
        } else {
          setLiveCoachAnalysis(lastMoveAnalysis);
          setCoachMessage(null);
          setWaitingForCoachConfirm(false);
          setShowPlayAnalysis(true);
        }
      } catch (error) {
        console.error("Live performance analysis failed:", error);
        setCoachMessage(null);
        setWaitingForCoachConfirm(false);
      }
    }

    if (mode === "coach" && !chess.isGameOver()) {
      setWaitingForCoachConfirm(false);
      await makeEngineMove();
    }
  }

  function handleTakeBack() {
    if (mode === "review" || mode === "history") return;
    if (isEngineThinking || gameData.result !== "*") return;

    const historyBefore = chess.history({ verbose: true });
    if (!historyBefore.length) return;

    const movesToUndo = mode === "coach" && chess.turn() === "w" ? 2 : 1;
    const undoCount = Math.min(movesToUndo, historyBefore.length);

    for (let i = 0; i < undoCount; i += 1) {
      chess.undo();
    }

    const { history } = syncCurrentGameFromChess({ clearLiveCoach: true });
    const lastMove = history[history.length - 1];

    setAnalysis((prev) => prev.filter((item) => item.ply <= history.length));
    setSelectedSquare(null);
    setPendingPromotion(null);
    setCoachMessage(null);
    setWaitingForCoachConfirm(false);
    setShowPlayAnalysis(coachEnabled && history.length > 0);
    setFullAnalysisVisible(false);
    setHoveredMove(null);
    setIsHoveringBestMove(false);
    resetPreview();
    setLastMoveSquares(lastMove ? { from: lastMove.from, to: lastMove.to } : null);
  }

  function handleResign() {
    if (mode === "review" || mode === "history") return;
    if (isEngineThinking || gameData.result !== "*") return;
    if (!gameData.moves.length) return;

    const resigningSide = chess.turn();
    const result = resigningSide === "w" ? "0-1" : "1-0";
    const resigningPlayer = resigningSide === "w" ? "White" : "Black";

    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`${resigningPlayer} resigns. End the game?`);
      if (!confirmed) return;
    }

    setResultHeaderForPgn(chess, result);
    const { built } = syncCurrentGameFromChess({ clearLiveCoach: true });

    setGameData({
      ...built,
      result,
      headers: {
        ...(built.headers || {}),
        Result: result,
      },
    });

    setSelectedSquare(null);
    setCoachMessage(`${resigningPlayer} resigned. ${getResultMessage(result)}`);
    setWaitingForCoachConfirm(false);
    setShowPlayAnalysis(true);
    setFullAnalysisVisible(false);
    setHoveredMove(null);
    setIsHoveringBestMove(false);
  }


  function finishGameAsDraw(message = getResultMessage("1/2-1/2")) {
    const result = "1/2-1/2";

    setResultHeaderForPgn(chess, result);
    const { built } = syncCurrentGameFromChess({ clearLiveCoach: true });

    setGameData({
      ...built,
      result,
      headers: {
        ...(built.headers || {}),
        Result: result,
      },
    });

    setSelectedSquare(null);
    setCoachMessage(message);
    setWaitingForCoachConfirm(false);
    setShowPlayAnalysis(true);
    setFullAnalysisVisible(false);
    setHoveredMove(null);
    setIsHoveringBestMove(false);
    clearCurrentUnfinishedGame();
  }

  async function handleOfferDraw() {
    if (mode === "review" || mode === "history") return;
    if (isEngineThinking || gameData.result !== "*") return;
    if (!gameData.moves.length) return;

    if (mode !== "coach") {
      const accepted =
        typeof window === "undefined" ||
        window.confirm("Offer draw? If Player 2 accepts, the game will end as a draw.");

      if (accepted) {
        finishGameAsDraw("Draw agreed. The game is over.");
      }

      return;
    }

    const confirmed =
      typeof window === "undefined" ||
      window.confirm("Offer a draw to the coach?");

    if (!confirmed) return;

    setIsEngineThinking(true);
    setCoachMessage("Coach is considering the draw offer...");
    setWaitingForCoachConfirm(false);

    try {
      const currentEval = await window.engineApi.analyzeFen(chess.fen(), 10);
      const score = currentEval?.normalizedScore;
      const isClearlyEqual = typeof score === "number" && Math.abs(score) <= 0.35;
      const shouldAccept = chess.isDraw() || isClearlyEqual;

      if (shouldAccept) {
        finishGameAsDraw("Coach accepted the draw offer. The game was drawn.");
      } else {
        setCoachMessage("Coach declined the draw offer. The position is still playable.");
        setShowPlayAnalysis(true);
      }
    } catch (error) {
      console.error("Draw offer failed:", error);
      setCoachMessage("Coach declined the draw offer. Try playing a few more moves first.");
      setShowPlayAnalysis(true);
    } finally {
      setIsEngineThinking(false);
    }
  }

  useEffect(() => {
    const updateBoardSize = () => {
      if (typeof window === "undefined") return;
      setBoardSize(getBoardPixelSize(window.innerWidth));
    };

    updateBoardSize();


    if (typeof window !== "undefined") {
      window.addEventListener("resize", updateBoardSize);
      return () => window.removeEventListener("resize", updateBoardSize);
    }

    return undefined;
  }, []);

  useEffect(() => {
    function handleKeyDown(e) {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "ArrowLeft") {
        resetPreview();
        setSelectedPly((value) => {
          const nextValue = Math.max(0, value - 1);

          if (nextValue !== value) {
            sounds.playMove()
          }

          return nextValue;
        });
      } else if (e.key === "ArrowRight") {
        resetPreview();
        setSelectedPly((value) => {
          const nextValue = Math.min(gameData.moves.length, value + 1);

          if (nextValue !== value && nextValue > 0) {
            const move = gameData.moves[nextValue - 1];
            sounds.playFromSan(move?.san);
          }

          return nextValue;
        });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gameData.moves.length]);

  useEffect(() => {
    if (!moveListRef.current || !selectedPly) return;

    const activeMove = moveListRef.current.querySelector(".move-btn--active");
    if (!activeMove) return;

    activeMove.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [selectedPly]);

  useEffect(() => {
    if (!showAnalysisProgress || !isAnalyzing) return;

    const interval = setInterval(() => {
      setAnalysisProgress((value) => {
        if (value >= 85) return value;

        if (value < 40) return Math.min(40, value + 3);
        if (value < 70) return Math.min(70, value + 2);
        return Math.min(85, value + 1);
      });
    }, 350);

    return () => clearInterval(interval);
  }, [showAnalysisProgress, isAnalyzing]);

  const currentFen = useMemo(() => {
    if (previewFen) return previewFen;

    if (selectedPly <= 0) return gameData.initialFen;
    return gameData.moves[selectedPly - 1]?.fenAfter || gameData.initialFen;
  }, [gameData, selectedPly, previewFen]);

  const analysisMap = useMemo(() => {
    const map = new Map();
    analysis.forEach((item) => map.set(item.ply, item));
    return map;
  }, [analysis]);

  const currentMove = gameData.moves[selectedPly - 1] || null;

  const currentAnalysis =
    currentMove &&
    liveCoachAnalysis &&
    mode !== "review" &&
    liveCoachAnalysis.ply === currentMove.ply
      ? liveCoachAnalysis
      : currentMove
        ? analysisMap.get(currentMove.ply)
        : null;

  const bestMove = liveCoachAnalysis?.bestMove;

  const shouldShowLiveBestMoveArrow =
    coachEnabled &&
    mode !== "review" &&
    currentMove &&
    liveCoachAnalysis &&
    liveCoachAnalysis.ply === currentMove.ply &&
    ["Mistake", "Blunder"].includes(liveCoachAnalysis.label) &&
    bestMove &&
    bestMove !== liveCoachAnalysis?.lan;

  const bestMoveArrow = shouldShowLiveBestMoveArrow
    ? {
        from: squareToXY(bestMove.slice(0, 2), boardSize / 8),
        to: squareToXY(bestMove.slice(2, 4), boardSize / 8),
      }
    : null;    

  const boardHoveredMove =
    isHoveringBestMove || mode === "review" || fullAnalysisVisible
      ? currentAnalysis
      : shouldShowLiveBestMoveArrow
        ? liveCoachAnalysis
        : null;

  function getPerformancePlayerLabel(side) {
    const headers = gameData?.headers || {};

    if (mode === "coach") {
      return side === "w" ? activeProfileName : "Coach performance";
    }

    if (mode === "play") {
      const headerName = side === "w" ? headers.White : headers.Black;
      if (headerName && headerName !== "?") return headerName;
      return side === "w" ? twoPlayerWhite.name : twoPlayerBlack.name;
    }

    const fallback = side === "w" ? "White" : "Black";
    const headerName = side === "w" ? headers.White : headers.Black;

    return headerName && headerName !== "?" ? headerName : fallback;
  }

  const performanceCards = [
    {
      side: "w",
      label: getPerformancePlayerLabel("w"),
      rating: whiteRating,
      accuracy: whiteAccuracy,
      moveCount: whiteMoves.length,
    },
    {
      side: "b",
      label: getPerformancePlayerLabel("b"),
      rating: blackRating,
      accuracy: blackAccuracy,
      moveCount: blackMoves.length,
    },
  ].filter((item) => item.moveCount > 0);

  const performanceCardTitle =
    mode === "review" ? "Game Performance" : "Current Game Performance";

  const hasAlternativeBestMove =
    currentAnalysis?.bestMove &&
    currentAnalysis?.lan &&
    currentAnalysis.bestMove !== currentAnalysis.lan;

  const canUsePlayControls =
    mode !== "review" &&
    mode !== "history" &&
    !isEngineThinking &&
    gameData.result === "*" &&
    gameData.moves.length > 0;

  const canTakeBack = canUsePlayControls;
  const canOfferDraw = canUsePlayControls;
  const canResign = canUsePlayControls;

  const summary = useMemo(() => {
    const white = { Blunder: 0, Mistake: 0, Inaccuracy: 0 };
    const black = { Blunder: 0, Mistake: 0, Inaccuracy: 0 };

    analysis.forEach((item) => {
      const target = item.side === "w" ? white : black;
      if (target[item.label] != null) {
        target[item.label] += 1;
      }
    });

    return { white, black };
  }, [analysis]);

  function setFenHeadersForPgn(chessInstance, fen) {
    if (!fen) return;

    if (typeof chessInstance.header === "function") {
      chessInstance.header("SetUp", "1", "FEN", fen);
    }

    if (typeof chessInstance.setHeader === "function") {
      chessInstance.setHeader("SetUp", "1");
      chessInstance.setHeader("FEN", fen);
    }
  }

  function resetAnalysisState() {
    resetPreview();
    setSelectedPly(0);
    setAnalysis([]);
    setLiveCoachAnalysis(null);
    setCoachMessage(null);
    setWaitingForCoachConfirm(false);
    setShowPlayAnalysis(false);
    setFullAnalysisVisible(false);
    setSelectedSquare(null);
    setPendingPromotion(null);
    setLastMoveSquares(null);
    setHoveredMove(null);
    setIsHoveringBestMove(false);
  }

  function syncChessToGameData(built) {
    chess.load(built.initialFen || new Chess().fen());

    if (built.initialFen && built.initialFen !== new Chess().fen()) {
      setFenHeadersForPgn(chess, built.initialFen);
    }

    built.moves.forEach((m) => {
      chess.move(m.san, { sloppy: true });
    });
  }

  function refreshSavedGames() {
    setSavedGames(getSavedGames());
  }

  function refreshUnfinishedGames() {
    setUnfinishedGames(getUnfinishedGames());
  }

  function clearCurrentUnfinishedGame() {
    if (!playSessionIdRef.current) return;
    const nextGames = deleteUnfinishedGame(playSessionIdRef.current);
    setUnfinishedGames(nextGames);
  }

  function refreshProfiles() {
    const nextProfiles = getProfiles();
    const nextActiveProfile = getActiveProfile();

    setProfiles(nextProfiles);
    setActiveProfile(nextActiveProfile);
  }

  function openProfiles() {
    refreshProfiles();
    setMode("profiles");
    setStarted(true);
    setError("");
  }

  function openMyPuzzles() {
    refreshProfiles();
    setMode("puzzles");
    setStarted(true);
    setError("");
  }

  function handleCreateProfile(profileInput) {
    const { profile, profiles: nextProfiles } = createProfile(profileInput);
    setProfiles(nextProfiles);
    setActiveProfile(profile);
  }

  function handleSwitchProfile(profileId) {
    setActiveProfileId(profileId);
    refreshProfiles();
  }

  function handleUpdateProfile(profileId, updates) {
    const { profile, profiles: nextProfiles } = updateProfile(profileId, updates);
    setProfiles(nextProfiles);
    if (profile?.id === activeProfile?.id) {
      setActiveProfile(profile);
    }
  }

  function handleDeleteProfile(profileId) {
    const isLastProfile = profiles.length <= 1;

    if (isLastProfile) {
      alert("Keep at least one local profile.");
      return;
    }

    if (!window.confirm("Delete this local profile? Saved games will remain in Game History.")) {
      return;
    }

    const nextProfiles = deleteProfile(profileId);
    setProfiles(nextProfiles);
    setActiveProfile(getActiveProfile());
  }

  function buildHistorySnapshot({
    id,
    nextPgn,
    built,
    sourceMode = mode,
    analysisSnapshot = analysis,
  }) {
    const openingInfo = getOpeningInfo(built?.moves || []);
    const headers = built?.headers || {};
    const selectedWhite = sourceMode === "play"
      ? twoPlayerWhite
      : {
          profileId: activeProfile?.id || null,
          name: activeProfileName,
          rating: activeProfile?.currentRating || 1500,
        };
    const selectedBlack = sourceMode === "play"
      ? twoPlayerBlack
      : null;

    const profileMeta = {
      profileId: selectedWhite?.profileId || activeProfile?.id || null,
      userName: selectedWhite?.name || activeProfileName,
      userRating: selectedWhite?.rating || activeProfile?.currentRating || 1500,
    };

    if (sourceMode === "coach") {
      profileMeta.white = activeProfileName;
      profileMeta.black = "Coach";
      profileMeta.coachElo = coachElo;
      profileMeta.coachLevelLabel = coachLevelLabel;
    }

    if (sourceMode === "play") {
      profileMeta.white = headers.White || selectedWhite.name;
      profileMeta.black = headers.Black || selectedBlack.name;
      profileMeta.whiteProfileId = selectedWhite.profileId;
      profileMeta.blackProfileId = selectedBlack.profileId;
      profileMeta.playerTwoName = headers.Black || selectedBlack.name;
    }

    return buildGameSnapshot({
      id,
      sourceMode,
      pgn: nextPgn,
      gameData: built,
      analysis: analysisSnapshot,
      meta: {
        ...profileMeta,
        openingName: openingInfo?.name || "",
        openingEco: openingInfo?.eco || "",
      },
    });
  }

  function saveSnapshotToHistory({
    id,
    nextPgn,
    built,
    sourceMode = mode,
    analysisSnapshot = analysis,
  }) {
    const existingGame = id
      ? getSavedGames().find((game) => game.id === id)
      : null;

    const snapshot = buildHistorySnapshot({
      id,
      nextPgn,
      built,
      sourceMode: existingGame?.sourceMode || sourceMode,
      analysisSnapshot,
    });

    saveLastReviewGame(snapshot);
    saveGame(snapshot);
    setSavedGames(getSavedGames());
    setCurrentReviewGameId(snapshot.id);

    return snapshot;
  }

  function saveCurrentUnfinishedGame({ nextPgn, built }) {
    if (!["play", "coach"].includes(mode)) return null;
    if (!built?.moves?.length || built.result !== "*") return null;

    const id = playSessionIdRef.current || `unfinished-${Date.now()}`;
    playSessionIdRef.current = id;

    const snapshot = buildHistorySnapshot({
      id,
      nextPgn,
      built,
      sourceMode: mode,
      analysisSnapshot: analysis,
    });

    saveUnfinishedGame(snapshot);
    setUnfinishedGames(getUnfinishedGames());

    return snapshot;
  }

  function openLoadGameModal() {
    const games = getUnfinishedGames();
    setUnfinishedGames(games);

    if (!games.length) {
      setError("No unfinished games to load yet.");
      return;
    }

    setShowLoadGameModal(true);
  }

  function loadUnfinishedGame(savedGame) {
    try {
      if (!savedGame?.pgn && !savedGame?.gameData) return;

      const built = savedGame.gameData || buildMoveObjectsFromPgn(savedGame.pgn);
      const nextPgn = savedGame.pgn || "";
      const sourceMode = savedGame.sourceMode === "coach" ? "coach" : "play";

      playSessionIdRef.current = savedGame.id || `unfinished-${Date.now()}`;

      if (sourceMode === "coach" && savedGame.meta?.coachElo) {
        setCoachElo(clampCoachElo(savedGame.meta.coachElo));
      }

      if (sourceMode === "coach" && savedGame.meta?.profileId) {
        const savedProfile = getProfiles().find((profile) => profile.id === savedGame.meta.profileId);

        if (savedProfile) {
          setActiveProfileId(savedProfile.id);
          setActiveProfile(savedProfile);
          setProfiles(getProfiles());
        }
      }

      if (sourceMode === "play") {
        setTwoPlayerWhiteProfileId(savedGame.meta?.whiteProfileId || "guest");
        setTwoPlayerBlackProfileId(savedGame.meta?.blackProfileId || "guest");
      }

      syncChessToGameData(built);
      setPgn(nextPgn);
      setGameData(built);
      setAnalysis(Array.isArray(savedGame.analysis) ? savedGame.analysis : []);
      setSelectedPly(built.moves.length);
      setMode(sourceMode);
      setStarted(true);
      setRightTab("moves");
      setShowLoadGameModal(false);
      setCurrentReviewGameId(null);
      setSelectedSquare(null);
      setPendingPromotion(null);
      setCoachMessage(null);
      setWaitingForCoachConfirm(false);
      setShowPlayAnalysis(Boolean(savedGame.analysis?.length));
      setFullAnalysisVisible(false);
      setHoveredMove(null);
      setIsHoveringBestMove(false);
      setLiveCoachAnalysis(null);
      resetPreview();

      const lastMove = built.moves[built.moves.length - 1];
      setLastMoveSquares(lastMove ? { from: lastMove.from, to: lastMove.to } : null);
      setError("");
    } catch (error) {
      console.error("Load unfinished game failed:", error);
      setError("This unfinished game could not be loaded.");
    }
  }

  function removeUnfinishedGame(gameId) {
    const nextGames = deleteUnfinishedGame(gameId);
    setUnfinishedGames(nextGames);

    if (playSessionIdRef.current === gameId) {
      playSessionIdRef.current = null;
    }
  }

  function maybeApplyTrainingRatingUpdate(snapshot, analysisSnapshot = []) {
    if (!snapshot?.id) return null;
    if (!["coach", "play"].includes(snapshot.sourceMode)) return null;
    if (!snapshot.result || snapshot.result === "*") return null;

    const profilesById = new Map(getProfiles().map((profile) => [profile.id, profile]));

    const ratingTargets = [];

    if (snapshot.sourceMode === "coach") {
      const profileId = snapshot.meta?.profileId || activeProfile?.id;
      const profile = profilesById.get(profileId);

      if (profile) {
        ratingTargets.push({
          profile,
          side: "w",
          opponentName: snapshot.meta?.black || "Coach",
          opponentRating: Number(snapshot.meta?.coachElo) || coachElo,
        });
      }
    }

    if (snapshot.sourceMode === "play") {
      const whiteProfile = profilesById.get(snapshot.meta?.whiteProfileId);
      const blackProfile = profilesById.get(snapshot.meta?.blackProfileId);

      if (whiteProfile) {
        ratingTargets.push({
          profile: whiteProfile,
          side: "w",
          opponentName: snapshot.meta?.black || "Black",
          opponentRating: getProfileRating(blackProfile),
        });
      }

      if (blackProfile) {
        ratingTargets.push({
          profile: blackProfile,
          side: "b",
          opponentName: snapshot.meta?.white || "White",
          opponentRating: getProfileRating(whiteProfile),
        });
      }
    }

    const events = [];
    let latestProfiles = getProfiles();

    ratingTargets.forEach(({ profile, side, opponentName, opponentRating }) => {
      const userMoves = analysisSnapshot.filter((item) => item.side === side);
      if (userMoves.length < 10) return;

      const performanceRating = estimatePlayerRating(analysisSnapshot, snapshot.result, side);
      const accuracy = calculateAccuracy(userMoves);
      const perspectiveResult = getResultForSide(snapshot.result, side);

      const change = calculateTrainingRatingChange({
        currentRating: profile.currentRating,
        performanceRating,
        accuracy,
        moveCount: userMoves.length,
        result: perspectiveResult,
        opponentRating,
      });

      if (!change) return;

      const ratingUpdate = applyTrainingRatingUpdate(profile.id, {
        gameId: snapshot.id,
        performanceRating,
        accuracy,
        moveCount: userMoves.length,
        result: snapshot.result,
        sourceMode: snapshot.sourceMode,
        opponent: opponentName || "Opponent",
        change,
      });

      latestProfiles = ratingUpdate?.profiles || getProfiles();

      if (ratingUpdate?.applied && ratingUpdate.event) {
        events.push({
          ...ratingUpdate.event,
          profileId: profile.id,
          profileName: profile.name,
          side,
        });
      }
    });

    if (!events.length) {
      return { applied: false, events: [], event: null, profiles: latestProfiles };
    }

    setProfiles(latestProfiles);

    const nextActiveProfile = latestProfiles.find((profile) => profile.id === activeProfile?.id) || getActiveProfile();
    setActiveProfile(nextActiveProfile);

    return {
      applied: true,
      events,
      event: events[0],
      profiles: latestProfiles,
    };
  }

  function openGameHistory() {
    refreshSavedGames();
    setMode("history");
    setStarted(true);
    setError("");
  }

  function openSavedGame(savedGame) {
    try {
      if (!savedGame?.pgn && !savedGame?.gameData) return;

      const built = savedGame.gameData || buildMoveObjectsFromPgn(savedGame.pgn);
      const nextPgn = savedGame.pgn || "";

      openBuiltGameInReview({
        nextPgn,
        built,
        sourceMode: savedGame.sourceMode || "history",
        save: false,
      });

      setCurrentReviewGameId(savedGame.id || null);
      setAnalysis(Array.isArray(savedGame.analysis) ? savedGame.analysis : []);
      setFullAnalysisVisible(Boolean(savedGame.analysis?.length));
      setShowPlayAnalysis(Boolean(savedGame.analysis?.length));
      setRightTab("moves");
    } catch (error) {
      console.error("Open saved game failed:", error);
      setError("This saved game could not be opened.");
    }
  }

  function removeSavedGame(gameId) {
    const nextGames = deleteGame(gameId);
    setSavedGames(nextGames);

    if (currentReviewGameId === gameId) {
      setCurrentReviewGameId(null);
    }
  }

  function openBuiltGameInReview({ nextPgn, built, sourceMode = mode, save = false }) {
    if (!built?.moves?.length) {
      setError("Play at least one move before opening Game Review.");
      return;
    }

    let snapshot = null;

    if (save) {
      snapshot = saveSnapshotToHistory({
        nextPgn,
        built,
        sourceMode,
        analysisSnapshot: [],
      });
    } else {
      setCurrentReviewGameId(null);
    }

    syncChessToGameData(built);
    setPgn(nextPgn);
    setGameData(built);

    resetAnalysisState();

    setMode("review");
    setStarted(true);
    setSelectedPly(built.moves.length);
    setRightTab("moves");
    setFullAnalysisVisible(true);
    setShowPlayAnalysis(true);
    setError("");
  }

  function reviewCurrentGame() {
    try {
      const currentPgn = chess.pgn();
      const built = buildMoveObjectsFromPgn(currentPgn);

      openBuiltGameInReview({
        nextPgn: currentPgn,
        built,
        sourceMode: mode,
        save: true,
      });
    } catch (error) {
      console.error("Review current game failed:", error);
      setError("This game could not be opened in Game Review.");
    }
  }

  function openSampleReviewGame() {
    try {
      const built = buildMoveObjectsFromPgn(START_PGN);

      openBuiltGameInReview({
        nextPgn: START_PGN,
        built,
        sourceMode: "sample",
        save: false,
      });

      setSelectedPly(0);
      setFullAnalysisVisible(false);
      setShowPlayAnalysis(false);
    } catch (error) {
      console.error("Sample review failed:", error);
      setError("The sample game could not be loaded.");
    }
  }

  function toggleCoach() {
    const nextValue = !coachEnabled;

    setCoachEnabled(nextValue);
    setCoachMessage(null);
    setWaitingForCoachConfirm(false);
    setIsHoveringBestMove(false);
    setHoveredMove(null);
    resetPreview();

    if (nextValue && mode !== "review" && analysis.length > 0) {
      setShowPlayAnalysis(true);
    }
  }

  function importPgn() {
    try {
      const built = buildMoveObjectsFromPgn(pgn);

      syncChessToGameData(built);
      setGameData(built);
      setCurrentReviewGameId(null);
      resetAnalysisState();
      setError("");
    } catch (error) {
      console.error("PGN import failed:", error);
      setError("The PGN could not be parsed. Please paste a valid PGN game.");
    }
  }

  function loadFenForTest() {
    try {
      const fen = testFen.trim();

      if (!fen) {
        setError("Paste a FEN before loading the test position.");
        return;
      }

      const built = buildMoveObjectsFromFen(fen);

      syncChessToGameData(built);
      setPgn(`[SetUp "1"]\n[FEN "${built.initialFen}"]\n\n*`);
      setGameData(built);
      setCurrentReviewGameId(null);
      resetAnalysisState();
      setError("");
      setMode("review");
      setStarted(true);
    } catch (error) {
      console.error("FEN load failed:", error);
      setError("The FEN could not be loaded. Please paste a valid FEN position.");
    }
  }

async function runAnalysis(customGameData = gameData) {
  try {
    resetPreview();
    setError("");
    setAnalysisProgress(0);
    setShowAnalysisProgress(true);
    setIsAnalyzing(true);

    const results = await buildGameAnalysis({
      moves: customGameData.moves,
      depth,
      engineApi: window.engineApi,
    });

    setAnalysis(results);

    if (mode === "review" && customGameData?.moves?.length) {
      const shouldPersistReview = currentReviewGameId || pgn !== START_PGN;

      if (shouldPersistReview) {
        const savedSnapshot = saveSnapshotToHistory({
          id: currentReviewGameId || undefined,
          nextPgn: pgn,
          built: customGameData,
          sourceMode: "review",
          analysisSnapshot: results,
        });

        const ratingUpdate = maybeApplyTrainingRatingUpdate(savedSnapshot, results);
        let finalSnapshot = savedSnapshot;

        if (ratingUpdate?.applied && ratingUpdate.events?.length) {
          finalSnapshot = {
            ...savedSnapshot,
            meta: {
              ...savedSnapshot.meta,
              trainingRatingUpdate: ratingUpdate.event,
              trainingRatingUpdates: ratingUpdate.events,
            },
          };

          saveLastReviewGame(finalSnapshot);
          saveGame(finalSnapshot);
          setSavedGames(getSavedGames());
        }

        const generatedPuzzles = saveGeneratedPuzzlesFromSnapshot(finalSnapshot, results, {
          fallbackProfileId: activeProfile?.id || null,
          fallbackProfileName: activeProfileName,
        });

        if (generatedPuzzles.length) {
          saveGame({
            ...finalSnapshot,
            meta: {
              ...finalSnapshot.meta,
              generatedPuzzleCount: generatedPuzzles.length,
              puzzlesGeneratedAt: new Date().toISOString(),
            },
          });
          setSavedGames(getSavedGames());
        }
      }
    }

    setAnalysisProgress(100);
    await new Promise((resolve) => setTimeout(resolve, 350));

    if (coachEnabled) {
      const lastResult = results[results.length - 1];

      if (
        lastResult &&
        ["Blunder", "Mistake"].includes(lastResult.label)
      ) {
        setCoachMessage(lastResult.explanation);
      } else {
        setCoachMessage(null);
      }
    }
  } catch (err) {
    setError(err?.message || "Analysis failed...");
  } finally {
    setIsAnalyzing(false);
    setShowAnalysisProgress(false);
  }
}

  const highlights = {};

  const shouldShowAnalysisHighlights =
    mode === "review" ||
    fullAnalysisVisible ||
    hoveredMove ||
    (coachEnabled &&
      coachMessage &&
      ["Blunder", "Mistake"].includes(currentAnalysis?.label));

  if (shouldShowAnalysisHighlights && currentAnalysis) {
    const rawDetections = currentAnalysis?.detections || [];

    const visibleSignals = selectMessageSignals(
      rawDetections,
      createSignalMessageContext({
        san: currentAnalysis?.san,
        fenBefore: currentAnalysis?.fenBefore,
        label: currentAnalysis?.label,
      })
    );

    const primary = visibleSignals[0];
    const detections = visibleSignals;
    const lan = currentAnalysis?.lan;
    const from = lan?.slice(0, 2);
    const to = lan?.slice(2, 4);

    if (primary?.type === "materialGain") {
      if (from) highlights[from] = "source";
      if (to) highlights[to] = "gain";
    } else if (["attack", "battery", "pin", "ignoredAttack", "enemyPressure", "capture", "recapture"].includes(primary?.type)) {
    primary.targets?.forEach((t) => {
      if (t.square !== to) {
        highlights[t.square] = "threat";
      }
    });

    detections
      .filter(
        (d) =>
          d !== primary &&
          ["attack", "battery", "pin"].includes(d.type) &&
          d.targets?.some(t => !t.isDefended || (t.value || 0) >= 3)
      )
      .forEach((d) => {
        d.targets?.forEach((t) => {
          highlights[t.square] = "threat";
        });
      });

    } else if (primary?.type === "moveToSafety") {
      if (from) highlights[from] = "source";
      if (to) highlights[to] = "safe";

      const attack = detections.find((d) => d.type === "attack" && d.targets?.length);
      attack?.targets?.forEach((t) => {
        highlights[t.square] = "threat";
      });
    }
  }

  const boardHighlights = {
    ...(selectedSquare ? { [selectedSquare]: "selected" } : {}),
    ...(lastMoveSquares?.from ? { [lastMoveSquares.from]: "last-from" } : {}),
    ...(lastMoveSquares?.to ? { [lastMoveSquares.to]: "last-to" } : {}),
    ...highlights,
  };

  const bgStyle = {
    backgroundImage: `url(${bgChess})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  };
  const bgStyleApp = {
    backgroundImage: `url(${bgChessApp})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  };
  if (!started) {
    return (
      <StartScreen
        bgStyle={bgStyle}
        chessIcon={chessIcon}
        onPlayGame={() => startNewGame("play")}
        onPlayWithCoach={() => startNewGame("coach")}
        coachElo={coachElo}
        coachLevelLabel={coachLevelLabel}
        onCoachEloChange={setCoachElo}
        onReviewGame={openSampleReviewGame}
        onGameHistory={openGameHistory}
        onMyPuzzles={openMyPuzzles}
        activeProfile={activeProfile}
        profiles={profiles}
        twoPlayerWhiteProfileId={twoPlayerWhiteProfileId}
        twoPlayerBlackProfileId={twoPlayerBlackProfileId}
        onTwoPlayerWhiteChange={setTwoPlayerWhiteProfileId}
        onTwoPlayerBlackChange={setTwoPlayerBlackProfileId}
        onProfile={openProfiles}
      />
    );
  }
  if (mode === "profiles") {
    return (
      <ProfilePanel
        bgStyleApp={bgStyleApp}
        profiles={profiles}
        activeProfile={activeProfile}
        onBack={() => setStarted(false)}
        onCreateProfile={handleCreateProfile}
        onUpdateProfile={handleUpdateProfile}
        onDeleteProfile={handleDeleteProfile}
        onSwitchProfile={handleSwitchProfile}
      />
    );
  }

  if (mode === "puzzles") {
    return (
      <MyPuzzles
        bgStyleApp={bgStyleApp}
        activeProfile={activeProfile}
        sounds={sounds}
        onBack={() => setStarted(false)}
      />
    );
  }

  if (mode === "history") {
    return (
      <GameHistoryPanel
        bgStyleApp={bgStyleApp}
        onBack={() => setStarted(false)}
        savedGames={savedGames}
        refreshSavedGames={refreshSavedGames}
        openSavedGame={openSavedGame}
        removeSavedGame={removeSavedGame}
      />
    );
  }


  return (
    <div className="app-bg" style={bgStyleApp}>
      <button
        onClick={() => setStarted(false)}
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
      {showLoadGameModal && (
        <div className="load-game-overlay" role="dialog" aria-modal="true">
          <div className="load-game-card">
            <div className="load-game-card__header">
              <div>
                <div className="analysis-label">Load Game</div>
                <h2 className="panel-title">Continue unfinished game</h2>
              </div>
              <button
                type="button"
                className="load-game-close"
                onClick={() => setShowLoadGameModal(false)}
              >
                ×
              </button>
            </div>

            <div className="load-game-list">
              {unfinishedGames.map((game) => (
                <div key={game.id} className="load-game-item">
                  <div>
                    <div className="load-game-item__title">{game.title || `${game.meta?.white || "White"} vs ${game.meta?.black || "Black"}`}</div>
                    <div className="load-game-item__meta">
                      {game.sourceMode === "coach" ? "Play with Coach" : "2 Players"} · {game.moveCount} plies · {new Date(game.date).toLocaleString()}
                    </div>
                  </div>

                  <div className="load-game-item__actions">
                    <button type="button" className="btn btn--premium" onClick={() => loadUnfinishedGame(game)}>
                      Continue
                    </button>
                    <button type="button" className="btn btn--ghost" onClick={() => removeUnfinishedGame(game.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="app-wrap">

        

        {mode === "review" && (
          <section
            className="panel"
            style={{
              marginBottom: "14px",
              display: "grid",
              gap: "10px",
            }}
          >
            <div>
              <h2 className="panel-title">Dev FEN Loader</h2>
              <p className="panel-subtitle">
                Paste a FEN to test artificial tactical positions.
              </p>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <input
                type="text"
                value={testFen}
                onChange={(event) => setTestFen(event.target.value)}
                placeholder="Paste FEN for testing"
                style={{
                  flex: "1 1 420px",
                  minWidth: 0,
                  padding: "10px 12px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255,255,255,0.18)",
                }}
              />
              <button type="button" onClick={loadFenForTest}>
                Load FEN
              </button>
            </div>
          </section>
        )}

        <div className={`main-grid main-grid--${mode}`}>
          {mode === "review" && (
          <PgnPanel
            pgn={pgn}
            setPgn={setPgn}
            error={error}
            depth={depth}
            setDepth={setDepth}
            importPgn={importPgn}
            runAnalysis={runAnalysis}
            isAnalyzing={isAnalyzing}
            gameData={gameData}
            whiteRating={whiteRating}
            blackRating={blackRating}
            whiteAccuracy={whiteAccuracy}
            blackAccuracy={blackAccuracy}
            summary={summary}
            betterPlayerText={betterPlayerText}
          />
          )}
          <BoardPanel
            currentFen={currentFen}
            boardSize={boardSize}
            boardHoveredMove={boardHoveredMove}
            boardHighlights={boardHighlights}
            bestMoveArrow={bestMoveArrow}
            handleSquareClick={handleSquareClick}
            handleMove={handleMove}
            selectedPly={selectedPly}
            setSelectedPly={setSelectedPly}
            gameData={gameData}
            sounds={sounds}
            resetPreview={resetPreview}
            currentAnalysis={currentAnalysis}
          />
     

          <RightPanel
            rightTab={rightTab}
            setRightTab={setRightTab}
            mode={mode}
            showPlayAnalysis={showPlayAnalysis}
            coachEnabled={coachEnabled}
            coachElo={coachElo}
            coachLevelLabel={coachLevelLabel}
            onToggleCoach={toggleCoach}
            analysisCount={analysis.length}
            onNewGame={() => startNewGame(mode)}
            onReviewCurrentGame={reviewCurrentGame}
            canReviewCurrentGame={gameData.moves.length > 0}
            onLoadGame={openLoadGameModal}
            canLoadGame={unfinishedGames.length > 0}
            onTakeBack={handleTakeBack}
            canTakeBack={canTakeBack}
            onOfferDraw={handleOfferDraw}
            canOfferDraw={canOfferDraw}
            onResign={handleResign}
            canResign={canResign}
            performanceCards={performanceCards}
            performanceCardTitle={performanceCardTitle}
            analysis={analysis}
            gameData={gameData}
            analysisMap={analysisMap}
            selectedPly={selectedPly}
            setSelectedPly={setSelectedPly}
            setHoveredMove={setHoveredMove}
            resetPreview={resetPreview}
            sounds={sounds}
            moveListRef={moveListRef}
            fullAnalysisVisible={fullAnalysisVisible}
            currentMove={currentMove}
            currentAnalysis={currentAnalysis}
            hasAlternativeBestMove={hasAlternativeBestMove}
            setIsHoveringBestMove={setIsHoveringBestMove}
            playLinePreview={playLinePreview}
            previewInfo={previewInfo}
            stepPreviewBack={stepPreviewBack}
            stepPreviewForward={stepPreviewForward}
            coachMessage={coachMessage}
            waitingForCoachConfirm={waitingForCoachConfirm}
            setWaitingForCoachConfirm={setWaitingForCoachConfirm}
            makeEngineMove={makeEngineMove}
            whiteRating={whiteRating}
            blackRating={blackRating}
            whiteAccuracy={whiteAccuracy}
            blackAccuracy={blackAccuracy}
            summary={summary}
            betterPlayerText={betterPlayerText}
            gameTitle={gameTitle}
            opening={opening}
            summaryText={summaryText}
            showStory={showStory}
            setShowStory={setShowStory}
            narrativeText={narrativeText}
          />
        </div>
      </div>
      {pendingPromotion && (
        <div className="promotion-overlay" role="dialog" aria-modal="true">
          <div className="promotion-card">
            <div className="promotion-title">Promote pawn</div>
            <div className="promotion-subtitle">Choose the piece for the promotion.</div>

            <div className="promotion-options">
              {[
                { piece: "q", label: "Queen", white: "♕", black: "♛" },
                { piece: "r", label: "Rook", white: "♖", black: "♜" },
                { piece: "b", label: "Bishop", white: "♗", black: "♝" },
                { piece: "n", label: "Knight", white: "♘", black: "♞" },
              ].map((option) => (
                <button
                  key={option.piece}
                  type="button"
                  className="promotion-option"
                  onClick={() => choosePromotionPiece(option.piece)}
                >
                  <span className="promotion-piece-symbol">
                    {pendingPromotion?.color === "b" ? option.black : option.white}
                  </span>
                  <span className="promotion-piece-label">{option.label}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              className="promotion-cancel"
              onClick={clearPendingPromotion}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <AnalysisProgressOverlay
        show={showAnalysisProgress}
        depth={depth}
        progress={analysisProgress}
      />
    </div>
    
  );
}
