import { Chess } from "chess.js";
import { getPieceName, getPieceValue } from "../core/pieces";
import { buildLegalContinuation } from "./engineLine";

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


const MATERIAL_PIECES = ["q", "r", "b", "n", "p"];

const NUMBER_WORDS = {
  1: "one",
  2: "two",
  3: "three",
  4: "four",
  5: "five",
  6: "six",
  7: "seven",
  8: "eight",
};

function emptyPieceCounts() {
  return MATERIAL_PIECES.reduce((counts, piece) => {
    counts[piece] = 0;
    return counts;
  }, {});
}

export function getMaterialCounts(position, color) {
  const chess = toChess(position);
  const counts = emptyPieceCounts();

  if (!chess || !color) return counts;

  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece || piece.color !== color || piece.type === "k") continue;
      counts[piece.type] = (counts[piece.type] || 0) + 1;
    }
  }

  return counts;
}

function getPositiveCountDiff(before = {}, after = {}) {
  return MATERIAL_PIECES.reduce((diff, piece) => {
    diff[piece] = Math.max(0, (before[piece] || 0) - (after[piece] || 0));
    return diff;
  }, {});
}

function getCountsValue(counts = {}) {
  return MATERIAL_PIECES.reduce(
    (sum, piece) => sum + (counts[piece] || 0) * getPieceValue(piece),
    0
  );
}

function getCountsTotal(counts = {}) {
  return MATERIAL_PIECES.reduce((sum, piece) => sum + (counts[piece] || 0), 0);
}


function scoresAreEqual(a, b, epsilon = 0.01) {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) <= epsilon;
}

function getContinuationScoreTimeline({ continuation = [], startScore = 0, perspective } = {}) {
  if (!perspective) return [];

  return continuation.map((move, index) => {
    const score = getMaterialScore(move.fenAfter, perspective);
    const delta = score - startScore;

    return {
      index,
      move,
      score,
      delta,
      loss: Math.max(0, -delta),
    };
  });
}

function playVerboseMoveOnClone(fen, move) {
  if (!fen || !move?.from || !move?.to) return null;

  try {
    const chess = new Chess(fen);
    const playedMove = chess.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion || undefined,
    });

    if (!playedMove) return null;

    return { chess, playedMove };
  } catch {
    return null;
  }
}

function getImmediateNeutralizingReply({
  fen,
  perspective,
  startScore = 0,
  minLoss = 1,
  targetSquare,
} = {}) {
  const chess = toChess(fen);

  if (!chess || !perspective || !targetSquare) return null;

  // Only the side that lost material can immediately prove that the payoff is
  // temporary. If it is the winner's turn, the material gain is already stable
  // enough for the short tactical continuation.
  if (chess.turn() !== perspective) return null;

  const replies = chess
    .moves({ verbose: true })
    .filter((move) => move.to === targetSquare && Boolean(move.captured));

  for (const reply of replies) {
    const result = playVerboseMoveOnClone(fen, reply);
    if (!result) continue;

    const replyDelta = getMaterialScore(result.chess.fen(), perspective) - startScore;

    // If the losing side can immediately recover enough material, the payoff is
    // not stable. Example: ...hxg5 followed by ...Qxg5.
    if (replyDelta > -minLoss) {
      return {
        san: result.playedMove.san,
        delta: replyDelta,
        move: result.playedMove,
      };
    }
  }

  return null;
}

function isPayoffStableAtEntry({ entry, perspective, startScore = 0, minLoss = 1 } = {}) {
  if (!entry?.move?.fenAfter) return false;

  const neutralizingReply = getImmediateNeutralizingReply({
    fen: entry.move.fenAfter,
    perspective,
    startScore,
    minLoss,
    targetSquare: entry.move.to,
  });

  return !neutralizingReply;
}

function getRelevantContinuationCutoff({
  continuation = [],
  timeline = [],
  finalDelta = 0,
  perspective,
  startScore = 0,
  minLoss = 1,
} = {}) {
  if (!continuation.length || !timeline.length) return null;

  // Stop when the final net material result first appears, but only if the
  // losing side cannot immediately recapture and erase that material loss.
  // This keeps Qxd5 short, while avoiding temporary claims like hxg5 if ...Qxg5
  // simply wins the pawn back.
  for (const entry of timeline) {
    if (!scoresAreEqual(entry.delta, finalDelta)) continue;

    if (isPayoffStableAtEntry({ entry, perspective, startScore, minLoss })) {
      return entry.index + 1;
    }
  }

  return null;
}

function formatContinuationSans(moves = []) {
  return moves
    .map((move) => move?.san)
    .filter(Boolean)
    .join(" ");
}

function formatContinuationUci(moves = []) {
  return moves
    .map((move) => move?.lan || move?.token)
    .filter((token) => /^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(token))
    .join(" ");
}

function simplifyTradedCounts(captured = {}, sacrificed = {}) {
  const netCaptured = {};
  const netSacrificed = {};

  for (const piece of MATERIAL_PIECES) {
    const capturedCount = captured[piece] || 0;
    const sacrificedCount = sacrificed[piece] || 0;
    const tradedCount = Math.min(capturedCount, sacrificedCount);

    netCaptured[piece] = Math.max(0, capturedCount - tradedCount);
    netSacrificed[piece] = Math.max(0, sacrificedCount - tradedCount);
  }

  return { netCaptured, netSacrificed };
}

