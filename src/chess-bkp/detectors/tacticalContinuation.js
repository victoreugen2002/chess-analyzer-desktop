import { Chess } from "chess.js";
import { PIECE_VALUES } from "../core/pieces";
import { detectDiscoveredAttack, detectDiscoveredCheck } from "./discoveredAttack";
import { detectFork } from "./forkDetector";
import { detectRemoveDefender } from "./removeDefender";
import { detectSkewer } from "./skewerDetector";

function playMoveToken(chess, token) {
  if (!chess || !token) return null;

  if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(token)) {
    return chess.move({
      from: token.slice(0, 2),
      to: token.slice(2, 4),
      promotion: token[4] || "q",
    });
  }

  return chess.move(token, { sloppy: true });
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

function isImmediateRecapture(recapture, originalMove) {
  return Boolean(
    recapture?.captured &&
      originalMove?.to &&
      recapture.to === originalMove.to &&
      recapture.color !== originalMove.color
  );
}

function buildActualGameContinuation({ chessAfter, move, moves, moveIndex }) {
  const recaptureToken = getMoveToken(moves?.[moveIndex + 1]);
  const replyToken = getMoveToken(moves?.[moveIndex + 2]);

  if (!recaptureToken || !replyToken) return null;

  try {
    const chess = new Chess(chessAfter.fen());
    const recapture = playMoveToken(chess, recaptureToken);

    if (!isImmediateRecapture(recapture, move)) return null;

    const chessBeforeReply = new Chess(chess.fen());
    const reply = playMoveToken(chess, replyToken);

    if (!reply || reply.color !== move.color) return null;

    return {
      recapture,
      reply,
      chessBeforeReply,
      chessAfterReply: new Chess(chess.fen()),
      source: "game",
    };
  } catch {
    return null;
  }
}

function buildLineContinuation({ chessAfter, move, playedLine }) {
  const tokens = getLineTokens(playedLine);
  if (!tokens.length) return null;

  try {
    const chess = new Chess(chessAfter.fen());
    let recapture = null;
    let reply = null;
    let chessBeforeReply = null;

    for (const token of tokens) {
      const test = new Chess(chess.fen());
      const nextMove = playMoveToken(test, token);

      if (!nextMove) continue;

      chess.load(test.fen());

      if (!recapture) {
        if (!isImmediateRecapture(nextMove, move)) return null;

        recapture = nextMove;
        chessBeforeReply = new Chess(chess.fen());
        continue;
      }

      if (nextMove.color !== move.color) return null;

      reply = nextMove;
      break;
    }

    if (!recapture || !reply || !chessBeforeReply) return null;

    return {
      recapture,
      reply,
      chessBeforeReply,
      chessAfterReply: new Chess(chess.fen()),
      source: "playedLine",
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

function getContinuationTactic({ chessBeforeReply, chessAfterReply, reply }) {
  const checks = [
    detectFork({ chessAfter: chessAfterReply, move: reply }),
    detectSkewer({
      chessBefore: chessBeforeReply,
      chessAfter: chessAfterReply,
      move: reply,
    }),
    detectDiscoveredCheck({
      chessBefore: chessBeforeReply,
      chessAfter: chessAfterReply,
      move: reply,
    }),
    detectDiscoveredAttack({
      chessBefore: chessBeforeReply,
      chessAfter: chessAfterReply,
      move: reply,
    }),
    detectRemoveDefender({
      chessBefore: chessBeforeReply,
      chessAfter: chessAfterReply,
      move: reply,
    }),
    detectStrongMaterialGain(reply),
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

export function detectTacticalContinuation({
  chessAfter,
  move,
  moves,
  moveIndex,
  playedLine,
} = {}) {
  if (!chessAfter || !move?.captured || !move?.to || !move?.color) return null;

  const continuation =
    buildActualGameContinuation({ chessAfter, move, moves, moveIndex }) ||
    buildLineContinuation({ chessAfter, move, playedLine });

  if (!continuation) return null;

  const tactic = getContinuationTactic(continuation);
  if (!tactic) return null;

  return {
    type: "tacticalContinuation",
    targets: tactic.targets || [],
    tags: {
      capturedPiece: move.captured,
      captureSan: move.san,
      recaptureSan: continuation.recapture.san,
      replySan: continuation.reply.san,
      recapturingSide: sideName(continuation.recapture.color),
      punishingSide: sideName(move.color),
      motif: tactic.type,
      motifText: getMotifText(tactic.type),
      source: continuation.source,
      replySignal: tactic,
    },
  };
}
