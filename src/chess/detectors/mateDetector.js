import { Chess } from "chess.js";
import { setFenTurn } from "../features/attacks";

function getMateInOneMoves(fen, sideToCheck, forceTurn = false) {
  if (!fen || !sideToCheck) return [];

  try {
    const testFen = forceTurn ? setFenTurn(fen, sideToCheck) : fen;
    const chess = new Chess(testFen);

    if (chess.turn() !== sideToCheck) return [];

    return chess.moves({ verbose: true }).filter((move) => {
      const test = new Chess(testFen);
      test.move(move);
      return test.isCheckmate();
    });
  } catch {
    return [];
  }
}

export function detectMateThreat(features) {
  if (!features?.fenAfter || !features?.side) return null;

  // TODO: handle check-based mate threats properly
  // If move gives check (+), current logic skips mateThreat to avoid false positives.
  // Later: detect forced mate sequences (mate in 2+) by checking if all opponent replies still allow mate in 1.
  if (features.san?.includes("+") || features.san?.includes("#")) {
    return null;
  }

  const enemySide = features.side === "w" ? "b" : "w";

  const ownMateInOneMoves = getMateInOneMoves(features.fenAfter, features.side, true);
  const enemyMateInOneMoves = getMateInOneMoves(features.fenAfter, enemySide, false);

  if (ownMateInOneMoves.length) {
    return { type: "mateInOne", side: "self", moves: ownMateInOneMoves };
  }

  if (enemyMateInOneMoves.length) {
    return { type: "mateInOne", side: "opponent", moves: enemyMateInOneMoves };
  }

  return null;
}