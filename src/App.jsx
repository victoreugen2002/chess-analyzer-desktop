import React, { useEffect, useMemo, useRef, useState } from "react";
import { analyzeMove } from "./chess/analysis/analyzeMove";
import { buildMoveObjectsFromPgn } from "./chess/pgn/pgnParser";
import { getMoveSymbol, getMoveBadgeClass, getProgressWidth, getBoardPixelSize } from "./chess/ui/uiHelpers";
import { buildAnalysisResults } from "./chess/analysis/analysisBuilder";
import { uciLineToSanLine } from "./chess/utils";

import { formatEval } from "./chess/explain/evalFormat";
import { getAdvantageSide } from "./chess/explain/labels";
import { getOpeningInfo } from "./chess/explain/openingInfo";
import { generateGameTitle, generateGameSummary, generateNarrativeSummary, estimatePlayerRating, calculateAccuracy } from "./chess/explain/gameSummary";

import Board from "./components/Board";
import "./app.css"; 

import moveSound from "./assets/sounds/move.mp3";
import captureSound from "./assets/sounds/capture.mp3";

import chessIcon from "./assets/chess-icon.png";
import bgChess from "./assets/bg-chess.png";
import bgChessApp from "./assets/bg-chess-app.png";
const START_PGN = `[Event "Example"]
[Site "?"]
[Date "2026.04.18"]
[Round "?"]
[White "White"]
[Black "Black"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4+ 7. Nc3 Nxe4 8. O-O Bxc3 9. d5 Bf6 10. Re1 Ne7 11. Rxe4 d6 12. Bg5 Bxg5 13. Nxg5 O-O 14. Qh5 h6 15. Rae1 Ng6 16. Nxf7 1-0`;

const PIECE_NAMES = {
  p: "Pawn",
  n: "Knight",
  b: "Bishop",
  r: "Rook",
  q: "Queen",
  k: "King",
};

const PIECE_PATHS = {
  p: "M50 18c-6.5 0-11.5 5.2-11.5 11.7 0 4.8 2.7 8.8 6.7 10.6-6.1 3.7-10.2 10.1-10.2 17.5h30c0-7.4-4.1-13.8-10.2-17.5 4-1.8 6.7-5.8 6.7-10.6C61.5 23.2 56.5 18 50 18Zm-15 43h30v6H35Zm-4 10h38v8H31Z",
  n: "M62 72H30v-8l8-5V30c3-8 11-13 20-13h4v7h-3c-5 0-8 2-10 5l8 4-4 8-10-5v19h19V43l-7-5 4-7 10 7v21l8 5v8Zm-28 8h50v8H22v-8h3l2-8h34l1 8Z",
  b: "M50 16c-5.5 0-10 4.5-10 10 0 3.8 2.1 7.1 5.2 8.8L39 45l11 10 11-10-6.2-10.2A9.96 9.96 0 0 0 60 26c0-5.5-4.5-10-10-10ZM36 61h28v7H36Zm-5 11h38v8H31Zm-6 12h50v8H25Z",
  r: "M28 20h8v8h8v-8h12v8h8v-8h8v18H68v20H32V38h-4V20Zm7 44h30v8H35Zm-6 12h42v8H29Zm-5 12h52v8H24Z",
  q: "M29 32 21 21l8-5 9 12 12-9 12 9 9-12 8 5-8 11-7 23H36l-7-23Zm9 29h24v7H38Zm-6 11h36v8H32Zm-7 12h50v8H25Z",
  k: "M46 16h8v10h10v8H54v10h-8V34H36v-8h10V16Zm-7 33h22v10h8v8H31v-8h8V49Zm-8 22h38v8H31Zm-6 12h50v8H25Z",
};



function getPieceValue(piece) {
  if (!piece) return 0;

  const type = piece[1];

  if (type === "p") return 1;
  if (type === "n") return 3;
  if (type === "b") return 3;
  if (type === "r") return 5;
  if (type === "q") return 9;
  return 0;
}

function findKing(rows, color) {
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      if (rows[r][c] === `${color}k`) {
        return { row: r, col: c };
      }
    }
  }
  return null;
}


function runSelfTests() {
  const results = [];
  try {
    const parsed = buildMoveObjectsFromPgn(START_PGN);
    results.push({ name: "Parses sample PGN", pass: parsed.moves.length > 0 });
  } catch {
    results.push({ name: "Parses sample PGN", pass: false });
  }
  try {
    const width = getBoardPixelSize(400);
    results.push({ name: "Calculates mobile board size", pass: width >= 280 && width <= 368 });
  } catch {
    results.push({ name: "Calculates mobile board size", pass: false });
  }
  return results;
}

