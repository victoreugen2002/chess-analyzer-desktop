import { PIECE_VALUES, getPieceName } from "../core/pieces";

import { Chess } from "chess.js";
import { extractFeatures } from "./extractFeatures";
import { getContinuationTactic, getMotifText } from "./continuationTactics";

function playUci(chess, uci) {
  if (!chess || !uci || !/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(uci)) {
    return null;
  }

  return chess.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci[4] || "q",
  });
}

function joinLineParts(parts = []) {
  return parts.filter(Boolean).join(" ");
}

function sideName(color) {
  return color === "w" ? "White" : "Black";
}


function getNewlyHangingMaterial({ fenBefore, fenAfter, san, side, moves, moveIndex }) {
  const features = extractFeatures({
    fenBefore,
    fenAfter,
    san,
    side,
    previousSan: moves?.[moveIndex - 1]?.san,
    moves,
    moveIndex,
  });

  return (features.ownHangingPieces || [])
    .filter((piece) => piece?.square && (piece.value || PIECE_VALUES[piece.type] || 0) >= 1)
    .sort((a, b) => (b.value || 0) - (a.value || 0));
}

function findGreedyCaptures({ fenAfter, exposedPieces, maxCandidates = 3 }) {
  const chess = new Chess(fenAfter);
  const legalMoves = chess.moves({ verbose: true });
  const exposedSquares = new Set(exposedPieces.map((piece) => piece.square));
  const exposedBySquare = new Map(exposedPieces.map((piece) => [piece.square, piece]));

  return legalMoves
    .filter((move) => move.captured && exposedSquares.has(move.to))
    .map((move) => ({
      move,
      exposed: exposedBySquare.get(move.to),
    }))
    .sort((a, b) => {
      const aValue = a.exposed?.value || PIECE_VALUES[a.exposed?.type] || 0;
      const bValue = b.exposed?.value || PIECE_VALUES[b.exposed?.type] || 0;
      return bValue - aValue;
    })
    .slice(0, maxCandidates);
}

function isLossClearlyBadForMover(loss) {
  return Number.isFinite(loss) && loss > 120;
}

export async function buildGreedyCaptureValidations({
  item,
  moves,
  moveIndex,
  analyzeFen,
  depth = 10,
} = {}) {
  if (!item?.fenBefore || !item?.fenAfter || !item?.san || !item?.side) return [];
  if (typeof analyzeFen !== "function") return [];

  // If Stockfish already says the move is clearly bad, do not explain it as poisoned material.
  if (isLossClearlyBadForMover(item.loss)) return [];

  let exposedPieces = [];

  try {
    exposedPieces = getNewlyHangingMaterial({
      fenBefore: item.fenBefore,
      fenAfter: item.fenAfter,
      san: item.san,
      side: item.side,
      moves,
      moveIndex,
    });
  } catch {
    exposedPieces = [];
  }

  if (!exposedPieces.length) return [];

  let greedyCaptures = [];

  try {
    greedyCaptures = findGreedyCaptures({
      fenAfter: item.fenAfter,
      exposedPieces,
      maxCandidates: 3,
    });
  } catch {
    greedyCaptures = [];
  }

  if (!greedyCaptures.length) return [];

  const validations = [];
  const validationDepth = Math.max(6, Math.min(depth || 10, 10));

  for (const candidate of greedyCaptures) {
    try {
      const afterGreedy = new Chess(item.fenAfter);
      const greedyMove = afterGreedy.move({
        from: candidate.move.from,
        to: candidate.move.to,
        promotion: candidate.move.promotion || undefined,
      });

      if (!greedyMove) continue;

      // Ignore normal equal recaptures, e.g. Nxd4 Nxd4
      const originalChess = new Chess(item.fenBefore);
      const originalMove = originalChess.move(item.san);

      if (
        originalMove?.captured &&
        greedyMove?.captured &&
        originalMove.piece === greedyMove.captured &&
        originalMove.captured === greedyMove.piece
      ) {
        continue;
      }

      const engineReply = await analyzeFen(afterGreedy.fen(), validationDepth);
      const replyUci = engineReply?.bestMove;

      if (!replyUci || replyUci === "(none)" || replyUci === "—") continue;

      const chessBeforeReply = new Chess(afterGreedy.fen());
      const chessAfterReply = new Chess(afterGreedy.fen());
      const tacticalReply = playUci(chessAfterReply, replyUci);

      // Ignore normal equal trades / recaptures
      if (
        tacticalReply?.captured &&
        greedyMove?.piece &&
        tacticalReply.captured === greedyMove.piece
      ) {
        const capturedValue =
          PIECE_VALUES[tacticalReply.captured] || 0;

        const greedyPieceValue =
          PIECE_VALUES[greedyMove.piece] || 0;

        const isEqualTrade =
          Math.abs(capturedValue - greedyPieceValue) <= 1;

        if (isEqualTrade) {
          continue;
        }
      }

      if (!tacticalReply || tacticalReply.color !== item.side) continue;

      const tactic = getContinuationTactic({
        chessBeforeReply,
        chessAfterReply,
        tacticalReply,
      });

      if (!tactic) continue;

      const tacticValue = Math.max(
        ...(tactic.targets || []).map((t) => t.value || PIECE_VALUES[t.piece] || 0),
        0
      );

      const candidateExposedValue =
        candidate.exposed?.value || PIECE_VALUES[candidate.exposed?.type] || 0;

      if (tactic.type === "attack" && tacticValue <= candidateExposedValue) {
        continue;
      }

      const exposed = candidate.exposed || {};
      const exposedPiece = exposed.type || greedyMove.captured;
      const exposedValue = exposed.value || PIECE_VALUES[exposedPiece] || 0;

      const recapturePunishment =
        tactic.tags?.recapturePunishment || null;

      const greedyPreviewLineSans = joinLineParts([
        greedyMove.san,
        tacticalReply.san,
        recapturePunishment?.recaptureSan,
        recapturePunishment?.punishSan,
      ]);

      validations.push({
        type: "greedyCapturePunishment",
        targets: [
          {
            piece: exposedPiece,
            name: getPieceName(exposedPiece) || "piece",
            square: greedyMove.to,
            value: exposedValue,
            isDefended: false,
          },
          ...(tactic.targets || []),
        ],
        tags: {
          exposedPiece,
          exposedSquare: greedyMove.to,
          exposedPieceName: getPieceName(exposedPiece) || "piece",
          greedyCaptureSan: greedyMove.san,
          tacticalReplySan: tacticalReply.san,
          greedySide: sideName(greedyMove.color),
          punishingSide: sideName(tacticalReply.color),
          motif: tactic.type,
          motifText: getMotifText(tactic),
          engineBestMove: replyUci,
          enginePv: engineReply?.pv || null,
          replySignal: tactic,
          greedyPreviewLineSans,
        },
      });
    } catch {
      // Keep validation conservative: if anything fails, do not create the signal.
    }
  }

  return validations.slice(0, 1);
}
