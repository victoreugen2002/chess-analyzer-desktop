import { Chess } from "chess.js";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLinePreview } from "./chess/ui/useLinePreview";
import { analyzeMove } from "./chess/analysis/analyzeMove";
import { buildGreedyCaptureValidations } from "./chess/analysis/greedyCaptureValidation";
import { buildMoveObjectsFromFen, buildMoveObjectsFromPgn } from "./chess/pgn/pgnParser";
import { getProgressWidth, getBoardPixelSize } from "./chess/ui/uiHelpers";
import { createMoveAudio } from "./chess/ui/sounds";

import GameStatsCards from "./components/GameStatsCards";
import { formatEval } from "./chess/explain/evalFormat";
import { getAdvantageSide } from "./chess/explain/labels";
import { getOpeningInfo } from "./chess/explain/openingInfo";
import { generateGameTitle, generateGameSummary, generateNarrativeSummary, estimatePlayerRating, calculateAccuracy } from "./chess/explain/gameSummary";
import MoveList from "./components/MoveList";
import AnalysisCard from "./components/AnalysisCard";
import PgnPanel from "./components/PgnPanel";
import Board from "./components/Board";
import "./app.css"; 
import moveSound from "./assets/sounds/move.mp3";
import captureSound from "./assets/sounds/capture.mp3";
import chessIcon from "./assets/chess-icon.png";
import bgChess from "./assets/bg-chess.png";
import bgChessApp from "./assets/bg-chess-app.png";
import { START_PGN } from "./chess/pgn/samplePgn";

