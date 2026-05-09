import { useState, useMemo } from "react";
import { Chess } from "chess.js";
import {
  buildMoveObjectsFromFen,
  buildMoveObjectsFromPgn,
} from "../pgn/pgnParser";

function setFenHeaders(chess, fen) {
  if (typeof chess.header === "function") {
    chess.header("SetUp", "1", "FEN", fen);
  }

  if (typeof chess.setHeader === "function") {
    chess.setHeader("SetUp", "1");
    chess.setHeader("FEN", fen);
  }
}

function syncChessToGameData(chess, built) {
  try {
    chess.load(built.initialFen);
  } catch (error) {
    console.warn("Could not load initial FEN, resetting board:", error);
    chess.reset();
  }

  if (built.initialFen && built.initialFen !== new Chess().fen()) {
    setFenHeaders(chess, built.initialFen);
  }

  built.moves.forEach((m) => {
    chess.move(m.san, { sloppy: true });
  });
}

export function useChessGame(initialPgn) {
  const [chess] = useState(() => new Chess());

  const [pgn, setPgn] = useState(initialPgn);

  const [gameData, setGameData] = useState(() =>
    buildMoveObjectsFromPgn(initialPgn)
  );

  const [selectedPly, setSelectedPly] = useState(0);
  const [selectedSquare, setSelectedSquare] = useState(null);

  // 🎯 sync board fen
  const currentFen = useMemo(() => {
    if (selectedPly <= 0) return gameData.initialFen;
    return gameData.moves[selectedPly - 1]?.fenAfter || gameData.initialFen;
  }, [selectedPly, gameData]);

  function importPgn() {
    const built = buildMoveObjectsFromPgn(pgn);

    syncChessToGameData(chess, built);

    setGameData(built);
    setSelectedPly(0);
    setSelectedSquare(null);
  }

  function loadFenForTest(fen) {
    const built = buildMoveObjectsFromFen(fen);
    const normalizedFen = built.initialFen;

    syncChessToGameData(chess, built);

    setPgn(`[SetUp "1"]\n[FEN "${normalizedFen}"]\n\n*`);
    setGameData(built);
    setSelectedPly(0);
    setSelectedSquare(null);
  }

  function handleSquareClick(square) {
    const piece = chess.get(square);

    if (!selectedSquare) {
      if (piece && piece.color === chess.turn()) {
        setSelectedSquare(square);
      }
      return;
    }

    const move = chess.move({
      from: selectedSquare,
      to: square,
      promotion: "q",
    });

    if (!move) {
      setSelectedSquare(null);
      return;
    }

    setSelectedSquare(null);

    const newPgn = chess.pgn();
    const built = buildMoveObjectsFromPgn(newPgn);

    setPgn(newPgn);
    setGameData(built);
    setSelectedPly(chess.history().length);
  }

  function goNext() {
    setSelectedPly((p) =>
      Math.min(gameData.moves.length, p + 1)
    );
  }

  function goPrev() {
    setSelectedPly((p) => Math.max(0, p - 1));
  }

  function goStart() {
    setSelectedPly(0);
  }

  return {
    // state
    chess,
    pgn,
    setPgn,
    gameData,
    selectedPly,
    selectedSquare,
    currentFen,

    // actions
    setSelectedPly,
    handleSquareClick,
    importPgn,
    loadFenForTest,

    goNext,
    goPrev,
    goStart,
  };
}
