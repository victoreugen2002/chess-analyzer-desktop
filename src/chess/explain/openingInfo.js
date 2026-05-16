import aOpenings from "../data/openings/a.tsv?raw";
import bOpenings from "../data/openings/b.tsv?raw";
import cOpenings from "../data/openings/c.tsv?raw";
import dOpenings from "../data/openings/d.tsv?raw";
import eOpenings from "../data/openings/e.tsv?raw";

function normalizeSan(san) {
  return String(san || "")
    .replace(/^0-0-0$/i, "O-O-O")
    .replace(/^0-0$/i, "O-O")
    .replace(/[+#?!]+/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function pgnToSans(pgn) {
  return String(pgn || "")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\$\d+/g, " ")
    .replace(/\d+\.(\.\.)?/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !["1-0", "0-1", "1/2-1/2", "*"].includes(token))
    .map(normalizeSan)
    .filter(Boolean);
}

function parseTsv(raw) {
  return String(raw || "")
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const [eco, name, ...pgnParts] = line.split("\t");
      const pgn = pgnParts.join("\t").trim();
      const sans = pgnToSans(pgn);

      return {
        eco: eco?.trim(),
        name: name?.trim(),
        pgn,
        sans,
        length: sans.length,
      };
    })
    .filter((opening) => opening.eco && opening.name && opening.sans.length);
}

const OPENINGS = [
  ...parseTsv(aOpenings),
  ...parseTsv(bOpenings),
  ...parseTsv(cOpenings),
  ...parseTsv(dOpenings),
  ...parseTsv(eOpenings),
];

function isPrefix(prefix, full) {
  if (!prefix?.length || !full?.length) return false;
  if (prefix.length > full.length) return false;

  return prefix.every((move, index) => move === full[index]);
}

function getPlayedSans(moves) {
  return (Array.isArray(moves) ? moves : [])
    .map((move) => (typeof move === "string" ? move : move?.san))
    .map(normalizeSan)
    .filter(Boolean);
}

function findBestOpeningForPrefix(playedSans) {
  if (!playedSans.length) return null;

  // Prefer the most specific already reached opening name.
  const reachedOpening = OPENINGS
    .filter((opening) => isPrefix(opening.sans, playedSans))
    .sort((a, b) => b.length - a.length)[0];

  if (reachedOpening) return reachedOpening;

  // If the game is still early, use the closest known continuation.
  return OPENINGS
    .filter((opening) => isPrefix(playedSans, opening.sans))
    .sort((a, b) => a.length - b.length)[0] || null;
}

function findPossibleNextBookMoves(playedSans) {
  if (!playedSans.length) return [];

  const seen = new Set();
  const nextMoves = [];

  for (const opening of OPENINGS) {
    if (!isPrefix(playedSans, opening.sans)) continue;

    const nextSan = opening.sans[playedSans.length];
    if (!nextSan || seen.has(nextSan)) continue;

    seen.add(nextSan);
    nextMoves.push(nextSan);

    if (nextMoves.length >= 4) break;
  }

  return nextMoves;
}

function formatPly(ply) {
  const moveNumber = Math.ceil(ply / 2);
  return ply % 2 === 1 ? `${moveNumber}. White` : `${moveNumber}... Black`;
}

function formatMoveList(moves) {
  if (!moves?.length) return "";
  if (moves.length === 1) return moves[0];
  if (moves.length === 2) return `${moves[0]} or ${moves[1]}`;

  return `${moves.slice(0, -1).join(", ")}, or ${moves[moves.length - 1]}`;
}

export function getOpeningInfo(moves) {
  if (!Array.isArray(moves) || !moves.length) return null;

  const playedSans = getPlayedSans(moves);

  if (!playedSans.length) return null;

  let bestMatch = null;

  for (const opening of OPENINGS) {
    if (!isPrefix(opening.sans, playedSans)) continue;

    if (!bestMatch || opening.length > bestMatch.length) {
      bestMatch = opening;
    }
  }

  if (!bestMatch) {
    const partialMatch = OPENINGS
      .filter((opening) => isPrefix(playedSans, opening.sans))
      .sort((a, b) => a.length - b.length)[0];

    if (!partialMatch) return null;

    return {
      eco: partialMatch.eco,
      name: partialMatch.name,
      matchedPattern: playedSans.join(" "),
      matchedPgn: partialMatch.pgn,
      outOfBookPly: null,
      description: [
        `ECO ${partialMatch.eco}.`,
        "This game is still too early or too transpositional for a precise full match.",
        `Closest known line: ${partialMatch.pgn}`,
      ].join("\n"),
    };
  }

  const outOfBookPly =
    playedSans.length > bestMatch.length ? bestMatch.length + 1 : null;

  return {
    eco: bestMatch.eco,
    name: bestMatch.name,
    matchedPattern: bestMatch.sans.join(" "),
    matchedPgn: bestMatch.pgn,
    outOfBookPly,
    description: [
      `ECO ${bestMatch.eco}.`,
      outOfBookPly
        ? `You left this book line around ${formatPly(outOfBookPly)}.`
        : "You are still inside the matched book line.",
      `Book line: ${bestMatch.pgn}`,
    ].join("\n"),
  };
}

export function getOpeningMoveContext(moves, moveIndex) {
  if (!Array.isArray(moves) || moveIndex < 0) return null;

  const playedSans = getPlayedSans(moves);
  const currentSans = playedSans.slice(0, moveIndex + 1);
  const previousSans = playedSans.slice(0, moveIndex);

  if (!currentSans.length) return null;

  const currentOpening = findBestOpeningForPrefix(currentSans);

  // Still inside at least one known book path.
  if (OPENINGS.some((opening) => isPrefix(currentSans, opening.sans))) {
    return {
      status: "inBook",
      eco: currentOpening?.eco || null,
      name: currentOpening?.name || "the opening book",
      bookLine: currentOpening?.pgn || null,
      expectedNextMoves: findPossibleNextBookMoves(currentSans),
    };
  }

  // If the previous position was in book, this exact move is the first deviation.
  if (previousSans.length && OPENINGS.some((opening) => isPrefix(previousSans, opening.sans))) {
    const previousOpening = findBestOpeningForPrefix(previousSans);
    const expectedNextMoves = findPossibleNextBookMoves(previousSans);

    // Some ECO entries are terminal in the dataset. In that case, the app
    // should not treat the next normal move as a serious book mistake, because
    // there is no known continuation in the local book to compare against.
    if (!expectedNextMoves.length) {
      return {
        status: "beyondKnownBook",
        eco: previousOpening?.eco || null,
        name: previousOpening?.name || "the opening book",
        bookLine: previousOpening?.pgn || null,
        expectedNextMoves: [],
        expectedText: "",
      };
    }

    return {
      status: "leftBook",
      eco: previousOpening?.eco || null,
      name: previousOpening?.name || "the opening book",
      bookLine: previousOpening?.pgn || null,
      expectedNextMoves,
      expectedText: formatMoveList(expectedNextMoves),
    };
  }

  return null;
}
