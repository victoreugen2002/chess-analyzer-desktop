import { Chess } from "chess.js";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLinePreview } from "./chess/ui/useLinePreview";
import { analyzeMove } from "./chess/analysis/analyzeMove";
import { buildMoveObjectsFromPgn } from "./chess/pgn/pgnParser";
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
  const [coachEnabled, setCoachEnabled] = useState(false);
  const [showPlayAnalysis, setShowPlayAnalysis] = useState(false);
  const [lastMoveSquares, setLastMoveSquares] = useState(null);
  const sounds = useMemo(() => createMoveAudio(moveSound, captureSound), []);
  const { previewFen, resetPreview, playLinePreview } = useLinePreview(sounds);
  const moveListRef = useRef(null);
  const [chess] = useState(() => new Chess());
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [rightTab, setRightTab] = useState("moves");
  const [showStory, setShowStory] = useState(false);
  const [pgn, setPgn] = useState(START_PGN);
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
  const whitePlayedBetter = whiteAccuracy > blackAccuracy;
  const blackPlayedBetter = blackAccuracy > whiteAccuracy;
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
  }

  function handleSquareClick(square) {
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

  function handleMove(from, to) {
    let move = null;

    try {
      move = chess.move({
        from,
        to,
        promotion: "q",
      });
    } catch {
      move = null;
    }

    if (!move) return;

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
  const currentAnalysis = currentMove ? analysisMap.get(currentMove.ply) : null;
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

  function importPgn() {
    try {
      resetPreview();
      const built = buildMoveObjectsFromPgn(pgn);

      chess.reset();
      built.moves.forEach(m => {
        chess.move(m.san, { sloppy: true });
      });

      setGameData(built);
      setSelectedPly(0);
      setSelectedPly(0);
      setAnalysis([]);
      setError("");
    } catch {
      setError("The PGN could not be parsed. Please paste a valid PGN game.");
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

      const results = raw.map((item, index) =>
        analyzeMove({
          ...item,
          moves: customGameData.moves,
          moveIndex: index,
        })
      );
      setAnalysis(results);
      if (coachEnabled) {
        const lastResult = results[results.length - 1];

        if (
          lastResult &&
          ["Blunder", "Mistake", "Inaccuracy"].includes(lastResult.label)
        ) {
          setCoachMessage(lastResult);
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
    } else if (["attack", "battery", "pin", "ignoredAttack", "enemyPressure"].includes(primary?.type)) {
    primary.targets?.forEach((t) => {
      highlights[t.square] = "threat";
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
                  : coachMessage
              }
              highlights={boardHighlights}
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
                  {(mode === "play" || mode === "engine") && (
                    <button
                      onClick={() => {
                        setCoachEnabled((v) => {
                          const next = !v;

                          if (!next) {
                            setCoachMessage(null);
                          } else {
                            if (gameData.moves.length > 0) {
                              setShowPlayAnalysis(true);
                              runAnalysis();
                            }
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
                  {(mode === "play" || mode === "coach") && (
                    <button
                      onClick={() => startNewGame(mode)}
                      className="btn btn--ghost"
                    >
                      New Game
                    </button>
                  )}
                  {(mode === "play" || mode === "coach") && (
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
                  {coachMessage.explanation}
                </div>
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
