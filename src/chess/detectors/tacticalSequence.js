import { Chess } from "chess.js";
import { PIECE_VALUES } from "../core/pieces";
import { detectDiscoveredAttack, detectDiscoveredCheck } from "./discoveredAttack";
import { detectFork } from "./forkDetector";
import { detectRemoveDefender } from "./removeDefender";
import { detectSkewer } from "./skewerDetector";

function playMoveToken(chess, token) {
  if (!chess || !token) return null;

  const clean = String(token).trim();

  if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(clean)) {
    return chess.move({
      from: clean.slice(0, 2),
      to: clean.slice(2, 4),
      promotion: clean[4] || "q",
    });
  }

  return chess.move(clean, { sloppy: true });
}

function getLineTokens(line) {
  if (!line) return [];

  if (Array.isArray(line)) {
    return line.filter(Boolean);
  }

  return String(line)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !/^\d+\.{1,3}$/.test(token))
    .filter((token) => !["1-0", "0-1", "1/2-1/2", "*"].includes(token));
}

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

      // Engine lines sometimes include the already-played move or illegal noise.
      // Skip illegal tokens until we find the opponent's immediate response.
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

function detectStrongMaterialGain(reply) {
  if (!reply?.captured) return null;

  const value = PIECE_VALUES[reply.captured] || 0;
  if (value < 3) return null;

  return {
    type: "materialGain",
    targets: [
      {
        piece: reply.captured,
        square: reply.to,
        value,
      },
    ],
  };
}

function getContinuationTactic({ chessBeforeReply, chessAfterReply, tacticalReply }) {
  const checks = [
    detectFork({ chessAfter: chessAfterReply, move: tacticalReply }),
    detectSkewer({
      chessBefore: chessBeforeReply,
      chessAfter: chessAfterReply,
      move: tacticalReply,
    }),
    detectDiscoveredCheck({
      chessBefore: chessBeforeReply,
      chessAfter: chessAfterReply,
      move: tacticalReply,
    }),
    detectDiscoveredAttack({
      chessBefore: chessBeforeReply,
      chessAfter: chessAfterReply,
      move: tacticalReply,
    }),
    detectRemoveDefender({
      chessBefore: chessBeforeReply,
      chessAfter: chessAfterReply,
      move: tacticalReply,
    }),
    detectStrongMaterialGain(tacticalReply),
  ].filter(Boolean);

  return checks[0] || null;
}

function getMotifText(type) {
  switch (type) {
    case "fork":
      return "with a fork";
    case "skewer":
      return "with a skewer";
    case "discoveredCheck":
      return "with a discovered check";
    case "discoveredAttack":
      return "with a discovered attack";
    case "removeDefender":
      return "by removing a defender";
    case "materialGain":
      return "winning material";
    default:
      return "with a tactical continuation";
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
      motifText: getMotifText(tactic.type),
      source: sequence.source,
      replySignal: tactic,
    },
  };
}

export const detectTacticalContinuation = detectTacticalSequence;
