export function averageLoss(moves) {
  const validMoves = moves.filter((m) => Number.isFinite(m.loss));
  if (!validMoves.length) return 0;

  return validMoves.reduce((sum, m) => sum + m.loss, 0) / validMoves.length;
}

export function estimatePlayerRating(moves, result, side) {
  const playerMoves = moves.filter((m) =>
    side === "w"
      ? m.side === "w" || m.side === "White"
      : m.side === "b" || m.side === "Black"
  );

  const opponentMoves = moves.filter((m) =>
    side === "w"
      ? m.side === "b" || m.side === "Black"
      : m.side === "w" || m.side === "White"
  );

  const validMoves = playerMoves.filter((m) => Number.isFinite(m.loss));
  if (!validMoves.length) return 1200;

  const avgLoss =
    validMoves.reduce((sum, m) => sum + Math.min(m.loss, 200), 0) /
    validMoves.length;

  const blunders = validMoves.filter((m) => m.label === "Blunder").length;
  const mistakes = validMoves.filter((m) => m.label === "Mistake").length;
  const inaccuracies = validMoves.filter((m) => m.label === "Inaccuracy").length;

  const swings = validMoves.map((m) => Math.min(m.loss, 300));
  const bigSwings = swings.filter((v) => v >= 120).length;
  const mediumSwings = swings.filter((v) => v >= 70 && v < 120).length;

  const opponentBlunders = opponentMoves.filter((m) => m.label === "Blunder").length;
  const opponentMistakes = opponentMoves.filter((m) => m.label === "Mistake").length;
  const opponentInaccuracies = opponentMoves.filter((m) => m.label === "Inaccuracy").length;

  const opponentWeakness =
    opponentBlunders * 2 + opponentMistakes + opponentInaccuracies * 0.5;

  let rating = 800;

  if (avgLoss < 8) rating = 2700;
  else if (avgLoss < 15) rating = 2500;
  else if (avgLoss < 25) rating = 2250;
  else if (avgLoss < 38) rating = 2000;
  else if (avgLoss < 55) rating = 1800;
  else if (avgLoss < 75) rating = 1600;
  else if (avgLoss < 100) rating = 1400;
  else if (avgLoss < 130) rating = 1200;
  else if (avgLoss < 170) rating = 1000;

  rating -= blunders * 140;
  rating -= mistakes * 25;
  rating -= inaccuracies * 6;

  if (blunders === 0) rating += 40;
  if (blunders === 0 && mistakes <= 2) rating += 40;
  if (blunders === 0 && mistakes <= 4 && validMoves.length >= 25) rating += 30;

  if (bigSwings === 0) rating += 40;
  if (bigSwings === 0 && mediumSwings <= 2) rating += 30;
  if (bigSwings === 0 && mediumSwings === 0) rating += 30;

  if (opponentWeakness >= 9) rating -= 80;
  else if (opponentWeakness >= 6) rating -= 50;
  else if (opponentWeakness >= 3) rating -= 25;

  const isLoss =
    (side === "w" && result === "0-1") ||
    (side === "b" && result === "1-0");

  if (isLoss && validMoves.length < 15 && blunders >= 1) rating -= 120;
  if (isLoss && validMoves.length < 15 && mistakes >= 2) rating -= 70;
  if (isLoss && blunders >= 2) rating -= 70;

  if (validMoves.length < 25) rating -= 80;
  if (validMoves.length < 25 && avgLoss < 15) rating -= 80;

  if (rating > 2400) rating = 2400 + (rating - 2400) * 0.7;
  if (rating > 2700) rating = 2700 + (rating - 2700) * 0.5;

  return Math.max(800, Math.min(3000, Math.round(rating)));
}

