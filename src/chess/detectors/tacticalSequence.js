import { Chess } from "chess.js";
import { getLineTokens, playMoveToken } from "../analysis/engineLine";
import { getContinuationTactic, getMotifText } from "../analysis/continuationTactics";

function getMoveToken(moveData) {
  return moveData?.lan || moveData?.uci || moveData?.san || null;
}

function isRecaptureOfMovedPiece(response, originalMove) {
  return Boolean(
    response?.captured &&
      originalMove?.to &&
      response.to === originalMove.to &&
      response.color !== originalMove.color
  );
}

function buildActualGameSequence({ chessAfter, move, moves, moveIndex }) {
  const responseToken = getMoveToken(moves?.[moveIndex + 1]);
  const replyToken = getMoveToken(moves?.[moveIndex + 2]);

  if (!responseToken || !replyToken) return null;

  try {
    const chess = new Chess(chessAfter.fen());
    const opponentResponse = playMoveToken(chess, responseToken);

    if (!isRecaptureOfMovedPiece(opponentResponse, move)) return null;

    const chessBeforeReply = new Chess(chess.fen());
    const tacticalReply = playMoveToken(chess, replyToken);

    if (!tacticalReply || tacticalReply.color !== move.color) return null;

    return {
      opponentResponse,
      tacticalReply,
      chessBeforeReply,
      chessAfterReply: new Chess(chess.fen()),
      source: "game",
      sequenceType: "recapturePunishment",
    };
  } catch {
    return null;
  }
}

function buildLineSequence({ chessAfter, move, playedLine }) {
  const tokens = getLineTokens(playedLine);
  if (!tokens.length) return null;

  try {
    const chess = new Chess(chessAfter.fen());
    let opponentResponse = null;
    let tacticalReply = null;
    let chessBeforeReply = null;

    for (const token of tokens) {
      const test = new Chess(chess.fen());
      let nextMove = null;

      try {
        nextMove = playMoveToken(test, token);
      } catch {
        continue;
      }

      if (!nextMove) continue;

      chess.load(test.fen());

      if (!opponentResponse) {
        if (!isRecaptureOfMovedPiece(nextMove, move)) return null;

        opponentResponse = nextMove;
        chessBeforeReply = new Chess(chess.fen());
        continue;
      }

      if (nextMove.color !== move.color) return null;

      tacticalReply = nextMove;
      break;
    }

    if (!opponentResponse || !tacticalReply || !chessBeforeReply) return null;

    return {
      opponentResponse,
      tacticalReply,
      chessBeforeReply,
      chessAfterReply: new Chess(chess.fen()),
      source: "playedLine",
      sequenceType: "recapturePunishment",
    };
  } catch {
    return null;
  }
}

function sideName(color) {
  return color === "w" ? "White" : "Black";
}

export function detectTacticalSequence({
  chessAfter,
  move,
  moves,
  moveIndex,
  playedLine,
} = {}) {
  if (!chessAfter || !move?.captured || !move?.to || !move?.color) return null;

  const sequence =
    buildActualGameSequence({ chessAfter, move, moves, moveIndex }) ||
    buildLineSequence({ chessAfter, move, playedLine });

  if (!sequence) return null;

  const tactic = getContinuationTactic(sequence);
  if (!tactic) return null;

  return {
    type: "tacticalSequence",
    targets: tactic.targets || [],
    tags: {
      sequenceType: sequence.sequenceType,
      capturedPiece: move.captured,
      captureSan: move.san,
      opponentResponseSan: sequence.opponentResponse.san,
      tacticalReplySan: sequence.tacticalReply.san,
      recapturingSide: sideName(sequence.opponentResponse.color),
      punishingSide: sideName(move.color),
      motif: tactic.type,
      motifText: getMotifText(tactic),
      source: sequence.source,
      replySignal: tactic,
    },
  };
}

export const detectTacticalContinuation = detectTacticalSequence;