export default function App() {
  const [mode, setMode] = useState("play");
  const [fullAnalysisVisible, setFullAnalysisVisible] = useState(false);
  const [coachEnabled, setCoachEnabled] = useState(true);
  const [isEngineThinking, setIsEngineThinking] = useState(false);
  const [showPlayAnalysis, setShowPlayAnalysis] = useState(false);
  const [lastMoveSquares, setLastMoveSquares] = useState(null);
  const sounds = useMemo(() => createMoveAudio(moveSound, captureSound), []);
  const { previewFen, resetPreview, playLinePreview } = useLinePreview(sounds);
  const moveListRef = useRef(null);
  const [waitingForCoachConfirm, setWaitingForCoachConfirm] = useState(false);
  const [chess] = useState(() => new Chess());
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [rightTab, setRightTab] = useState("moves");
  const [showStory, setShowStory] = useState(false);
  const [pgn, setPgn] = useState(START_PGN);
  const [testFen, setTestFen] = useState("");
  const [gameData, setGameData] = useState(() => buildMoveObjectsFromPgn(START_PGN));
  const [selectedPly, setSelectedPly] = useState(0);
  const [analysis, setAnalysis] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
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
  const whitePlayedBetter = whiteAccuracy > blackAccuracy;
  const blackPlayedBetter = blackAccuracy > whiteAccuracy;

  function squareToXY(square, cellSize) {
    const file = square.charCodeAt(0) - 97; // a=0
    const rank = 8 - parseInt(square[1], 10); // 8->0
    return {
      x: file * cellSize + cellSize / 2,
      y: rank * cellSize + cellSize / 2,
    };
  }

  const bestMove = liveCoachAnalysis?.bestMove;

  const bestMoveArrow =
    coachEnabled &&
    coachMessage &&
    bestMove &&
    bestMove !== liveCoachAnalysis?.lan
      ? {
          from: squareToXY(bestMove.slice(0, 2), boardSize / 8),
          to: squareToXY(bestMove.slice(2, 4), boardSize / 8),
        }
      : null;

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

    setPgn("");
    setGameData({
      headers: {},
      result: "*",
      moves: [],
      initialFen: chess.fen(),
    });

    setSelectedPly(0);
    setAnalysis([]);
    setShowPlayAnalysis(false);
    setSelectedSquare(null);
    setLastMoveSquares(null);

    setMode(modeType);
    setStarted(true);

    setCoachMessage(null);
    setLiveCoachAnalysis(null);
    setWaitingForCoachConfirm(false);

    setFullAnalysisVisible(false);
    setHoveredMove(null);
    setIsHoveringBestMove(false);
  }

  function handleSquareClick(square) {
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

    let move = null;

    try {
      move = chess.move({
        from: selectedSquare,
        to: square,
        promotion: "q",
      });
    } catch {
      move = null;
    }

    if (move) {
      setSelectedSquare(null);
      sounds.playFromSan(move.san);

      setLastMoveSquares({
        from: move.from,
        to: move.to,
      });

      const newPgn = chess.pgn();
      const built = buildMoveObjectsFromPgn(newPgn);

      setPgn(newPgn);
      setGameData(built);
      setSelectedPly(chess.history().length);
      setFullAnalysisVisible(false); 
      if (coachEnabled) {
        setShowPlayAnalysis(true);
        runAnalysis(built);
      }
    } else {
      setSelectedSquare(null);
    }
  }

  function buildMove(from, to, promotion) {
    const move = { from, to };

    if (promotion) {
      move.promotion = promotion;
    }

    return move;
  }

  async function makeEngineMove() {
    if (mode !== "coach" || chess.isGameOver()) return;

    setIsEngineThinking(true);

    try {
      await new Promise((r) => setTimeout(r, 400));

      const result = await window.engineApi.getBestMove(chess.fen(), 2200, 11);

      if (result?.bestMove) {
        const engineMove = chess.move(
          buildMove(
            result.bestMove.slice(0, 2),
            result.bestMove.slice(2, 4),
            result.bestMove[4]
          )
        );

        if (engineMove) {
          sounds.playFromSan(engineMove.san);
          setLastMoveSquares({ from: engineMove.from, to: engineMove.to });

          setLiveCoachAnalysis(null);

          const enginePgn = chess.pgn();
          const engineBuilt = buildMoveObjectsFromPgn(enginePgn);

          setPgn(enginePgn);
          setGameData(engineBuilt);
          setSelectedPly(chess.history().length);
        }
      }
    } catch (error) {
      console.error("Engine move failed:", error);
    } finally {
      setIsEngineThinking(false);
    }
  }



  async function handleMove(from, to) {
    if (mode === "coach" && chess.turn() !== "w") return;
    if (isEngineThinking) return;

    const previousFen = chess.fen();

    let move = null;

    try {
      move = chess.move(buildMove(from, to));
    } catch {
      move = null;
    }

    if (!move) return;

    setSelectedSquare(null);
    sounds.playFromSan(move.san);
    setLastMoveSquares({ from: move.from, to: move.to });

    const newPgn = chess.pgn();
    const built = buildMoveObjectsFromPgn(newPgn);
    const history = chess.history({ verbose: true });

    setPgn(newPgn);
    setGameData(built);
    setSelectedPly(history.length);
    setFullAnalysisVisible(false);

    if (coachEnabled && mode === "coach") {
      try {
        const before = await window.engineApi.analyzeFen(previousFen, 10);
        const after = await window.engineApi.analyzeFen(chess.fen(), 10);

        const loss =
          before.normalizedScore === null || after.normalizedScore === null
            ? 0
            : before.normalizedScore - after.normalizedScore;

        const greedyCaptureValidations = await buildGreedyCaptureValidations({
          item: {
            fenBefore: previousFen,
            fenAfter: chess.fen(),
            san: move.san,
            side: move.color,
            loss,
          },
          moves: history,
          moveIndex: history.length - 1,
          analyzeFen: window.engineApi.analyzeFen,
          depth: Math.min(depth, 10),
        });

        const lastMoveAnalysis = analyzeMove({
          ply: history.length,
          fenBefore: previousFen,
          fenAfter: chess.fen(),
          san: move.san,
          side: move.color,
          bestMove: before.bestMove,
          bestEval: before.normalizedScore,
          playedEval: after.normalizedScore,
          loss,
          moves: history,
          moveIndex: history.length - 1,
          playedLine: move.lan,
          lan: move.lan,
          greedyCaptureValidations,
        });

        setLiveCoachAnalysis(lastMoveAnalysis);

        setAnalysis((prev) => {
          const withoutCurrentMove = prev.filter(
            (item) => item.ply !== lastMoveAnalysis.ply
          );

          return [...withoutCurrentMove, lastMoveAnalysis];
        });

        const shouldShowCoachMessage = ["Inaccuracy", "Mistake", "Blunder"].includes(
          lastMoveAnalysis?.label
        );

        if (shouldShowCoachMessage) {
          setWaitingForCoachConfirm(true);
        } else {
          setWaitingForCoachConfirm(false);
        }

        setCoachMessage(
          shouldShowCoachMessage ? lastMoveAnalysis.explanation : null
        );

        console.log("COACH MESSAGE SET TO:", lastMoveAnalysis.explanation);

        setShowPlayAnalysis(true);
        if (shouldShowCoachMessage) {
          return;
        }
        
      } catch (error) {
        console.error("Live coach analysis failed:", error);
        setCoachMessage(null);
      }
    }

    if (mode === "coach" && !chess.isGameOver()) {
      setWaitingForCoachConfirm(false);
      await makeEngineMove();
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
  liveCoachAnalysis && mode === "coach"
    ? liveCoachAnalysis
    : currentMove
      ? analysisMap.get(currentMove.ply)
      : null;
  const hasAlternativeBestMove =
    currentAnalysis?.bestMove &&
    currentAnalysis?.lan &&
    currentAnalysis.bestMove !== currentAnalysis.lan;
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

  function importPgn() {
    try {
      const built = buildMoveObjectsFromPgn(pgn);

      syncChessToGameData(built);
      setGameData(built);
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
      setIsAnalyzing(true);

      if (!window.engineApi?.analyzeGame) {
        throw new Error("Engine API not available");
      }

      const raw = await window.engineApi.analyzeGame(customGameData.moves, depth);

      const results = [];

      for (let index = 0; index < raw.length; index++) {
        const item = raw[index];
        const greedyCaptureValidations = await buildGreedyCaptureValidations({
          item,
          moves: customGameData.moves,
          moveIndex: index,
          analyzeFen: window.engineApi.analyzeFen,
          depth: Math.min(depth, 10),
        });

        results.push(
          analyzeMove({
            ...item,
            moves: customGameData.moves,
            moveIndex: index,
            greedyCaptureValidations,
          })
        );
      }
      setAnalysis(results);
      if (coachEnabled) {
        const lastResult = results[results.length - 1];

        if (
          lastResult &&
          ["Blunder", "Mistake", "Inaccuracy"].includes(lastResult.label)
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
    }
  }

  const highlights = {};

  const shouldShowAnalysisHighlights =
    mode === "review" ||
    fullAnalysisVisible ||
    hoveredMove ||
    (coachEnabled &&
      coachMessage &&
      ["Blunder", "Mistake", "Inaccuracy"].includes(currentAnalysis?.label));

  if (shouldShowAnalysisHighlights && currentAnalysis) {
    const primary = currentAnalysis?.primary;
    const detections = currentAnalysis?.detections || [];
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
      <div className="intro" style={bgStyle}>

        <div className="intro-glow" />

        <div className="intro-card">

          <div className="intro-icon">
            <img src={chessIcon} className="intro-logo" />
          </div>

          <h1>Chess Analyzer</h1> 

          <p className="intro-subtitle">
            Engine-powered analysis of chess games move by move.
          </p>

          <p className="intro-hint">
            Press Start Analysis to start with an example.<br></br>
            Then paste a PGN to start analyzing your own game.
          </p>

          <div className="intro-features">
            <div>✓ Move-by-move evaluation</div>
            <div>✓ Blunder detection</div>
            <div>✓ Best move suggestions</div>
            <div>✓ Game summaries & ratings</div>
          </div>

          <div className="intro-actions" style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={() => startNewGame("play")}
              style={{ flex: 1 }}
            >
              Play Game
            </button>

            <button
              onClick={() => startNewGame("coach")}
              style={{ flex: 1 }}
            >
              Play with Coach
            </button>

            <button
              onClick={() => {
                setMode("review");
                setPgn(START_PGN);
                setStarted(true);
              }}
              style={{ flex: 1 }}
            >
              Review Game
            </button>
          </div>

        </div>
      </div>
    );
  }
  return (
    <div className="app-bg" style={bgStyleApp}>
      <button
        onClick={() => setStarted(false)}
        className="btn btn--ghost"
        style={{ marginBottom: "10px" }}
      >
        ← Back
      </button>
      <div className="app-wrap">
        <div className="hero-row">
          <div>
            <h1 className="page-title">Chess Analysis</h1>
          </div>

        </div>
        

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
          <section className="panel panel--board">
            <div className="board-top-row">
              <div>
                <h2 className="panel-title">Board Review</h2>
                <p className="panel-subtitle">
                  Use ← → or buttons to navigate moves.
                </p>
              </div>
              <div className="eval-card">
                <div className="eval-head"><span>Evaluation</span><span>{formatEval(currentAnalysis?.playedEval ?? 0)}</span></div>
                <div className="eval-track"><div className="eval-fill" style={{ width: `${getProgressWidth(currentAnalysis?.playedEval ?? 0)}%` }} /></div>
              </div>

            </div>


            <Board
              fen={currentFen}
              size={boardSize}
              hoveredMove={
                (
                  isHoveringBestMove ||
                  mode === "review" ||
                  fullAnalysisVisible
                )
                  ? currentAnalysis
                  : liveCoachAnalysis
              }
              highlights={boardHighlights}
              arrowFrom={bestMoveArrow?.from}
              arrowTo={bestMoveArrow?.to}
              onSquareClick={handleSquareClick}
              onMove={handleMove}
            />
            <div className="nav-row">
              <button
                onClick={() => {
                  resetPreview();
                  if (selectedPly !== 0) {
                    sounds.playMove()
                  }
                  setSelectedPly(0);
                }}
                className="btn btn--ghost"
              >
                Start
              </button>
              <button
                onClick={() => {
                  resetPreview();
                  setSelectedPly((value) => {
                    const nextValue = Math.max(0, value - 1);

                    if (nextValue !== value) {
                      sounds.playMove()
                    }

                    return nextValue;
                  });
                }}
                className="btn btn--ghost"
              >
                Previous
              </button>
              <button
                onClick={() => {
                  resetPreview();
                  setSelectedPly((value) => {
                    const nextValue = Math.min(gameData.moves.length, value + 1);

                    if (nextValue !== value && nextValue > 0) {
                      const move = gameData.moves[nextValue - 1];
                      sounds.playFromSan(move?.san);
                    }

                    return nextValue;
                  });
                }}
                className="btn btn--ghost"
              >
                Next
              </button>
              <div className="ply-box">Ply <strong>{selectedPly}</strong> / {gameData.moves.length}</div>
            </div>
      
       
          </section>
     

          <section className="panel panel--right">
            <div className="tabs">
              <button className={rightTab === "moves" ? "is-active" : ""} onClick={() => setRightTab("moves")}>Moves</button>
              {(mode === "review" || showPlayAnalysis) && (

              <button className={rightTab === "summary" ? "is-active" : ""} onClick={() => setRightTab("summary")}>Summary</button>
              )}
            </div>
            {rightTab === "moves" && (
              <>
              <div className="panel-head">
                <div className="panel-actions">
                  {mode !== "review" && (
                    <button
                      onClick={() => {
                        setCoachEnabled((v) => {
                          const next = !v;

                          if (!next) {
                            setCoachMessage(null);
                          } else if (gameData.moves.length > 0) {
                            setShowPlayAnalysis(true);
                            runAnalysis();
                          }

                          return next;
                        });
                      }}
                      className={`btn ${coachEnabled ? "btn--success" : "btn--ghost"}`}
                    >
                      Coach: {coachEnabled ? "ON" : "OFF"}
                    </button>
                  )}
                </div>

                <div className="panel-head--row">
                  <h2 className="panel-title">Move Review</h2>
                  <div className="waiting-pill">
                    {analysis.length ? "Analyzed" : "Waiting"}
                  </div>
                </div>

                <div className="panel-actions">
                  {mode !== "review" && (
                    <button onClick={() => startNewGame(mode)} className="btn btn--ghost">
                      New Game
                    </button>
                  )}

                  {mode !== "review" && (
                    <button
                      onClick={() => {
                        setFullAnalysisVisible(true);
                        setShowPlayAnalysis(true);
                        setCoachMessage(null);
                        runAnalysis();
                      }}
                      disabled={isAnalyzing || gameData.moves.length === 0}
                      className="btn btn--success"
                    >
                      {isAnalyzing ? "Analyzing..." : "Analyze Game"}
                    </button>
                  )}
                </div>
              </div>

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
              {(mode === "review" || fullAnalysisVisible) && (

              <AnalysisCard
                currentMove={currentMove}
                currentAnalysis={currentAnalysis}
                hasAlternativeBestMove={hasAlternativeBestMove}
                setIsHoveringBestMove={setIsHoveringBestMove}
                playLinePreview={playLinePreview}
              />
              
              )}
              {coachEnabled && coachMessage && !fullAnalysisVisible && mode !== "review" && (
                <div className="coach-box">
                  {coachMessage}
                </div>
              )}
              {waitingForCoachConfirm && (
                <button
                  className="btn btn--success coach-continue-btn"
                  onClick={() => {
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
                <div className="analysis-card">
                  {(mode === "review" || showPlayAnalysis) && (
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
                    onClick={() => setShowStory((v) => !v)}
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
        </div>
      </div>
    </div>
  );
}
