import { Chess } from "chess.js";
import { PIECE_VALUES, getPieceName } from "../core/pieces";
import { detectDiscoveredAttack, detectDiscoveredCheck } from "../detectors/discoveredAttack";
import { detectFork } from "../detectors/forkDetector";
import { detectRemoveDefender } from "../detectors/removeDefender";
import { detectSkewer } from "../detectors/skewerDetector";
import { extractFeatures } from "./extractFeatures";

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

function sideName(color) {
  return color === "w" ? "White" : "Black";
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
      return "with a tactical response";
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

      const engineReply = await analyzeFen(afterGreedy.fen(), validationDepth);
      const replyUci = engineReply?.bestMove;

      if (!replyUci || replyUci === "(none)" || replyUci === "—") continue;

      const chessBeforeReply = new Chess(afterGreedy.fen());
      const chessAfterReply = new Chess(afterGreedy.fen());
      const tacticalReply = playUci(chessAfterReply, replyUci);

      if (!tacticalReply || tacticalReply.color !== item.side) continue;

      const tactic = getContinuationTactic({
        chessBeforeReply,
        chessAfterReply,
        tacticalReply,
      });

      if (!tactic) continue;

      const exposed = candidate.exposed || {};
      const exposedPiece = exposed.type || greedyMove.captured;
      const exposedValue = exposed.value || PIECE_VALUES[exposedPiece] || 0;

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
          motifText: getMotifText(tactic.type),
          engineBestMove: replyUci,
          enginePv: engineReply?.pv || null,
          replySignal: tactic,
        },
      });
    } catch {
      // Keep validation conservative: if anything fails, do not create the signal.
    }
  }

  return validations.slice(0, 1);
}
