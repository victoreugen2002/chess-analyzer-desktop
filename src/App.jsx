import React, { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { fenToBoardRows, evaluateMaterial, evaluateKingShield, moveToHuman, uciLineToSan, uciLineToSanLine, uciMoveToSan} from "./chess/utils";
import { formatEval, getLabel, getAdvantageSide, explainMove, getOpeningInfo} from "./chess/explanations";

import { generateGameTitle, generateGameSummary, generateNarrativeSummary, estimatePlayerRating, calculateAccuracy } from "./chess/gameSummary";
import Board from "./components/Board";
import "./app.css";
import moveSound from "./assets/sounds/move.mp3";
import captureSound from "./assets/sounds/capture.mp3";


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

function sanToSpeech(san) {
  if (!san) return "";

  const pieceMap = {
    K: "King",
    Q: "Queen",
    R: "Rook",
    B: "Bishop",
    N: "Knight",
  };

  let text = san;

  // detect piece
  let piece = "Pawn";
  if (pieceMap[san[0]]) {
    piece = pieceMap[san[0]];
    text = san.slice(1);
  }

  // capture
  const isCapture = san.includes("x");

  // check / mate
  const isCheck = san.includes("+");
  const isMate = san.includes("#");

  // remove symbols
  text = text.replace("x", "").replace("+", "").replace("#", "");

  let result = `${piece} to ${text}`;

  if (isCapture) {
    result = `${piece} captures on ${text}`;
  }

  if (isMate) {
    result += " checkmate";
  } else if (isCheck) {
    result += " check";
  }

  return result;
}


function getMoveSymbol(label) {
  if (label === "Blunder") return "??";
  if (label === "Mistake") return "?";
  if (label === "Inaccuracy") return "?!";
  return "";
}
function getMoveBadgeClass(label) {
  if (label === "Blunder") return "badge badge--blunder";
  if (label === "Mistake") return "badge badge--mistake";
  if (label === "Inaccuracy") return "badge badge--inaccuracy";
  return "";
}

function getProgressWidth(cp) {
  if (cp == null || Number.isNaN(cp)) return 50;
  const normalized = Math.max(-600, Math.min(600, cp));
  return 50 + normalized / 12;
}



function getHeaders(chess) {
  if (typeof chess.getHeaders === "function") return chess.getHeaders();
  if (typeof chess.header === "function") return chess.header();
  return {};
}

function loadPgnStrict(chess, pgn) {
  const result = chess.loadPgn(pgn);
  if (result === false) throw new Error("Invalid PGN");
}

function buildMoveObjectsFromPgn(pgn) {
  const chess = new Chess();
  loadPgnStrict(chess, pgn);
  const verboseMoves = chess.history({ verbose: true });
  const replay = new Chess();

  const moves = verboseMoves.map((move, index) => {
    const fenBefore = replay.fen();
    const side = replay.turn();
    replay.move(move);
    const fenAfter = replay.fen();

    return {
      id: index,
      ply: index + 1,
      fullmove: Math.ceil((index + 1) / 2),
      side,
      san: move.san,
      lan: `${move.from}${move.to}${move.promotion || ""}`,
      fenBefore,
      fenAfter,
    };
  });

  const headers = getHeaders(chess);

  return {
    headers,
    result: headers.Result || "*",
    moves,
    initialFen: new Chess().fen(),
  };
}


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

function getBoardPixelSize(viewportWidth) {
  const vh = window.innerHeight;

  if (!viewportWidth) return 520;

  return Math.min(
    viewportWidth - 80,   // limitează pe lățime
    vh - 430              // limitează pe înălțime
  );
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

  const whiteRating = estimatePlayerRating(analysis, gameData.result, "w");
  const blackRating = estimatePlayerRating(analysis, gameData.result, "b");

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



      const results = raw.map((item, index, arr) => {
        const bestMove = item.bestMove ?? null;
        const safeLoss = Number.isFinite(item.loss) ? item.loss : null;

        const label = getLabel(
          safeLoss,
          item.bestEval,
          item.bestEval,
          item.playedEval
        );

        const previousSan = index > 0 ? arr[index - 1]?.san ?? null : null;

        return {
          ply: item.ply,
          side: item.side,
          san: item.san,
          fenBefore: item.fenBefore,
          fenAfter: item.fenAfter,
          bestMove,
          bestLine: item.bestLine ?? item.pv ?? null,
          pv: item.pv ?? null,
          playedLine: item.playedLine ?? null,
          bestEval: item.bestEval ?? null,
          playedEval: item.playedEval ?? null,
          loss: safeLoss,
          label,

          explanation: explainMove({
            label,
            loss: safeLoss,
            san: item.san,
            bestMove,
            beforeEval: item.bestEval ?? null,
            afterEval: item.playedEval ?? null,
            side: item.side,
            fenBefore: item.fenBefore,
            fenAfter: item.fenAfter,
            bestLineText: item.bestLine ?? item.pv ?? null,
            playedLineText: item.playedLine ?? null,
            previousSan,
            moveIndex: index,
            moves: gameData.moves,
          }),
        };
      });
      
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

  return (
    <div className="app-bg">
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

            <Board fen={currentFen} size={boardSize} />

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
     

          <section className="panel">
            <div className="panel-head panel-head--row">
              <div>
                <h2 className="panel-title">Move Review</h2>
              </div>
              <div className="waiting-pill">{analysis.length ? "Analyzed" : "Waiting"}</div>
            </div>
            {opening && (
              <div className="coach-box" style={{ marginTop: "8px" }}>
                <strong>{opening.name}</strong>
                <br />

                {opening.description.split("\n").map((line, i) => {
                  if (line.startsWith("Plan:")) {
                    return (
                      <div key={i}>
                        <strong>Plan:</strong> {line.replace("Plan: ", "")}
                      </div>
                    );
                  }

                  return <div key={i}>{line}</div>;
                })}
              </div>
            )}
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
                      
                      onClick={() => {
                        if (!white) return;
                        resetPreview();
                        setSelectedPly(white.ply);
                        playSoundForSan(white.san);
                      }}
                      className={`move-btn ${selectedPly === white?.ply ? "move-btn--active" : ""}`}
                    >
                      <div className="move-san">{white?.san || ""}</div>
                      <div className="move-meta">
                        <span>{whiteAnalysis?.label || "Not analyzed"}</span>
                        {whiteAnalysis?.label ? (
                          <span className={getMoveBadgeClass(whiteAnalysis.label)}>
                            {getMoveSymbol(whiteAnalysis.label)}
                          </span>
                        ) : null}
                      </div>
                    </button>

                    <button
                      
                      onClick={() => {
                        if (!black) return;
                        resetPreview();
                        setSelectedPly(black.ply);
                        playSoundForSan(black.san);
                      }}
                      className={`move-btn ${selectedPly === black?.ply ? "move-btn--active" : ""}`}
                    >
                      <div className="move-san">{black?.san || ""}</div>
                      <div className="move-meta">
                        <span>{blackAnalysis?.label || "Not analyzed"}</span>
                        {blackAnalysis?.label ? (
                          <span className={getMoveBadgeClass(blackAnalysis.label)}>
                            {getMoveSymbol(blackAnalysis.label)}
                          </span>
                        ) : null}
                      </div>
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

                  <div className="pv-box">
                    <span>Principal variation:</span>{" "}
                    {currentAnalysis?.pv
                      ? uciLineToSanLine(currentAnalysis.fenBefore, currentAnalysis.pv, 12)
                      : "—"}
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
            <div className="analysis-card" style={{ marginTop: "20px" }}>
              <div className="analysis-label">Game Title</div>
              <div className="coach-box" style={{ fontWeight: "600" }}>
                {gameTitle || "Run analysis to generate title."}
              </div>
            </div>
            <div className="analysis-card" style={{ marginTop: "20px" }}>
              <div className="analysis-label">Game Summary</div>
              <div className="coach-box">
                {summaryText || "Run analysis to see summary."}
              </div>


            </div>

            <div className="analysis-card" style={{ marginTop: "20px" }}>
              <div className="analysis-label">Game Story</div>
              <div className="coach-box">
                {narrativeText || "Run analysis to see the story of the game."}
              </div>


            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