export function pluralize(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function countLabels(moves) {
  let blunders = 0;
  let mistakes = 0;
  let inaccuracies = 0;

  moves.forEach((m) => {
    if (m.label === "Blunder") blunders++;
    if (m.label === "Mistake") mistakes++;
    if (m.label === "Inaccuracy") inaccuracies++;
  });

  return { blunders, mistakes, inaccuracies };
}

function averageEval(moves) {
  if (!moves.length) return null;
  return moves.reduce((sum, m) => sum + m.playedEval, 0) / moves.length;
}

export function generateGameTitle(analysis, result) {
  if (!analysis.length) return "";
  const totalMoves = analysis.length;
  const blunders = analysis.filter((m) => m.label === "Blunder").length;
  const mistakes = analysis.filter((m) => m.label === "Mistake").length;

  const valid = analysis.filter((m) => Number.isFinite(m.playedEval));
  const finalEval = valid.length ? valid[valid.length - 1].playedEval : 0;

  if (totalMoves <= 10) {
    if (result === "1-0") return "A quick attacking win for White";
    if (result === "0-1") return "A quick attacking win for Black";
  }

  if (blunders >= 4) {
    return "A chaotic game decided by major mistakes";
  }

  if (blunders >= 2) {
    return "A sharp game with critical turning points";
  }

  if (mistakes <= 2 && blunders === 0) {
    if (result === "1-0") return "A clean and controlled win for White";
    if (result === "0-1") return "A clean and controlled win for Black";
    return "A solid and well-played game";
  }

  if (finalEval > 250) {
    return "White gradually built up a winning position";
  }

  if (finalEval < -250) {
    return "Black gradually built up a winning position";
  }

  return "A balanced game decided by key moments";
}

export function generateGameSummary(analysis, result) {
  if (!analysis.length) return "";

  const whiteMoves = analysis.filter((m) => m.side === "w" || m.side === "White");
  const blackMoves = analysis.filter((m) => m.side === "b" || m.side === "Black");

  const whiteCounts = countLabels(whiteMoves);
  const blackCounts = countLabels(blackMoves);
  const totalMoves = analysis.length;


  const whiteRating = estimatePlayerRating(analysis, result, "w");
  const blackRating = estimatePlayerRating(analysis, result, "b");

  const validLossMoves = analysis.filter((m) => Number.isFinite(m.loss));
  const worstMove = validLossMoves.length
    ? validLossMoves.reduce((a, b) => (b.loss > a.loss ? b : a))
    : null;

  const whiteErrorScore =
    whiteCounts.blunders * 3 + whiteCounts.mistakes * 2 + whiteCounts.inaccuracies;
  const blackErrorScore =
    blackCounts.blunders * 3 + blackCounts.mistakes * 2 + blackCounts.inaccuracies;

  let strongerSideText = "";
  if (result === "1-0") {
    strongerSideText = "White made better use of the critical moments and eventually converted the game.";
  } else if (result === "0-1") {
    strongerSideText = "Black made better use of the critical moments and eventually converted the game.";
  } else if (whiteErrorScore < blackErrorScore) {
    strongerSideText = "White handled the game more accurately overall.";
  } else if (blackErrorScore < whiteErrorScore) {
    strongerSideText = "Black handled the game more accurately overall.";
  } else {
    strongerSideText = "Both sides were fairly close in overall accuracy.";
  }

  if (totalMoves <= 10) {
    if (result === "1-0") {
      return "White won the game quickly with a direct attack on the king.";
    }
    if (result === "0-1") {
      return "Black won the game quickly with a direct attack on the king.";
    }
  }


  const totalBlunders = whiteCounts.blunders + blackCounts.blunders;
  const totalMistakes = whiteCounts.mistakes + blackCounts.mistakes;

  const avgRating = (whiteRating + blackRating) / 2;
  const ratingDiff = Math.abs(whiteRating - blackRating);

  let overallText = "";
  if (totalBlunders >= 5 || totalMistakes >= 10) {
    overallText = "The game was quite chaotic and was decided by major mistakes.";
  } else if (totalBlunders >= 2 || totalMistakes >= 5) {
    overallText = "The game had several important mistakes that influenced the result.";
  } else if (ratingDiff >= 600) {
    overallText = "The game was largely one-sided, with one player clearly outplaying the other.";
  } else if (avgRating >= 2400) {
    overallText = "The game was played at a very high level, with only a few critical moments deciding the result.";
  } else if (avgRating >= 1800) {
    overallText = "The game was relatively well played, with the result decided by a few key moments.";
  } else {
    overallText = "The game was relatively solid, with the result shaped by a few key moments.";
  }

  const criticalText = worstMove
    ? `The critical moment came when ${
        worstMove.side === "w" || worstMove.side === "White" ? "White" : "Black"
      } played ${worstMove.san}, which caused the biggest evaluation swing.`
    : "";

  return `White was estimated around ${whiteRating} level, with ${pluralize(
    whiteCounts.blunders,
    "blunder",
    "blunders"
  )}, ${pluralize(
    whiteCounts.mistakes,
    "mistake",
    "mistakes"
  )} and ${pluralize(
    whiteCounts.inaccuracies,
    "inaccuracy",
    "inaccuracies"
  )}.

Black was estimated around ${blackRating} level, with ${pluralize(
    blackCounts.blunders,
    "blunder",
    "blunders"
  )}, ${pluralize(
    blackCounts.mistakes,
    "mistake",
    "mistakes"
  )} and ${pluralize(
    blackCounts.inaccuracies,
    "inaccuracy",
    "inaccuracies"
  )}.

${criticalText}

${strongerSideText}

${overallText}`;
}

export function generateNarrativeSummary(analysis, result, getAdvantageSide) {
  if (!analysis.length) return "";

  const validPlayed = analysis.filter((m) => Number.isFinite(m.playedEval));
  if (!validPlayed.length) return "";

  const openingSlice = validPlayed.slice(0, Math.min(10, validPlayed.length));
  const middleSlice = validPlayed.slice(
    Math.min(10, validPlayed.length),
    Math.min(30, validPlayed.length)
  );
  const endSlice = validPlayed.slice(Math.min(30, validPlayed.length));

  const totalMoves = analysis.length;
  const openingEval = averageEval(openingSlice);
  const middleEval = averageEval(middleSlice);
  const endEval = averageEval(endSlice.length ? endSlice : validPlayed.slice(-8));
  const finalEval = validPlayed[validPlayed.length - 1]?.playedEval ?? null;

  const openingSide = getAdvantageSide(openingEval);
  const middleSide = getAdvantageSide(middleEval);
  const finalSide = getAdvantageSide(finalEval);

  const biggestSwing = analysis
    .filter((m) => Number.isFinite(m.loss))
    .reduce((a, b) => (b.loss > a.loss ? b : a), analysis[0]);

  let openingText = "";
  if (openingEval == null) {
    openingText = "The game started in a fairly normal way.";
  } else if (openingEval > 120) {
    openingText = "White came out of the opening with a clear pull and the easier position.";
  } else if (openingEval < -120) {
    openingText = "Black came out of the opening with a clear pull and the easier position.";
  } else {
    openingText = "The opening stayed balanced, and neither side got a serious early advantage.";
  }

  if (totalMoves <= 10) {
    if (result === "1-0") {
      return "White quickly launched a decisive attack and finished the game with a fast checkmate.";
    }
    if (result === "0-1") {
      return "Black quickly launched a decisive attack and finished the game with a fast checkmate.";
    }
  }

  let middlegameText = "";
  if (middleEval == null) {
    middlegameText = "The game then developed without one side taking full control.";
  } else if (middleEval > 250) {
    middlegameText = "In the middlegame, White took control and started to build real pressure.";
  } else if (middleEval < -250) {
    middlegameText = "In the middlegame, Black took control and started to build real pressure.";
  } else if (middleEval > 80) {
    middlegameText = "In the middlegame, White gradually improved the position and kept the initiative.";
  } else if (middleEval < -80) {
    middlegameText = "In the middlegame, Black gradually improved the position and kept the initiative.";
  } else {
    middlegameText = "The middlegame remained competitive, with chances for both sides.";
  }

  let transitionText = "";
  if (openingSide !== "equal" && middleSide !== "equal" && openingSide !== middleSide) {
    transitionText = "However, the balance of the game shifted during the middlegame.";
  }

  if (middleSide !== "equal" && finalSide !== "equal" && middleSide !== finalSide) {
    transitionText = "However, the game changed direction at a critical moment.";
  }

  let turningPointText = "";
  if (biggestSwing && biggestSwing.san) {
    const sideText =
      biggestSwing.side === "w" || biggestSwing.side === "White" ? "White" : "Black";

    turningPointText = `The critical turning point came when ${sideText} played ${biggestSwing.san}, creating the biggest swing in the evaluation.`;
  }

  const lastMove = analysis[analysis.length - 1];
  const lastMoveSan = lastMove?.san || "";

  const mateWinner = lastMoveSan.includes("#")
    ? lastMove?.side === "w"
      ? "White"
      : "Black"
    : null;

  const previousEval = validPlayed[validPlayed.length - 2]?.playedEval ?? null;

  const isSuddenDraw =
    Number.isFinite(previousEval) &&
    Number.isFinite(finalEval) &&
    Math.abs(previousEval) > 300 &&
    Math.abs(finalEval) < 30;

  let phaseText = "";

  if (isSuddenDraw) {
    phaseText = "The final phase was about a winning advantage slipping away into a draw.";
  } else if (!mateWinner && endEval != null) {
    if (endEval > 300) {
      phaseText = "The final phase was mainly about White trying to convert an already favorable position.";
    } else if (endEval < -300) {
      phaseText = "The final phase was mainly about Black trying to convert an already favorable position.";
    } else {
      phaseText = "Even in the later phase, the game still demanded accuracy from both sides.";
    }
  }

  let endingText = "";

  if (mateWinner) {
    endingText = `In the end, ${mateWinner} converted the advantage with a quick checkmate.`;
  } else if (isSuddenDraw || result === "1/2-1/2") {
    endingText = "In the end, neither side managed to turn the game into a full point.";
  } else if (result === "1-0") {
    endingText =
      finalEval != null && finalEval > 250
        ? "From there, White kept the upper hand and converted the game successfully."
        : "White eventually found the right way to finish the game.";
  } else if (result === "0-1") {
    endingText =
      finalEval != null && finalEval < -250
        ? "From there, Black kept the upper hand and converted the game successfully."
        : "Black eventually found the right way to finish the game.";
  } else {
    endingText = "In the end, neither side managed to turn the game into a full point.";
  }

  return `${openingText} ${middlegameText} ${transitionText} ${turningPointText} ${phaseText} ${endingText}`
    .replace(/\s+/g, " ")
    .trim();
}

export function calculateAccuracy(moves) {
  const validMoves = moves.filter((m) => Number.isFinite(m.loss));
  if (!validMoves.length) return 100;

  const avgLoss =
    validMoves.reduce((sum, m) => sum + Math.min(m.loss, 200), 0) / validMoves.length;

  const accuracy = 100 - avgLoss * 0.6;

  return Math.max(50, Math.min(100, Math.round(accuracy)));
}