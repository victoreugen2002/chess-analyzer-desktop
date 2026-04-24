import { Chess } from "chess.js";
import { evaluateMaterial, evaluateKingShield, moveToHuman, uciLineToSan } from "./utils";

export function formatEval(cp) {
  if (cp == null || Number.isNaN(cp)) return "—";

  if (cp >= 99000) return "Mate for White";
  if (cp <= -99000) return "Mate for Black";

  return `${cp > 0 ? "+" : ""}${(cp / 100).toFixed(2)}`;
}

export function getPieceNameFromSAN(san) {
  if (!san) return "piece";

  const pieceMap = {
    N: "knight",
    B: "bishop",
    R: "rook",
    Q: "queen",
    K: "king",
  };

  const firstChar = san[0];
  if (pieceMap[firstChar]) return pieceMap[firstChar];

  return "pawn";
}

function getPieceValue(piece) {
  if (!piece) return 0;

  const values = {
    p: 1,
    n: 3,
    b: 3,
    r: 5,
    q: 9,
    k: 100,
  };

  return values[piece.type] || 0;
}

function getMaterialGainText({ fenBefore, fenAfter, side }) {
  if (!fenBefore || !fenAfter) return "";

  const before = evaluateMaterial(fenBefore);
  const after = evaluateMaterial(fenAfter);

  const opponent = side === "w" ? "black" : "white";
  const gain = before[opponent] - after[opponent];

  if (gain >= 8.5) return "wins the queen";
  if (gain >= 4.5) return "wins a rook";
  if (gain >= 2.5) return "wins a piece";
  if (gain >= 1) return "wins a pawn";

  return "";
}

export function getLabel(loss, beforeEval) {
  if (!Number.isFinite(loss)) return "Good";

  const absEval = Math.abs(beforeEval || 0);

  if (absEval > 400) {
    if (loss >= 500) return "Mistake";
    if (loss >= 200) return "Inaccuracy";
    return "Good";
  }

  if (loss >= 250) return "Blunder";
  if (loss >= 150) return "Mistake";
  if (loss >= 70) return "Inaccuracy";
  return "Good";
}

export function getAdvantageSide(evalCp) {
  if (!Number.isFinite(evalCp)) return "equal";
  if (evalCp > 80) return "white";
  if (evalCp < -80) return "black";
  return "equal";
}

function getPieceCountsFromFen(fen) {
  const board = fen.split(" ")[0];
  const counts = {
    white: { p: 0, n: 0, b: 0, r: 0, q: 0 },
    black: { p: 0, n: 0, b: 0, r: 0, q: 0 },
  };

  for (const ch of board) {
    if (ch === "/" || /\d/.test(ch)) continue;

    const isWhite = ch === ch.toUpperCase();
    const piece = ch.toLowerCase();

    if (!["p", "n", "b", "r", "q"].includes(piece)) continue;

    if (isWhite) counts.white[piece]++;
    else counts.black[piece]++;
  }

  return counts;
}

function getLostPieceText({ fenBefore, fenAfter, side }) {
  if (!fenBefore || !fenAfter || !side) return "";

  const before = getPieceCountsFromFen(fenBefore);
  const after = getPieceCountsFromFen(fenAfter);

  const mover = side === "w" ? "white" : "black";

  const diff = {
    p: before[mover].p - after[mover].p,
    n: before[mover].n - after[mover].n,
    b: before[mover].b - after[mover].b,
    r: before[mover].r - after[mover].r,
    q: before[mover].q - after[mover].q,
  };

  if (diff.q > 0) return "loses the queen";
  if (diff.r > 0) return "loses a rook";
  if (diff.n > 0) return "loses a knight";
  if (diff.b > 0) return "loses a bishop";
  if (diff.p > 0) return "loses a pawn";

  return "";
}