export default function App() {
  const moveAudio = useMemo(() => new Audio(moveSound), []);
  const captureAudio = useMemo(() => new Audio(captureSound), []);
  const moveListRef = useRef(null);
  const [rightTab, setRightTab] = useState("moves");
  const [showStory, setShowStory] = useState(false);
  const [previewFen, setPreviewFen] = useState(null);
  const [previewTimeouts, setPreviewTimeouts] = useState([]);
  const [pgn, setPgn] = useState(START_PGN);
  const [gameData, setGameData] = useState(() => buildMoveObjectsFromPgn(START_PGN));
  const [selectedPly, setSelectedPly] = useState(0);
  const [analysis, setAnalysis] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [boardSize, setBoardSize] = useState(560);
  const [tests, setTests] = useState([]);
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

  useEffect(() => {
    const updateBoardSize = () => {
      if (typeof window === "undefined") return;
      setBoardSize(getBoardPixelSize(window.innerWidth));
    };

    updateBoardSize();
    setTests(runSelfTests());

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
            playMoveSound();
          }

          return nextValue;
        });
      } else if (e.key === "ArrowRight") {
        resetPreview();
        setSelectedPly((value) => {
          const nextValue = Math.min(gameData.moves.length, value + 1);

          if (nextValue !== value && nextValue > 0) {
            const move = gameData.moves[nextValue - 1];
            playSoundForSan(move?.san);
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
      setGameData(built);
      setSelectedPly(0);
      setAnalysis([]);
      setError("");
    } catch {
      setError("The PGN could not be parsed. Please paste a valid PGN game.");
    }
  }

  async function runAnalysis() {
    try {
      resetPreview();
      setError("");
      setIsAnalyzing(true);

      if (!window.engineApi?.analyzeGame) {
        throw new Error("Engine API not available");
      }

      const raw = await window.engineApi.analyzeGame(gameData.moves, depth);


      const results = raw.map((item, index) =>
        analyzeMove({
          ...item,
          moves: gameData.moves,
          moveIndex: index,
        })
      );
      
      setAnalysis(results);
    } catch (err) {
      setError(err?.message || "Analysis failed...");
    } finally {
      setIsAnalyzing(false);
    }
  }



  function clearPreviewPlayback() {
    previewTimeouts.forEach((id) => clearTimeout(id));
    setPreviewTimeouts([]);
  }

  function resetPreview() {
    clearPreviewPlayback();
    setPreviewFen(null);
  }

  function playLinePreview(fen, line) {
    if (!fen || !line || line === "—") return;

    clearPreviewPlayback();

    try {
      const chess = new Chess(fen);
      const moves = line.split(/\s+/).filter(Boolean).slice(0, 10);

      setPreviewFen(chess.fen());

      const timeouts = [];

      moves.forEach((uci, index) => {
        const timeoutId = setTimeout(() => {
          const moveObj = {
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
          };

          if (uci.length > 4) {
            moveObj.promotion = uci[4];
          }

          const move = chess.move(moveObj);

          if (move) {
            setPreviewFen(chess.fen());
            playSoundForSan(move.san);
          }
        }, (index + 1) * 700);

        timeouts.push(timeoutId);
      });

      setPreviewTimeouts(timeouts);
    } catch {}
  }


  function playMoveSound() {
    try {
      moveAudio.currentTime = 0;
      moveAudio.play();
    } catch {}
  }
  function playCaptureSound() {
    try {
      captureAudio.currentTime = 0;
      captureAudio.play();
    } catch {}
  }

  function playSoundForSan(san) {
    if (!san) {
      playMoveSound();
      return;
    }

    if (san.includes("x")) {
      playCaptureSound();
      return;
    }

    playMoveSound();
  }
  // function speak(text) {
  //   if (!text) return;

  //   const utterance = new SpeechSynthesisUtterance(text);
  //   utterance.rate = 1;     // viteza
  //   utterance.pitch = 1;    // ton
  //   utterance.volume = 1;   // volum

  //   speechSynthesis.cancel(); // oprește ce vorbea înainte
  //   speechSynthesis.speak(utterance);
  // }
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

          <div className="intro-actions">

            <button onClick={() => {
              setPgn(START_PGN);
              setStarted(true);
            }}>
              Start Analysis
            </button>
          </div>

        </div>
      </div>
    );
  }
  return (
    <div className="app-bg" style={bgStyleApp}>
      <div className="app-wrap">
        <div className="hero-row">
          <div>
            <h1 className="page-title">Chess Analysis</h1>
          </div>

        </div>

        <div className="main-grid">
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
              <button onClick={runAnalysis} disabled={isAnalyzing || gameData.moves.length === 0} className="btn btn--success">{isAnalyzing ? "Analyzing..." : "Run Analysis"}</button>
            </div>

            <div className="summary-wrapper">
              <div className="summary-grid">
                <div className="summary-card">
                  <div className="summary-label">White</div>
                  <div className="summary-rating">
                    <span className="summary-rating__label">Game Rating</span>
                    <span className="summary-rating__value">{whiteRating}</span>
                  </div>
                  <div className="summary-accuracy">
                    <strong>{whiteAccuracy}%</strong> accuracy
                  </div>

                  <div className="summary-mini-grid">
                    <div className="summary-mini">
                      <span className="summary-mini__label">Inaccuracies</span>
                      <span className="summary-value summary-value--inaccuracy">
                        {summary.white.Inaccuracy}
                      </span>
                    </div>

                    <div className="summary-mini">
                      <span className="summary-mini__label">Mistakes</span>
                      <span className="summary-value summary-value--mistake">
                        {summary.white.Mistake}
                      </span>
                    </div>

                    <div className="summary-mini">
                      <span className="summary-mini__label">Blunders</span>
                      <span className="summary-value summary-value--blunder">
                        {summary.white.Blunder}
                      </span>
                    </div>
                  </div>
                </div>
             
                  <div className="summary-card">
                    <div className="summary-label">Black</div>
                    <div className="summary-rating">
                      <span className="summary-rating__label">Game Rating</span>
                      <span className="summary-rating__value">{blackRating}</span>
                    </div>
                    <div className="summary-accuracy">
                      <strong>{blackAccuracy}%</strong> accuracy
                    </div>
                    <div className="summary-mini-grid">
                      <div className="summary-mini">
                        <span className="summary-mini__label">Inaccuracies</span>
                        <span className="summary-value summary-value--inaccuracy">
                          {summary.black.Inaccuracy}
                        </span>
                      </div>
                      <div className="summary-mini">
                        <span className="summary-mini__label">Mistakes</span>
                        <span className="summary-value summary-value--mistake">
                          {summary.black.Mistake}
                        </span>
                      </div>
                      <div className="summary-mini">
                        <span className="summary-mini__label">Blunders</span>
                        <span className="summary-value summary-value--blunder">
                          {summary.black.Blunder}
                        </span>
                      </div>
                    </div>
                  </div>
             
           
          
              </div>
              <div className="summary-overview">
                {betterPlayerText}
              </div>
            </div>

            {/* <div className="info-card">
              <div className="info-row"><span>Engine mode</span><span className="status-chip">Bundled Stockfish</span></div>
              <div className="info-row"><span>Moves loaded</span><strong>{gameData.moves.length}</strong></div>
              <div className="info-row"><span>Result</span><strong>{gameData.result}</strong></div>
              {error ? <div className="error-box">{error}</div> : null}
            </div> */}

            {/* <div className="tests-card">
              <div className="tests-title">Self-checks</div>
              <div className="tests-list">
                {tests.map((test) => (
                  <div key={test.name} className="test-row">
                    <span>{test.name}</span>
                    <span className={test.pass ? "test-pass" : "test-fail"}>{test.pass ? "Pass" : "Fail"}</span>
                  </div>
                ))}
              </div>
            </div> */}
          </section>

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

            <Board fen={currentFen} size={boardSize} hoveredMove={hoveredMove}/>
      
            <div className="nav-row">
              <button
                onClick={() => {
                  resetPreview();
                  if (selectedPly !== 0) {
                    playMoveSound();
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
                      playMoveSound();
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
                      playSoundForSan(move?.san);
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
              <button className={rightTab === "summary" ? "is-active" : ""} onClick={() => setRightTab("summary")}>Summary</button>
            </div>
            {rightTab === "moves" && (
              <>
              <div className="panel-head panel-head--row">
                <div>
                  <h2 className="panel-title">Move Review</h2>
                </div>
                <div className="waiting-pill">{analysis.length ? "Analyzed" : "Waiting"}</div>
              </div>

              <div className="move-list" ref={moveListRef}>
                <div className="move-list-grid">
                  {Array.from({ length: Math.ceil(gameData.moves.length / 2) }).map((_, idx) => {
                    const white = gameData.moves[idx * 2];
                    const black = gameData.moves[idx * 2 + 1];
                    const whiteAnalysis = white ? analysisMap.get(white.ply) : null;
                    const blackAnalysis = black ? analysisMap.get(black.ply) : null;



                    return (
                    <React.Fragment key={idx}>
                      <div className="move-number">{idx + 1}</div>
                        <button
                          onMouseEnter={() => {
                            if (selectedPly === white?.ply) {
                              setHoveredMove(whiteAnalysis);
                            }
                          }}
                          onMouseLeave={() => setHoveredMove(null)}
                          onClick={() => {
                            if (!white) return;
                            resetPreview();
                            setSelectedPly(white.ply);
                            setHoveredMove(whiteAnalysis);
                            playSoundForSan(white.san);
                          }}
                          className={`move-btn ${selectedPly === white?.ply ? "move-btn--active" : ""}`}
                        >
                        <div className="move-san">
                          {white?.san || ""}
                          {whiteAnalysis?.label && (
                            <span className={getMoveBadgeClass(whiteAnalysis.label)}>
                              {getMoveSymbol(whiteAnalysis.label)}
                            </span>
                          )}
                        </div>
                      </button>

                        <button
                          onMouseEnter={() => {
                            if (selectedPly === black?.ply) {
                              setHoveredMove(blackAnalysis);
                            }
                          }}
                          onMouseLeave={() => setHoveredMove(null)}
                          onClick={() => {
                            if (!black) return;
                            resetPreview();
                            setSelectedPly(black.ply);
                            setHoveredMove(blackAnalysis);
                            playSoundForSan(black.san);
                          }}
                          className={`move-btn ${selectedPly === black?.ply ? "move-btn--active" : ""}`}
                        >
                        <div className="move-san">{black?.san || ""}</div>
                        {blackAnalysis?.label ? (
                          <span className={getMoveBadgeClass(blackAnalysis.label)}>
                            {getMoveSymbol(blackAnalysis.label)}
                          </span>
                        ) : null}
                      </button>
                    </React.Fragment>
                    );
                  })}
                </div>
              </div>

              <div className="analysis-card">
                {currentMove ? (
                  <>
                    <div className="analysis-top">
                      <div>
                        <div className="analysis-label">Selected move</div>
                        <div className="analysis-title">{currentMove.side === "w" ? "White" : "Black"} played {currentMove.san}</div>
                      </div>
                      <div className={getMoveBadgeClass(currentAnalysis?.label)}>{currentAnalysis?.label || "Not analyzed"}</div>
                    </div>

                    <div className="stat-grid">
                      <div className="stat-box">
                        <span>Best move:</span>{" "}
                        {currentAnalysis?.bestMove
                          ? uciLineToSanLine(currentAnalysis.fenBefore, currentAnalysis.bestMove, 1)
                          : "—"}
                      </div>
                      <div className="stat-box"><span>Best eval:</span> {formatEval(currentAnalysis?.bestEval)}</div>
                      <div className="stat-box"><span>Played eval:</span> {formatEval(currentAnalysis?.playedEval)}</div>
                      <div className="stat-box"><span>Centipawn loss:</span> {currentAnalysis ? Math.round(currentAnalysis.loss) : "—"}</div>
                    </div>


                      {currentAnalysis && currentAnalysis.label !== "Good" ? (
                        <>
                          <div
                            className="pv-box"
                            onClick={() =>
                              playLinePreview(currentAnalysis.fenBefore, currentAnalysis.bestLine)
                            }
                            style={{ cursor: "pointer" }}
                          >
                            <span>Best continuation:</span>{" "}
                            {uciLineToSanLine(currentAnalysis.fenBefore, currentAnalysis.bestLine, 8)}
                          </div>

                          <div
                            className="pv-box"
                            onClick={() =>
                              playLinePreview(currentMove?.fenBefore, currentAnalysis.playedLine)
                            }
                            style={{ cursor: "pointer" }}
                          >
                            <span>After your move:</span>{" "}
                            {uciLineToSanLine(currentMove?.fenBefore, currentAnalysis.playedLine, 8)}
                          </div>
                        </>
                      ) : null}
                    <div className="coach-box">{currentAnalysis?.explanation || "Run the analysis to generate a coach explanation for this move."}</div>
                  
                  </>
                ) : (
                  <div className="empty-note">Select a move to see evaluation, best line, and explanation.</div>
                )}
              </div>
          

              </>
            )}

            {rightTab === "summary" && (
              <>
                <div className="analysis-card">
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
