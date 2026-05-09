import { Chess } from "chess.js";
import { PIECE_VALUES, getPieceName } from "../core/pieces";
import { buildLegalContinuation, playMoveToken, playSan } from "./engineLine";
import { getContinuationTactic, getMotifText } from "./continuationTactics";
import { detectSkewer } from "../detectors/skewerDetector";
import { getAttackedSquaresByPiece } from "../utils";



function sideName(color) {
  return color === "w" ? "White" : "Black";
}



function getMoveAttackText(chessAfter, move) {
  if (!chessAfter || !move?.to || !move?.color) return "";

  const movedPiece = chessAfter.get(move.to);
  if (!movedPiece) return "";

  const enemyColor = move.color === "w" ? "b" : "w";
  const attackedSquares = getAttackedSquaresByPiece(chessAfter, move.to);

  const targets = attackedSquares
    .map((square) => ({ square, piece: chessAfter.get(square) }))
    .filter(({ piece }) => piece?.color === enemyColor && piece.type !== "k")
    .map(({ square, piece }) => ({
      piece: piece.type,
      square,
      value: PIECE_VALUES[piece.type] || 0,
    }))
    .filter((target) => target.value >= 1)
    .sort((a, b) => b.value - a.value);

  const target = targets[0];
  if (!target) return "";

  const name = getPieceName(target.piece) || "piece";
  return `This attacks the ${name} on ${target.square}`;
}

function isLossClearlyBadForMover(loss) {
  return Number.isFinite(loss) && loss > 80;
}

function isMoveAcceptableForMover(loss) {
  return !Number.isFinite(loss) || loss <= 120;
}

async function getEngineLineAfterPlayedMove({ item, analyzeFen, depth }) {
  const existingLine = item?.playedLine;

  if (existingLine) {
    return {
      pv: existingLine,
      bestMove: null,
    };
  }

  if (!item?.fenAfter || typeof analyzeFen !== "function") return null;

  return analyzeFen(item.fenAfter, depth);
}

async function buildOpponentTacticalReply({ item, analyzeFen, depth }) {
  if (!item?.fenAfter || !item?.side || !isLossClearlyBadForMover(item.loss)) {
    return null;
  }

  try {
    const engineLine = await getEngineLineAfterPlayedMove({ item, analyzeFen, depth });
    const line = engineLine?.pv || engineLine?.bestMove;

    const continuation = buildLegalContinuation({
      fen: item.fenAfter,
      line,
      maxPlies: 3,
    });

    const tacticalReply = continuation.find((move) => move.color !== item.side);

    if (!tacticalReply) return null;

    const chessBeforeReply = new Chess(tacticalReply.fenBefore);
    const chessAfterReply = new Chess(tacticalReply.fenAfter);

    const tactic = getContinuationTactic({
      chessBeforeReply,
      chessAfterReply,
      tacticalReply,
    });

    if (!tactic) return null;

    const playedAfter = new Chess(item.fenBefore);
    const playedMove = playSan(playedAfter, item.san);
    const moveAttackText = playedMove
      ? getMoveAttackText(playedAfter, playedMove)
      : "";

    return {
      type: "opponentTacticalReply",
      targets: tactic.targets || [],
      tags: {
        replySan: tacticalReply.san,
        replySide: sideName(tacticalReply.color),
        motif: tactic.type,
        motifText: getMotifText(tactic),
        replySignal: tactic,
        engineBestMove: tacticalReply.lan || tacticalReply.token || null,
        enginePv: engineLine?.pv || null,
        moveAttackText,
      },
    };
  } catch {
    return null;
  }
}

async function buildValidatedSkewer({ item, analyzeFen, depth }) {
  if (!item?.fenBefore || !item?.fenAfter || !item?.san || !item?.side) return null;
  if (!isMoveAcceptableForMover(item.loss)) return null;

  try {
    const chessBefore = new Chess(item.fenBefore);
    const chessAfter = new Chess(item.fenBefore);
    const playedMove = playSan(chessAfter, item.san);

    if (!playedMove) return null;

    const skewer = detectSkewer({
      chessBefore,
      chessAfter,
      move: playedMove,
    });

    const rear = skewer?.targets?.[1];
    if (!rear?.square) return null;

    const engineLine = await getEngineLineAfterPlayedMove({ item, analyzeFen, depth });
    const continuation = buildLegalContinuation({
      fen: item.fenAfter,
      line: engineLine?.pv || engineLine?.bestMove,
      maxPlies: 3,
    });

    const opponentReply = continuation.find((move) => move.color !== item.side);
    if (!opponentReply) return null;

    let winningMove = continuation.find(
      (move) => move.color === item.side && move.captured && move.to === rear.square
    );

    if (!winningMove && typeof analyzeFen === "function") {
      const replyPosition = new Chess(opponentReply.fenAfter);
      const followUp = await analyzeFen(replyPosition.fen(), depth);
      winningMove = playMoveToken(replyPosition, followUp?.bestMove);
    }

    if (!winningMove || winningMove.color !== item.side) return null;
    if (!winningMove.captured || winningMove.to !== rear.square) return null;

    return {
      type: "validatedSkewer",
      targets: skewer.targets || [],
      tags: {
        ...(skewer.tags || {}),
        originalSignal: skewer,
        opponentReplySan: opponentReply.san,
        winningMoveSan: winningMove.san,
        enginePv: engineLine?.pv || null,
      },
    };
  } catch {
    return null;
  }
}

export async function buildTacticalValidations({
  item,
  analyzeFen,
  depth = 10,
} = {}) {
  if (!item?.fenBefore || !item?.fenAfter) return [];

  const validationDepth = Math.max(6, Math.min(depth || 10, 10));
  const validations = [];

  const opponentReply = await buildOpponentTacticalReply({
    item,
    analyzeFen,
    depth: validationDepth,
  });

  if (opponentReply) validations.push(opponentReply);

  const validatedSkewer = await buildValidatedSkewer({
    item,
    analyzeFen,
    depth: validationDepth,
  });

  if (validatedSkewer) validations.push(validatedSkewer);

  return validations;
}
