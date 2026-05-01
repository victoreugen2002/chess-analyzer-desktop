import { Chess } from "chess.js";

import {
  evaluateMaterial,
  evaluateKingShield,
  getAttackedSquaresByPiece,
  getPieceNameFromSAN,
} from "../utils";
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

  if (isMate) return "It ends the game immediately.";

  const isAnyRecapture = isCurrentMoveRecapture({ san, previousSan });

  if (label === "Good") {
    if (isCapture && isCheck) {
      reasons.push(
        evalChange != null && evalChange < 0.2
          ? "It captures with check and keeps the advantage."
          : "It captures material while giving check and forcing a response."
      );
    } else if (isCheck) {
      reasons.push("It gives check and keeps the initiative.");
    } else if (isCapture && !isAnyRecapture) {
      const gainText = getMaterialGainText({ fenBefore, fenAfter, side });

      if (gainText) reasons.push(`It ${gainText}.`);
    } else if (isCastle) {
      reasons.push("It improves king safety and helps bring the rooks into play.");
    } else if (isPromotion) {
      reasons.push("It gains decisive material by promoting the pawn.");
    } else if (!isKingMove || !isLosingPositionForSide(side, evalBefore)) {
      const undefendedTargetText = getUndefendedTargetText({
        fenBefore,
        side,
        san,
      });

      const moreValuableTargetText = getMoreValuableTargetText({
        fenBefore,
        side,
        san,
      });

      if (undefendedTargetText) reasons.push(undefendedTargetText);
      else if (moreValuableTargetText) reasons.push(moreValuableTargetText);
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

  if (recaptureText) return recaptureText;

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

    const opponentSide = side === "w" ? "b" : "w";
    const opponentKingShieldBefore = evaluateKingShield(fenBefore, opponentSide);
    const opponentKingShieldAfter = evaluateKingShield(fenAfter, opponentSide);

    const lostPieceText = getLostPieceText({ fenBefore, fenAfter, side, san });

    if (lostPieceText) {
      reasons.push(`It ${lostPieceText}.`);
    } else if (materialDrop >= 1 && !isAnyRecapture) {
      reasons.push("It gives up material for too little compensation.");
    }

    if (!isCapture && materialDrop < 1 && cpLoss >= 800) {
      reasons.push("It allows a decisive attack with a winning advantage.");
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
    if (label === "Mistake") {
      reasons.push("It gives the opponent a strong initiative.");
    } else if (label === "Inaccuracy") {
      reasons.push("It gives the opponent a more comfortable position.");
    } else if (cpLoss >= 250) {
      reasons.push("This move creates serious problems and gives the opponent a clear advantage.");
    }
  }

  return reasons.join(" ");
}

function getMaterialGainText({ fenBefore, fenAfter, side }) {
  if (!fenBefore || !fenAfter) return "";

  const before = evaluateMaterial(fenBefore);
  const after = evaluateMaterial(fenAfter);

  const player = side === "w" ? "white" : "black";
  const opponent = side === "w" ? "black" : "white";

  const gain =
    after[player] -
    after[opponent] -
    (before[player] - before[opponent]);

  if (gain >= 8.5) return "wins the queen";
  if (gain >= 4.5) return "wins a rook";

  return "";
}

function getLostPieceText({ fenBefore, fenAfter, side, san }) {
  if (!fenBefore || !fenAfter || !side) return "";

  const before = getPieceCountsFromFen(fenBefore);
  const after = getPieceCountsFromFen(fenAfter);
  const mover = side === "w" ? "white" : "black";
  const isPromotion = san?.includes("=");

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
  if (!isPromotion && diff.p > 0) return "loses a pawn";

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
  const previousTarget = previousSan
    .split("x")[1]
    ?.replace(/[+#]/g, "")
    .slice(-2);

  return Boolean(
    currentTarget &&
      previousTarget &&
      currentTarget === previousTarget
  );
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

function getPieceCountsFromFen(fen) {
  const board = fen.split(" ")[0];

  const counts = {
    white: { p: 0, n: 0, b: 0, r: 0, q: 0 },
    black: { p: 0, n: 0, b: 0, r: 0, q: 0 },
  };

  for (const ch of board) {
    if (ch === "/" || /\d/.test(ch)) continue;

    const color = ch === ch.toUpperCase() ? "white" : "black";
    const piece = ch.toLowerCase();

    if (counts[color][piece] != null) {
      counts[color][piece] += 1;
    }
  }

  return counts;
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

    const enemyColor = side === "w" ? "b" : "w";
    const attackedSquares = getAttackedSquaresByPiece(chess, result.to);
    const priority = { q: 5, r: 4, b: 3, n: 3, p: 1, k: 0 };

    let bestTarget = null;

    for (const sq of attackedSquares) {
      const target = chess.get(sq);

      if (!target || target.color !== enemyColor) continue;
      if (isSquareDefended(chess, sq, enemyColor)) continue;

      if (!bestTarget || priority[target.type] > priority[bestTarget.piece.type]) {
        bestTarget = { square: sq, piece: target };
      }
    }

    if (!bestTarget) return "";

    if (movedPiece.type === "q" && bestTarget.piece.type === "q") {
      return `It challenges the queen on ${bestTarget.square} and offers a queen trade.`;
    }

    return `It attacks the ${getPieceLabel(bestTarget.piece)} on ${bestTarget.square}.`;
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
