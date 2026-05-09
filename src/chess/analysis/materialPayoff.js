import { Chess } from "chess.js";
import { getPieceName, getPieceValue } from "../core/pieces";

function toChess(position) {
  if (!position) return null;

  if (typeof position === "string") {
    try {
      return new Chess(position);
    } catch {
      return null;
    }
  }

  return position;
}

export function getMaterialScore(position, perspective) {
  const chess = toChess(position);
  if (!chess || !perspective) return 0;

  let score = 0;

  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece || piece.type === "k") continue;

      const value = getPieceValue(piece.type);
      score += piece.color === perspective ? value : -value;
    }
  }

  return score;
}

export function getMaterialDelta({ fenBefore, fenAfter, perspective } = {}) {
  if (!fenBefore || !fenAfter || !perspective) return 0;

  return (
    getMaterialScore(fenAfter, perspective) -
    getMaterialScore(fenBefore, perspective)
  );
}

export function getCapturedMaterialPayoff(move, { minValue = 1 } = {}) {
  if (!move?.captured) return null;

  const piece = move.captured;
  const value = getPieceValue(piece);

  if (value < minValue) return null;

  const pieceName = getPieceName(piece) || "piece";

  return {
    type: "capturePayoff",
    piece,
    pieceName,
    value,
    square: move.to || null,
    text: `winning the ${pieceName}`,
  };
}

export function formatMaterialPayoff(payoff) {
  if (!payoff) return "";

  if (payoff.text) return payoff.text;

  const pieceName = payoff.pieceName || getPieceName(payoff.piece) || "piece";
  return `winning the ${pieceName}`;
}

export function attachMaterialPayoff(signal, payoff) {
  if (!signal || !payoff) return signal;

  return {
    ...signal,
    tags: {
      ...(signal.tags || {}),
      materialPayoff: payoff,
    },
  };
}


function sideName(color) {
  return color === "w" ? "White" : "Black";
}

function cloneMove(chess, move) {
  if (!chess || !move?.from || !move?.to) return null;

  return chess.move({
    from: move.from,
    to: move.to,
    promotion: move.promotion || undefined,
  });
}

export function getRecapturePunishment({
  chessAfterReply,
  tacticalReply,
  minRecapturingValue = 5,
  minTacticalCaptureValue = 3,
} = {}) {
  if (!chessAfterReply || !tacticalReply?.to || !tacticalReply?.color) return null;

  // Keep this conservative. We only explain recapture punishment when the
  // tactical reply itself already wins meaningful material. Otherwise the
  // line can become speculative, e.g. a quiet pawn move that could later be
  // captured by a queen.
  const tacticalCapturedValue = getPieceValue(tacticalReply.captured);
  if (tacticalCapturedValue < minTacticalCaptureValue) return null;

  const replySquare = tacticalReply.to;
  const tacticalSide = tacticalReply.color;
  const opponentSide = tacticalSide === "w" ? "b" : "w";
  const tacticalPiece = chessAfterReply.get(replySquare);

  if (!tacticalPiece || tacticalPiece.color !== tacticalSide) return null;

  const opponentRecaptures = chessAfterReply
    .moves({ verbose: true })
    .filter(
      (move) =>
        move.color === opponentSide &&
        move.to === replySquare &&
        Boolean(move.captured)
    );

  for (const recapture of opponentRecaptures) {
    const recapturingPiece = chessAfterReply.get(recapture.from);
    const recapturingValue = getPieceValue(recapturingPiece);

    if (!recapturingPiece || recapturingValue < minRecapturingValue) continue;

    const afterRecapture = new Chess(chessAfterReply.fen());
    const playedRecapture = cloneMove(afterRecapture, recapture);

    if (!playedRecapture) continue;

    const punishment = afterRecapture
      .moves({ verbose: true })
      .find(
        (move) =>
          move.color === tacticalSide &&
          move.to === playedRecapture.to &&
          move.captured === recapturingPiece.type
      );

    if (!punishment) continue;

    return {
      type: "recapturePunishment",
      recaptureSan: playedRecapture.san,
      recaptureSide: sideName(playedRecapture.color),
      punishSan: punishment.san,
      punishingSide: sideName(punishment.color),
      square: playedRecapture.to,
      recapturedPiece: recapturingPiece.type,
      recapturedPieceName: getPieceName(recapturingPiece),
      recapturedValue: recapturingValue,
      tacticalPiece: tacticalPiece.type,
      tacticalPieceName: getPieceName(tacticalPiece),
    };
  }

  return null;
}

export function formatRecapturePunishment(punishment) {
  if (!punishment?.recaptureSan || !punishment?.punishSan) return "";

  const pieceName = punishment.recapturedPieceName || "piece";
  return `If ${punishment.recaptureSide} recaptures with ${punishment.recaptureSan}, ${punishment.punishingSide} has ${punishment.punishSan}, winning the ${pieceName}.`;
}
