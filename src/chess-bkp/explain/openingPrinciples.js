export function checkOpeningPrinciples(moveIndex, moves, loss = 0) {
  const cpLoss = Number(loss || 0);
  const messages = [];

  if (!moves?.length) return messages;
  if (cpLoss < 20) return messages;
  if (moveIndex > 20) return messages;

  const move = moves[moveIndex];
  if (!move) return messages;

  const san = move.san;

  const isCapture = san?.includes("x");
  const isCheck = san?.includes("+");
  const isCastle = san === "O-O" || san === "O-O-O";
  const isPromotion = san?.includes("=");
  const isMate = san?.includes("#");
  const isQuiet = !isCapture && !isCheck && !isCastle && !isPromotion && !isMate;

  if (san === "e3" || san === "d3") {
    messages.push(
      "This is a passive opening move because it does not challenge the center directly and can slow development."
    );
  }

  if (san === "f3" || san === "f6") {
    messages.push("This move weakens the king and blocks natural development.");
  }

  const prevMove = moveIndex >= 2 ? moves[moveIndex - 2] : null;

  if (
    prevMove &&
    prevMove.san[0] === san[0] &&
    /[NBRQK]/.test(san[0]) &&
    !isCapture &&
    !isCheck &&
    cpLoss >= 20
  ) {
    messages.push("Moving the same piece again can slow development.");
  }

  if (san.startsWith("Q") && moveIndex < 10) {
    messages.push("Bringing the queen out early can make it a target.");
  }

  if (san.startsWith("K") && moveIndex < 10 && !isCastle) {
    messages.push("Moving the king early is risky and leaves it exposed.");
  }

  const developmentMoves = moves
    .slice(0, moveIndex + 1)
    .filter((m) => /^[NBR]/.test(m.san)).length;

  if (moveIndex >= 8 && developmentMoves <= 2 && isQuiet) {
    messages.push("Developing pieces faster would make the position easier to play.");
  }

  const hasCastled = moves
    .slice(0, moveIndex + 1)
    .some((m) => m.san === "O-O" || m.san === "O-O-O");

  const kingMoved = moves
    .slice(0, moveIndex + 1)
    .some((m) => m.san.startsWith("K"));

  if (moveIndex >= 16 && !hasCastled && !kingMoved && isQuiet) {
    messages.push("Castling would improve king safety.");
  }

  return messages;
}