function pluralizePiece(pieceName, count) {
  if (count === 1) return pieceName;
  return `${pieceName}s`;
}

function formatPieceCount(piece, count) {
  if (!piece || !count) return "";

  const name = getPieceName(piece) || "piece";

  if (count === 1) {
    const article = /^[aeiou]/i.test(name) ? "an" : "a";
    return `${article} ${name}`;
  }

  const numberText = NUMBER_WORDS[count] || String(count);
  return `${numberText} ${pluralizePiece(name, count)}`;
}

function formatPieceGroup(counts = {}) {
  const parts = MATERIAL_PIECES
    .map((piece) => formatPieceCount(piece, counts[piece] || 0))
    .filter(Boolean);

  if (!parts.length) return "material";
  if (parts.length === 1) return parts[0];

  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function formatExactMaterialDescription({ captured = {}, sacrificed = {}, fallbackValue = 0 } = {}) {
  const capturedTotal = getCountsTotal(captured);
  const sacrificedTotal = getCountsTotal(sacrificed);

  if (!capturedTotal) return formatNetMaterial(fallbackValue);

  const capturedText = formatPieceGroup(captured);

  if (!sacrificedTotal) return capturedText;

  const sacrificedText = formatPieceGroup(sacrificed);
  return `${capturedText} for ${sacrificedText}`;
}

export function getMaterialBreakdown({ fenBefore, fenAfter, winner } = {}) {
  if (!fenBefore || !fenAfter || !winner) return null;

  const loser = winner === "w" ? "b" : "w";
  const winnerBefore = getMaterialCounts(fenBefore, winner);
  const winnerAfter = getMaterialCounts(fenAfter, winner);
  const loserBefore = getMaterialCounts(fenBefore, loser);
  const loserAfter = getMaterialCounts(fenAfter, loser);

  const captured = getPositiveCountDiff(loserBefore, loserAfter);
  const sacrificed = getPositiveCountDiff(winnerBefore, winnerAfter);
  const capturedValue = getCountsValue(captured);
  const sacrificedValue = getCountsValue(sacrificed);
  const { netCaptured, netSacrificed } = simplifyTradedCounts(
    captured,
    sacrificed
  );
  const netValue = getCountsValue(netCaptured) - getCountsValue(netSacrificed);

  return {
    winner,
    loser,
    captured,
    sacrificed,
    netCaptured,
    netSacrificed,
    capturedValue,
    sacrificedValue,
    netValue,
    description: formatExactMaterialDescription({
      captured: netCaptured,
      sacrificed: netSacrificed,
      fallbackValue: netValue,
    }),
  };
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


export function formatNetMaterial(value) {
  const amount = Math.abs(Number(value) || 0);

  if (amount < 1) return "material";
  if (Math.abs(amount - 1) < 0.25) return "a pawn";
  if (Math.abs(amount - 2) < 0.25) return "the exchange";
  if (Math.abs(amount - 3) < 0.25) return "a piece";
  if (Math.abs(amount - 4) < 0.25) return "a piece and a pawn";
  if (Math.abs(amount - 5) < 0.25) return "a rook";
  if (amount >= 9) return "a queen or decisive material";

  return `${Math.round(amount)} points of material`;
}

export function getContinuationMaterialLoss({
  fen,
  line,
  perspective,
  maxPlies = 10,
  minLoss = 1,
} = {}) {
  if (!fen || !line || !perspective) return null;

  const continuation = buildLegalContinuation({
    fen,
    line,
    maxPlies,
  });

  if (!continuation.length) return null;

  const startScore = getMaterialScore(fen, perspective);
  const finalMove = continuation[continuation.length - 1];
  const endScore = getMaterialScore(finalMove.fenAfter, perspective);
  const delta = endScore - startScore;

  if (delta > -minLoss) return null;

  const loss = Math.abs(delta);
  const winner = perspective === "w" ? "b" : "w";
  const winnerSide = perspective === "w" ? "Black" : "White";
  const loserSide = perspective === "w" ? "White" : "Black";

  const timeline = getContinuationScoreTimeline({
    continuation,
    startScore,
    perspective,
  });
  const relevantPlyCount = getRelevantContinuationCutoff({
    continuation,
    timeline,
    finalDelta: delta,
    perspective,
    startScore,
    minLoss,
  });

  if (!relevantPlyCount) return null;

  const relevantContinuation = continuation.slice(0, relevantPlyCount);
  const relevantFinalMove =
    relevantContinuation[relevantContinuation.length - 1] || finalMove;

  const materialBreakdown = getMaterialBreakdown({
    fenBefore: fen,
    fenAfter: relevantFinalMove.fenAfter,
    winner,
  });

  return {
    type: "continuationMaterialLossPayoff",
    value: loss,
    description: materialBreakdown?.description || formatNetMaterial(loss),
    materialBreakdown,
    winnerSide,
    loserSide,
    maxPlies,
    plyCount: continuation.length,
    relevantPlyCount,
    firstMoveSan: continuation[0]?.san || null,
    lastMoveSan: finalMove?.san || null,
    relevantLastMoveSan: relevantFinalMove?.san || null,
    lineSans: formatContinuationSans(continuation),
    lineUci: formatContinuationUci(continuation),
    relevantLineSans: formatContinuationSans(relevantContinuation),
    relevantLineUci: formatContinuationUci(relevantContinuation),
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