function getRecaptureInfo({ san, playedLineText }) {
  if (!san || !playedLineText || !san.includes("x")) return null;

  const targetSquare = san.split("x")[1]?.replace(/[+#]/g, "").slice(-2);
  if (!targetSquare) return null;

  const moves = playedLineText.trim().split(/\s+/).slice(1, 4);

  for (const move of moves) {
    const cleanMove = move.replace(/[+#]/g, "");
    if (cleanMove.includes("x") && cleanMove.endsWith(targetSquare)) {
      const pieceName = getPieceNameFromSAN(san);
      return {
        pieceName,
        text: `The ${pieceName} is recaptured, so the tactic does not work.`,
      };
    }
  }

  return null;
}

function detectRecapture({ san, playedLineText, loss = 0, label = "" }) {
  const cpLoss = Number(loss || 0);
  const recaptureInfo = getRecaptureInfo({ san, playedLineText });

  if (!recaptureInfo) return null;
  if (label === "Good" || cpLoss < 120) return null;

  return recaptureInfo.text;
}

function isCurrentMoveRecapture({ san, previousSan }) {
  if (!san || !previousSan) return false;
  if (!san.includes("x") || !previousSan.includes("x")) return false;

  const currentTarget = san.split("x")[1]?.replace(/[+#]/g, "").slice(-2);
  const previousTarget = previousSan.split("x")[1]?.replace(/[+#]/g, "").slice(-2);

  return !!(currentTarget && previousTarget && currentTarget === previousTarget);
}

function squareToCoords(square) {
  const file = square.charCodeAt(0) - 97;
  const rank = 8 - Number(square[1]);
  return { file, rank };
}

function coordsToSquare(file, rank) {
  return String.fromCharCode(97 + file) + (8 - rank);
}

function getAttackedSquaresByPiece(chess, square) {
  const piece = chess.get(square);
  if (!piece) return [];

  const { file, rank } = squareToCoords(square);
  const squares = [];

  const pushIfValid = (f, r) => {
    if (f >= 0 && f < 8 && r >= 0 && r < 8) {
      squares.push(coordsToSquare(f, r));
    }
  };

  if (piece.type === "n") {
    const jumps = [
      [1, 2], [2, 1], [2, -1], [1, -2],
      [-1, -2], [-2, -1], [-2, 1], [-1, 2],
    ];
    jumps.forEach(([df, dr]) => pushIfValid(file + df, rank + dr));
    return squares;
  }

  if (piece.type === "k") {
    const steps = [
      [1, 0], [1, 1], [0, 1], [-1, 1],
      [-1, 0], [-1, -1], [0, -1], [1, -1],
    ];
    steps.forEach(([df, dr]) => pushIfValid(file + df, rank + dr));
    return squares;
  }

  if (piece.type === "p") {
    const dir = piece.color === "w" ? -1 : 1;
    pushIfValid(file - 1, rank + dir);
    pushIfValid(file + 1, rank + dir);
    return squares;
  }

  const directions = [];

  if (piece.type === "b" || piece.type === "q") {
    directions.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
  }

  if (piece.type === "r" || piece.type === "q") {
    directions.push([1, 0], [-1, 0], [0, 1], [0, -1]);
  }

  for (const [df, dr] of directions) {
    let f = file + df;
    let r = rank + dr;

    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const sq = coordsToSquare(f, r);
      squares.push(sq);

      if (chess.get(sq)) break;

      f += df;
      r += dr;
    }
  }

  return squares;
}

function getPieceLabel(piece) {
  if (!piece) return "";
  const names = {
    p: "pawn",
    n: "knight",
    b: "bishop",
    r: "rook",
    q: "queen",
    k: "king",
  };
  return names[piece.type] || "piece";
}

function isSquareDefended(chess, square, defenderColor) {
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const ranks = ["1", "2", "3", "4", "5", "6", "7", "8"];

  for (const file of files) {
    for (const rank of ranks) {
      const from = `${file}${rank}`;
      const piece = chess.get(from);
      if (!piece || piece.color !== defenderColor) continue;

      const attackedSquares = getAttackedSquaresByPiece(chess, from);
      if (attackedSquares.includes(square)) {
        return true;
      }
    }
  }

  return false;
}

function getUndefendedTargetText({ fenBefore, side, san }) {
  if (!fenBefore || !san) return "";

  try {
    const chess = new Chess(fenBefore);
    const result = chess.move(san, { sloppy: true });
    if (!result?.to) return "";

    const movedPiece = chess.get(result.to);
    if (!movedPiece) return "";

    const moverColor = side;
    const enemyColor = moverColor === "w" ? "b" : "w";
    const attackedSquares = getAttackedSquaresByPiece(chess, result.to);

    const priority = { q: 5, r: 4, b: 3, n: 3, p: 1, k: 0 };
    let bestTarget = null;

    for (const sq of attackedSquares) {
      const target = chess.get(sq);
      if (!target || target.color !== enemyColor) continue;

      const defended = isSquareDefended(chess, sq, enemyColor);
      if (defended) continue;

      if (!bestTarget || priority[target.type] > priority[bestTarget.piece.type]) {
        bestTarget = { square: sq, piece: target };
      }
    }

    if (!bestTarget) return "";

    if (movedPiece.type === "q" && bestTarget.piece.type === "q") {
      return `It challenges the queen on ${bestTarget.square} and offers a queen trade.`;
    }

    const targetLabel = getPieceLabel(bestTarget.piece);
    return `It creates a threat by attacking the undefended ${targetLabel} on ${bestTarget.square}.`;
  } catch {
    return "";
  }
}

function getMoreValuableTargetText({ fenBefore, side, san }) {
  if (!fenBefore || !san) return "";

  try {
    const chess = new Chess(fenBefore);
    const result = chess.move(san, { sloppy: true });
    if (!result?.to) return "";

    const movedPiece = chess.get(result.to);
    if (!movedPiece) return "";

    const moverValue = getPieceValue(movedPiece);
    const enemyColor = side === "w" ? "b" : "w";
    const attackedSquares = getAttackedSquaresByPiece(chess, result.to);

    const priority = { q: 5, r: 4, b: 3, n: 2, p: 1, k: 0 };
    let bestTarget = null;

    for (const sq of attackedSquares) {
      const target = chess.get(sq);
      if (!target || target.color !== enemyColor) continue;

      const targetValue = getPieceValue(target);
      if (targetValue <= moverValue) continue;

      if (!bestTarget || priority[target.type] > priority[bestTarget.piece.type]) {
        bestTarget = { square: sq, piece: target };
      }
    }

    if (!bestTarget) return "";

    if (movedPiece.type === "q" && bestTarget.piece.type === "q") {
      return `It challenges the queen on ${bestTarget.square} and offers a queen trade.`;
    }

    const targetLabel = getPieceLabel(bestTarget.piece);

    if (movedPiece.type === "n" || movedPiece.type === "b") {
      return `It develops a piece and attacks the ${targetLabel} on ${bestTarget.square}.`;
    }

    return `It attacks the ${targetLabel} on ${bestTarget.square}.`;
  } catch {
    return "";
  }
}

function isLosingPositionForSide(side, evalCp) {
  if (!Number.isFinite(evalCp)) return false;
  if (side === "w") return evalCp <= -400;
  if (side === "b") return evalCp >= 400;
  return false;
}

export function buildWhyText({
  fenBefore,
  fenAfter,
  side,
  san,
  loss,
  beforeEval,
  afterEval,
  playedLineText,
  label,
  previousSan,
}) {
  const isCapture = san?.includes("x");
  const isCheck = san?.includes("+");
  const isCastle = san === "O-O" || san === "O-O-O";
  const isPromotion = san?.includes("=");
  const isMate = san?.includes("#");
  const isKingMove = /^K/.test(san || "");

  const evalBefore = Number(beforeEval || 0);
  const evalAfter = Number(afterEval || 0);
  const cpLoss = Number(loss || 0);
  const wasReasonableBefore = Math.abs(evalBefore) < 250;
  const evalChange =
    Number.isFinite(evalBefore) && Number.isFinite(evalAfter)
      ? Math.abs(evalAfter - evalBefore)
      : null;

  const reasons = [];

  if (isMate) {
    return "It ends the game immediately.";
  }

  const recaptureInfo = getRecaptureInfo({ san, playedLineText });
  const isCurrentRecapture = isCurrentMoveRecapture({ san, previousSan });
  const isAnyRecapture = isCurrentRecapture || !!recaptureInfo;

  if (label === "Good") {
    if (isCapture && isCheck) {
      if (evalChange != null && evalChange < 0.2) {
        reasons.push("It captures with check and keeps the advantage.");
      } else {
        reasons.push("It captures material while giving check and forcing a response.");
      }
    } else if (isCheck) {
      reasons.push("It gives check and keeps the initiative.");
    } else if (isCapture) {
      if (!isAnyRecapture) {
        const gainText = getMaterialGainText({ fenBefore, fenAfter, side });
        if (gainText) {
          reasons.push(`It ${gainText}.`);
        } else {
          reasons.push("It wins or exchanges material on favorable terms.");
        }
      }
    } else if (isCastle) {
      reasons.push("It improves king safety and helps bring the rooks into play.");
    } else if (isPromotion) {
      reasons.push("It gains decisive material by promoting the pawn.");
    } else if (!isKingMove || !isLosingPositionForSide(side, evalBefore)) {
      const undefendedTargetText = getUndefendedTargetText({ fenBefore, side, san });
      const moreValuableTargetText = getMoreValuableTargetText({ fenBefore, side, san });

      if (undefendedTargetText) {
        reasons.push(undefendedTargetText);
      } else if (moreValuableTargetText) {
        reasons.push(moreValuableTargetText);
      }
    }
  }

  if (isCapture && cpLoss >= 180 && wasReasonableBefore) {
    reasons.push("It fails tactically and loses material after the sequence.");
  }

  const recaptureText = detectRecapture({
    san,
    playedLineText,
    loss,
    label,
  });

  if (recaptureText) {
    reasons.push(recaptureText);
  }

  if (fenBefore && fenAfter) {
    const mover = side === "w" ? "white" : "black";

    const materialBefore = evaluateMaterial(fenBefore);
    const materialAfter = evaluateMaterial(fenAfter);

    const moverMaterialBefore =
      mover === "white" ? materialBefore.white : materialBefore.black;
    const moverMaterialAfter =
      mover === "white" ? materialAfter.white : materialAfter.black;

    const materialDrop = moverMaterialBefore - moverMaterialAfter;

    const kingShieldBefore = evaluateKingShield(fenBefore, side);
    const kingShieldAfter = evaluateKingShield(fenAfter, side);

    const opponentKingShieldBefore = evaluateKingShield(
      fenBefore,
      side === "w" ? "b" : "w"
    );
    const opponentKingShieldAfter = evaluateKingShield(
      fenAfter,
      side === "w" ? "b" : "w"
    );

    const lostPieceText = getLostPieceText({ fenBefore, fenAfter, side });

    if (lostPieceText) {
      reasons.push(`It ${lostPieceText}.`);
    } else if (materialDrop >= 1 && !isAnyRecapture) {
      reasons.push("It gives up material for too little compensation.");
    }

    if (!isCapture && materialDrop < 1 && cpLoss >= 800) {
      reasons.push("It allows a decisive attack that leads to checkmate.");
    } else if (!isCapture && materialDrop < 1 && cpLoss >= 220 && wasReasonableBefore) {
      reasons.push("It allows a tactical sequence that wins material for the opponent.");
    }

    if (kingShieldAfter < kingShieldBefore && cpLoss >= 90) {
      reasons.push("It weakens king safety and removes some of the pawn cover around the king.");
    }

    if (
      opponentKingShieldAfter > opponentKingShieldBefore &&
      !isCheck &&
      !isCastle &&
      cpLoss >= 100
    ) {
      reasons.push("It also makes the opponent's position easier to consolidate.");
    }
  }

  if (!reasons.length) {
    if (label === "Good" && !isAnyRecapture) {
      // 🔥 nu mai adăugăm nimic
    } else if (label === "Mistake") {
      reasons.push("It gives the opponent a strong initiative.");
    } else if (label === "Inaccuracy") {
      reasons.push("It gives the opponent a more comfortable position.");
    } else if (cpLoss >= 250) {
      reasons.push("This move creates serious problems and gives the opponent a clear advantage.");
    }
  }

  return reasons.join(" ");
}

export function explainMove({
  label,
  loss,
  san,
  bestMove,
  beforeEval,
  afterEval,
  side,
  fenBefore,
  fenAfter,
  bestLineText,
  playedLineText,
  previousSan,
}) {
  const sideText = side === "w" ? "White" : "Black";
  const isCapture = san?.includes("x");
  const isCheck = san?.includes("+");
  const isCastle = san === "O-O" || san === "O-O-O";
  const isPromotion = san?.includes("=");
  const isMate = san?.includes("#");
  const isQuiet = !isCapture && !isCheck && !isCastle && !isPromotion && !isMate;
  const isKingMove = /^K/.test(san || "");

  const quietFallbacks = [
    "This is a solid move.",
    "This is a reasonable move.",
    "This move keeps the position stable.",
    "This is a natural move.",
    "This move fits the position.",
    "This is a sensible choice.",
    "This move maintains the balance.",
    "This is a calm move.",
    "This move follows the position’s demands."
  ];

  let lastFallback = "";

  function getRandomFallback() {
    let choice;
    do {
      choice = quietFallbacks[Math.floor(Math.random() * quietFallbacks.length)];
    } while (choice === lastFallback);

    lastFallback = choice;
    return choice;
  }

  const cpLoss = Number(loss || 0);
  const numericBeforeEval =
    beforeEval != null && !Number.isNaN(Number(beforeEval)) ? Number(beforeEval) : null;
  const numericAfterEval =
    afterEval != null && !Number.isNaN(Number(afterEval)) ? Number(afterEval) : null;

  const evalChange =
    numericBeforeEval != null && numericAfterEval != null
      ? Math.abs(numericAfterEval - numericBeforeEval)
      : null;

  const opener = `${sideText} played ${san}.`;

  if (isMate) {
    return `${opener} This move delivers checkmate immediately.`;
  }

  const before = Number(beforeEval);
  const after = Number(afterEval);

  if (
    Number.isFinite(before) &&
    Number.isFinite(after) &&
    Math.abs(before) >= 99000 &&
    Math.abs(after) >= 99000
  ) {
    return `${opener} This move still leads to checkmate, but it misses a faster win.`;
  }

  let tone = "";

  if (label === "Good") {
    if (isCapture && isCheck) {
      tone =
        evalChange != null && evalChange < 0.2
          ? "This is a natural forcing move."
          : "This is a strong forcing move.";
    } else if (isCheck) {
      tone = "This is an active check.";
    } else if (isCapture) {
      const recaptureInfo = getRecaptureInfo({
        san,
        playedLineText: playedLineText
          ? uciLineToSan({ fen: fenBefore, uciLine: playedLineText, maxMoves: 8 })
          : "",
      });

      const isCurrentRecapture = isCurrentMoveRecapture({ san, previousSan });

      if (isCurrentRecapture || recaptureInfo) {
        tone = "This is a natural recapture.";
      } else {
        tone = "This is a sound capture.";
      }
    } else if (isCastle) {
      tone = "This is a useful castling move.";
    } else if (isPromotion) {
      tone = "This is a decisive promotion.";
    } else if (isQuiet) {
      if (isKingMove && isLosingPositionForSide(side, numericBeforeEval)) {
        tone = "This is a necessary defensive move.";
      } else if (/^[NB]/.test(san || "")) {
        tone = "This is a natural developing move.";
      } else {
        tone = getRandomFallback();
      }
    }
  } else if (label === "Blunder") {
    if (isCapture && isCheck) {
      tone = "This is a tactical blunder.";
    } else if (isCheck) {
      tone = "This check is a blunder.";
    } else if (isCapture) {
      tone = "This capture is a blunder.";
    } else if (isCastle) {
      tone = "This castling move is a blunder.";
    } else if (isPromotion) {
      tone = "This promotion is a blunder.";
    } else if (isQuiet) {
      tone = "This is a blunder.";
    }
  } else if (label === "Mistake") {
    if (isCapture && isCheck) {
      tone = "This forcing move is a mistake.";
    } else if (isCheck) {
      tone = "This check is a mistake and does not solve the position.";
    } else if (isCapture) {
      tone = "This capture turns out to be a mistake.";
    } else if (isCastle) {
      tone = "Castling is a natural idea, but it is not the best defense here.";
    } else if (isPromotion) {
      tone = "This promotion is a mistake.";
    } else if (isQuiet) {
      tone = "This move is a mistake.";
    }
  } else {
    if (isCapture && isCheck) {
      tone = "This forcing move is not the most precise.";
    } else if (isCheck) {
      tone = "The check looks active, but it does not create enough pressure.";
    } else if (isCapture) {
      tone = "This capture is reasonable, but it needed more calculation.";
    } else if (isCastle) {
      tone = "Castling is a natural idea, but not the most precise here.";
    } else if (isPromotion) {
      tone = "The promotion idea is ambitious, but inaccurate.";
    } else if (isQuiet) {
      tone = "This move is playable, but a little imprecise.";
    }
  }

  const bestLineTextSan = bestLineText
    ? uciLineToSan({ fen: fenBefore, uciLine: bestLineText, maxMoves: 8 })
    : "";

  const playedLineTextSan = playedLineText
    ? uciLineToSan({ fen: fenBefore, uciLine: playedLineText, maxMoves: 8 })
    : "";

  const whyText = buildWhyText({
    fenBefore,
    fenAfter,
    side,
    san,
    loss,
    beforeEval,
    afterEval,
    playedLineText: playedLineTextSan,
    label,
    previousSan,
  });

  const playedHuman = san;
  const bestHuman =
    bestMove && bestMove !== "—" ? moveToHuman(bestMove, fenBefore) : "";

  const normalizedPlayed = String(playedHuman || "").replace(/[+#?!]/g, "").trim();
  const normalizedBest = String(bestHuman || "").replace(/[+#?!]/g, "").trim();

  const shouldShowBestMove =
    label !== "Good" &&
    bestMove &&
    bestMove !== "—" &&
    bestHuman &&
    normalizedBest &&
    normalizedBest !== normalizedPlayed;

  const bestText = shouldShowBestMove
    ? ` A better move was ${bestHuman}.`
    : "";

  let lineText = "";
  if (bestLineTextSan && label !== "Good") {
    lineText += ` A stronger line was: ${bestLineTextSan}.`;
  }
  if (playedLineTextSan && cpLoss >= 120) {
    lineText += ` After the move: ${playedLineTextSan}.`;
  }

  const middleParts = [tone, whyText].filter(Boolean).join(" ");

  return `${opener} ${middleParts}${bestText}${lineText}`
    .replace(/\s+/g, " ")
    .trim();
}