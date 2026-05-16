import { Chess } from "chess.js";

const PUZZLES_KEY = "chessAnalyzer.personalPuzzles";

function hasStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson(key, fallback) {
  if (!hasStorage()) return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn(`Could not read ${key} from localStorage:`, error);
    return fallback;
  }
}

function writeJson(key, value) {
  if (!hasStorage()) return value;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Could not save ${key} to localStorage:`, error);
  }

  return value;
}

function hashText(text) {
  let hash = 0;
  const input = String(text || "");

  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash).toString(36);
}

function normalizePlayerName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function samePlayerName(a, b) {
  const first = normalizePlayerName(a);
  const second = normalizePlayerName(b);

  return Boolean(first && second && first === second);
}

function getAllPuzzles() {
  const puzzles = readJson(PUZZLES_KEY, []);
  return Array.isArray(puzzles) ? puzzles : [];
}

function saveAllPuzzles(puzzles) {
  return writeJson(PUZZLES_KEY, Array.isArray(puzzles) ? puzzles : []);
}

function getMoveNumber(ply) {
  const moveNumber = Math.ceil(Number(ply || 1) / 2);
  return Number(ply) % 2 === 0 ? `${moveNumber}...` : `${moveNumber}.`;
}

function getLoss(item) {
  return Number.isFinite(Number(item?.loss)) ? Math.abs(Number(item.loss)) : 0;
}

function getSignals(item) {
  return [
    ...(Array.isArray(item?.messageSignals) ? item.messageSignals : []),
    ...(Array.isArray(item?.detections) ? item.detections : []),
  ].filter(Boolean);
}

function signalHasMaterialPayoff(signal) {
  return Boolean(
    signal?.tags?.materialPayoff ||
      signal?.tags?.materialGain ||
      signal?.tags?.relevantLineSans?.length ||
      signal?.tags?.relevantLineUci?.length ||
      signal?.tags?.greedyPreviewLineSans?.length
  );
}

const MISTAKE_REVIEW_SIGNAL_TYPES = new Set([
  "continuationMaterialLoss",
  "continuationMaterialLossPayoff",
]);

function isMistakeReviewSignal(signal) {
  return MISTAKE_REVIEW_SIGNAL_TYPES.has(signal?.type);
}

function getTrainingTypeFromSignal(signal) {
  return isMistakeReviewSignal(signal) ? "mistakeReview" : "tacticalPuzzle";
}

function getTrainingTypeLabel(trainingType) {
  return trainingType === "mistakeReview" ? "Mistake Review" : "Tactical Puzzle";
}

function getSignalDisplayLabel(signal) {
  switch (signal?.type) {
    case "continuationMaterialLoss":
    case "continuationMaterialLossPayoff":
      return "material safety";
    case "validatedSkewer":
      return "skewer";
    case "discoveredAttack":
      return "discovered attack";
    case "discoveredCheck":
      return "discovered check";
    case "mateThreat":
      return "mate threat";
    case "materialGain":
    case "capturePayoff":
      return "material gain";
    case "tacticalSequence":
    case "tacticalContinuation":
      return "tactical sequence";
    case "opponentTacticalReply":
      return "tactical reply";
    case "greedyCapturePunishment":
      return "greedy capture punishment";
    case "recapturePunishment":
      return "recapture punishment";
    case "removeDefender":
      return "remove defender";
    default:
      return String(signal?.type || "tactic")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .toLowerCase();
  }
}

function normalizeLineTokens(value) {
  if (!value) return [];

  const rawTokens = Array.isArray(value)
    ? value
    : String(value).split(/\s+/);

  return rawTokens
    .map((token) => String(token || "").trim())
    .filter(Boolean)
    .filter((token) => !/^\d+\.{1,3}$/.test(token))
    .filter((token) => !["1-0", "0-1", "1/2-1/2", "*"].includes(token));
}

function formatLineTokens(tokens, maxTokens = 6) {
  const cleanTokens = normalizeLineTokens(tokens).slice(0, maxTokens);
  return cleanTokens.join(" ");
}

function getFenAfterUci(fen, uci) {
  if (!fen || !uci || uci.length < 4) return "";

  try {
    const chess = new Chess(fen);
    const moveInput = {
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
    };

    if (uci[4]) moveInput.promotion = uci[4];

    const move = chess.move(moveInput);
    return move ? chess.fen() : "";
  } catch {
    return "";
  }
}

function formatLineFromFen(fen, line, maxTokens = 6) {
  const tokens = normalizeLineTokens(line).slice(0, maxTokens);
  if (!tokens.length) return "";

  if (!fen) return tokens.join(" ");

  try {
    const chess = new Chess(fen);
    const sanTokens = [];

    for (const token of tokens) {
      let move = null;
      const cleanToken = String(token || "").trim();

      if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(cleanToken)) {
        const moveInput = {
          from: cleanToken.slice(0, 2),
          to: cleanToken.slice(2, 4),
        };

        if (cleanToken[4]) moveInput.promotion = cleanToken[4];
        move = chess.move(moveInput);
      } else {
        move = chess.move(cleanToken, { sloppy: true });
      }

      if (!move) break;
      sanTokens.push(move.san);
    }

    return sanTokens.length ? sanTokens.join(" ") : tokens.join(" ");
  } catch {
    return tokens.join(" ");
  }
}

function getLineTextFromMessage(value) {
  const text = String(value || "");
  if (!text) return "";

  const match = text.match(/(?:relevant continuation|continuation|line)\s*:\s*([^.;]+)/i);
  return match?.[1] ? formatLineTokens(match[1]) : "";
}

function getPunishmentLineFromSignal(signal, item = {}) {
  const tags = signal?.tags || {};
  const fenAfterGameMove = getFenAfterUci(item?.fenBefore, item?.lan || item?.playedMove);
  const sanCandidates = [
    tags.relevantLineSans,
    tags.relevantLineSan,
    tags.relevantLine,
    tags.continuationSans,
    tags.continuationSan,
    tags.punishmentLineSans,
    tags.punishmentLineSan,
    tags.greedyPreviewLineSans,
    tags.lineSans,
    tags.lineSan,
    tags.variationSans,
    tags.variationSan,
    signal?.relevantLineSans,
    signal?.relevantLineSan,
    signal?.relevantLine,
    signal?.continuationSans,
    signal?.continuationSan,
    signal?.punishmentLineSans,
    signal?.punishmentLineSan,
    signal?.lineSans,
    signal?.lineSan,
  ];

  for (const candidate of sanCandidates) {
    const line = formatLineFromFen(fenAfterGameMove, candidate);
    if (line) return line;
  }

  const uciCandidates = [
    tags.relevantLineUci,
    tags.punishmentLineUci,
    tags.lineUci,
    tags.variationUci,
    signal?.relevantLineUci,
    signal?.punishmentLineUci,
    signal?.lineUci,
    signal?.variationUci,
  ];

  for (const candidate of uciCandidates) {
    const line = formatLineFromFen(fenAfterGameMove || item?.fenBefore, candidate);
    if (line) return line;
  }

  const messageLine = getLineTextFromMessage(signal?.message || signal?.text || signal?.reason || tags.message || tags.reason);
  if (messageLine) return messageLine;

  return "";
}

function buildMistakeWentWrongText(signal, item = {}) {
  const moveReference = getMoveReference(getMoveNumber(item?.ply), item?.san);
  const punishmentLine = getPunishmentLineFromSignal(signal, item);
  const materialTarget = getMaterialTargetFromSignal(signal);

  if (punishmentLine) {
    return `What went wrong: after ${moveReference}, the opponent can continue with ${punishmentLine}, leading to loss of ${materialTarget}.`;
  }

  return `What went wrong: ${moveReference} allowed a continuation where you lose material. Look for a safer move from the position before ${item?.san || "that move"}.`;
}

function getMaterialTargetFromSignal(signal) {
  const tags = signal?.tags || {};
  const value =
    tags.lostPiece ||
    tags.targetPiece ||
    tags.victimPiece ||
    tags.materialLost ||
    tags.materialLoss ||
    tags.materialPayoff;

  if (!value) return "material";
  if (typeof value === "string") return value;

  if (typeof value === "object") {
    return value.label || value.name || value.piece || value.type || "material";
  }

  return "material";
}

function getMoveReference(movePrefix, san) {
  const moveText = san || "the game move";
  return `${movePrefix} ${moveText}`.trim();
}

function getClearPuzzleSignal(item) {
  const clearTypes = new Set([
    "fork",
    "skewer",
    "validatedSkewer",
    "discoveredAttack",
    "discoveredCheck",
    "mateThreat",
    "materialGain",
    "capturePayoff",
    "tacticalSequence",
    "tacticalContinuation",
    "opponentTacticalReply",
    "greedyCapturePunishment",
    "continuationMaterialLoss",
    "continuationMaterialLossPayoff",
    "recapturePunishment",
  ]);

  return getSignals(item).find((signal) => {
    if (!signal?.type) return false;
    if (clearTypes.has(signal.type)) return true;

    // Pins, batteries, and remove-defender ideas are only good puzzle sources
    // when the analysis found a concrete payoff. Otherwise they can become
    // vague quiet-move puzzles that are hard to explain.
    if (["pin", "battery", "removeDefender"].includes(signal.type)) {
      return signalHasMaterialPayoff(signal);
    }

    return false;
  });
}

function hasTacticalSignal(item) {
  return Boolean(getClearPuzzleSignal(item));
}

function getPuzzleReasonFromSignal(signal, item, trainingType = getTrainingTypeFromSignal(signal)) {
  const bestSan = bestMoveToSan(item?.fenBefore, item?.bestMove) || item?.bestMove || "the engine move";
  const moveReference = getMoveReference(getMoveNumber(item?.ply), item?.san);

  if (trainingType === "mistakeReview") {
    const punishmentLine = getPunishmentLineFromSignal(signal, item);
    const materialTarget = getMaterialTargetFromSignal(signal);
    const lineText = punishmentLine
      ? ` After ${moveReference}, the opponent can continue with ${punishmentLine}, leading to loss of ${materialTarget}.`
      : ` ${moveReference} allowed a continuation where you lose material.`;

    return `Why ${moveReference} was a problem:${lineText} ${bestSan} was the safer move that avoids this.`;
  }

  switch (signal?.type) {
    case "fork":
      return `${bestSan} was a clearer tactical shot because it creates a fork.`;
    case "skewer":
    case "validatedSkewer":
      return `${bestSan} was stronger because it creates a skewer with concrete material pressure.`;
    case "discoveredAttack":
      return `${bestSan} was stronger because it creates a discovered attack.`;
    case "discoveredCheck":
      return `${bestSan} was stronger because it creates a forcing discovered check.`;
    case "mateThreat":
      return `${bestSan} was important because it creates, stops, or preserves a serious mating threat.`;
    case "materialGain":
    case "capturePayoff":
      return `${bestSan} was stronger because it wins material with a concrete payoff.`;
    case "tacticalSequence":
    case "tacticalContinuation":
      return `${bestSan} starts a concrete tactical sequence.`;
    case "opponentTacticalReply":
      return `${bestSan} avoids the tactical reply that punished the game move.`;
    case "greedyCapturePunishment":
      return `${bestSan} avoids the greedy-capture punishment from the game.`;
    case "continuationMaterialLoss":
    case "continuationMaterialLossPayoff":
      return `${bestSan} was the safer move that avoids the material-losing continuation allowed by the game move.`;
    case "recapturePunishment":
      return `${bestSan} avoids a recapture tactic that would punish the game move.`;
    case "pin":
      return `${bestSan} uses a pin with a concrete tactical payoff.`;
    case "battery":
      return `${bestSan} builds pressure with a battery that has a concrete payoff.`;
    case "removeDefender":
      return `${bestSan} removes or exploits a defender with a concrete tactical payoff.`;
    default:
      return `${bestSan} was the clearest tactical improvement in the position.`;
  }
}

function isPuzzleCandidate(item) {
  if (!item?.fenBefore || !item?.bestMove) return false;
  if (!item?.ply || !item?.side) return false;
  if (item.bestMove === item.lan) return false;
  if (!isLegalBestMove(item.fenBefore, item.bestMove)) return false;

  const loss = getLoss(item);
  const clearSignal = getClearPuzzleSignal(item);
  if (!clearSignal) return false;

  if (item.label === "Blunder") return loss >= 180;
  if (item.label === "Mistake") return loss >= 160;
  if (item.label === "Inaccuracy") return loss >= 240;

  return false;
}

function bestMoveToSan(fen, uci) {
  if (!fen || !uci || uci.length < 4) return "";

  try {
    const chess = new Chess(fen);
    const moveInput = {
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
    };

    if (uci[4]) moveInput.promotion = uci[4];

    const move = chess.move(moveInput);

    return move?.san || "";
  } catch {
    return "";
  }
}

function isLegalBestMove(fen, uci) {
  return Boolean(bestMoveToSan(fen, uci));
}

function getPositionKey(profileId, fenBefore, bestMove) {
  return `position-${profileId || "unknown"}-${hashText(`${fenBefore || ""}|${bestMove || ""}`)}`;
}

function getLineTokens(line) {
  if (!line) return [];
  if (Array.isArray(line)) return line.filter(Boolean);

  return String(line)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !/^\d+\.{1,3}$/.test(token))
    .filter((token) => !["1-0", "0-1", "1/2-1/2", "*"].includes(token));
}

function moveToUci(move) {
  if (!move?.from || !move?.to) return "";
  return `${move.from}${move.to}${move.promotion || ""}`;
}

function playToken(chess, token) {
  if (!chess || !token) return null;

  const cleanToken = String(token).trim();
  if (!cleanToken) return null;

  try {
    if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(cleanToken)) {
      const moveInput = {
        from: cleanToken.slice(0, 2),
        to: cleanToken.slice(2, 4),
      };

      if (cleanToken[4]) moveInput.promotion = cleanToken[4];
      return chess.move(moveInput);
    }

    return chess.move(cleanToken, { sloppy: true });
  } catch {
    return null;
  }
}

function isConcreteSolutionMove(move) {
  const san = String(move?.san || "");
  const uci = String(move?.uci || "");

  return (
    san.includes("x") ||
    san.includes("+") ||
    san.includes("#") ||
    san.includes("=") ||
    uci.length >= 5
  );
}

function trimSolutionLineForTraining(line, puzzleSide) {
  if (!Array.isArray(line) || line.length <= 1) return line;

  const trimmed = [line[0]];

  for (let index = 1; index < line.length; index += 1) {
    const move = line[index];

    if (move?.side !== puzzleSide) {
      const nextUserMove = line.slice(index + 1).find((candidate) => candidate?.side === puzzleSide);

      if (nextUserMove && !isConcreteSolutionMove(nextUserMove)) {
        break;
      }

      trimmed.push(move);
      continue;
    }

    if (!isConcreteSolutionMove(move)) break;
    trimmed.push(move);
  }

  return trimmed;
}

function buildPuzzleSolutionLine(item, maxPlies = 4) {
  if (!item?.fenBefore || !item?.bestMove) return [];

  const sourceLine =
    item.bestLine ||
    item.pv ||
    item.bestContinuation ||
    item.relevantContinuationUci ||
    item.relevantContinuation ||
    item.bestMove;

  const rawTokens = getLineTokens(sourceLine);
  const tokens = rawTokens.length ? rawTokens : [item.bestMove];

  // Make sure the first required move is the actual best move from the puzzle.
  if (tokens[0] !== item.bestMove) {
    tokens.unshift(item.bestMove);
  }

  const chess = new Chess(item.fenBefore);
  const line = [];

  for (const token of tokens) {
    if (line.length >= maxPlies) break;

    const fenBefore = chess.fen();
    const move = playToken(chess, token);
    if (!move) continue;

    line.push({
      uci: moveToUci(move),
      san: move.san,
      side: move.color,
      fenBefore,
      fenAfter: chess.fen(),
    });
  }

  if (!line.length || line[0].uci !== item.bestMove) {
    try {
      const fallback = new Chess(item.fenBefore);
      const move = playToken(fallback, item.bestMove);
      if (!move) return [];

      return [
        {
          uci: moveToUci(move),
          san: move.san,
          side: move.color,
          fenBefore: item.fenBefore,
          fenAfter: fallback.fen(),
        },
      ];
    } catch {
      return [];
    }
  }

  return trimSolutionLineForTraining(line, item.side);
}

function estimatePuzzleDifficulty(item) {
  const loss = getLoss(item);
  let difficulty = 1000;

  if (item.label === "Mistake") difficulty += 180;
  if (item.label === "Blunder") difficulty += 320;
  if (item.label === "Inaccuracy") difficulty += 260;
  if (hasTacticalSignal(item)) difficulty += 220;

  difficulty += Math.min(650, Math.round(loss * 1.35));

  return Math.max(900, Math.min(2400, Math.round(difficulty / 50) * 50));
}

function getPuzzleQualityTags(item, signal, solutionLine, trainingType) {
  return [
    getTrainingTypeLabel(trainingType),
    item?.label || "Mistake",
    getSignalDisplayLabel(signal),
    solutionLine?.length > 1 ? "line" : "single move",
  ].filter(Boolean);
}

function getPuzzleDebugReason(item, signal, solutionLine, trainingType) {
  const loss = Math.round(getLoss(item));
  const lineLength = Array.isArray(solutionLine) ? solutionLine.length : 0;

  if (trainingType === "mistakeReview") {
    const punishmentLine = getPunishmentLineFromSignal(signal, item);
    const punishmentText = punishmentLine ? ` Punishment line: ${punishmentLine}.` : "";
    return `Selected as a Mistake Review because the game move was a ${item?.label || "mistake"} with ${loss} cp loss and it allowed a material-losing continuation. Review line length: ${lineLength}.${punishmentText}`;
  }

  return `Selected as a Tactical Puzzle because it is a ${item?.label || "mistake"} with ${loss} cp loss and a clear ${getSignalDisplayLabel(signal)} signal. Solution line length: ${lineLength}.`;
}

function buildPuzzleFromAnalysisItem({ item, profileId, gameId, gameTitle, sourceMode }) {
  const bestMoveSan = bestMoveToSan(item.fenBefore, item.bestMove);
  const movePrefix = getMoveNumber(item.ply);
  const loss = Math.round(getLoss(item));
  const clearSignal = getClearPuzzleSignal(item);
  const solutionLine = buildPuzzleSolutionLine(item, 4);
  const positionKey = getPositionKey(profileId, item.fenBefore, item.bestMove);
  const id = `puzzle-${profileId}-${hashText(`${gameId}|${item.fenBefore}|${item.bestMove}`)}`;
  const trainingType = getTrainingTypeFromSignal(clearSignal);
  const reason = getPuzzleReasonFromSignal(clearSignal, item, trainingType);
  const qualityTags = getPuzzleQualityTags(item, clearSignal, solutionLine, trainingType);
  const moveReference = getMoveReference(movePrefix, item.san);
  const title = trainingType === "mistakeReview"
    ? `Instead of ${moveReference}, find a safer move`
    : `Instead of ${moveReference}, find the best move`;
  const prompt = trainingType === "mistakeReview"
    ? "Find a safer move that avoids the material-losing continuation."
    : "Find the better move you missed from the position before your game move.";
  const punishmentLine = trainingType === "mistakeReview" ? getPunishmentLineFromSignal(clearSignal, item) : "";
  const materialTarget = trainingType === "mistakeReview" ? getMaterialTargetFromSignal(clearSignal) : "";
  const whatWentWrong = trainingType === "mistakeReview" ? buildMistakeWentWrongText(clearSignal, item) : "";

  return {
    id,
    positionKey,
    profileId,
    gameId: gameId || "unknown-game",
    gameTitle: gameTitle || "Analyzed game",
    sourceMode: sourceMode || "unknown",
    createdAt: new Date().toISOString(),
    ply: item.ply,
    side: item.side,
    fenBefore: item.fenBefore,
    bestMove: item.bestMove,
    bestMoveSan,
    solutionLine,
    playedMove: item.lan || "",
    playedSan: item.san || "",
    label: item.label || "Mistake",
    cpLoss: loss,
    difficulty: estimatePuzzleDifficulty(item),
    trainingType,
    trainingTypeLabel: getTrainingTypeLabel(trainingType),
    title,
    prompt,
    reason,
    reasonType: clearSignal?.type || null,
    reasonLabel: getSignalDisplayLabel(clearSignal),
    punishmentLine,
    materialTarget,
    whatWentWrong,
    qualityTags,
    debugReason: getPuzzleDebugReason(item, clearSignal, solutionLine, trainingType),
    status: "unsolved",
    attempts: 0,
    solvedCount: 0,
    failedCount: 0,
    lastAttemptAt: null,
  };
}

function isLegacyYouValue(value) {
  const text = String(value || "").trim().toLowerCase();
  return text === "you";
}

function getLegacyYouSide(snapshot = {}) {
  const meta = snapshot.meta || {};
  const headers = snapshot.gameData?.headers || {};
  const white = meta.white || headers.White || "";
  const black = meta.black || headers.Black || "";

  if (isLegacyYouValue(white)) return "w";
  if (isLegacyYouValue(black)) return "b";

  // Old Play with Coach / Play Game saves often had no profile ids but used
  // sourceMode + default names. Treat those as belonging to the active profile
  // only for puzzle sync; this does not rewrite Game History metadata.
  if (snapshot.sourceMode === "coach") return "w";
  if (snapshot.sourceMode === "play") return "w";

  return null;
}

function getNamedUserSide(snapshot = {}, fallbackProfileName = "") {
  const meta = snapshot.meta || {};
  const headers = snapshot.gameData?.headers || {};
  const white = meta.white || headers.White || "";
  const black = meta.black || headers.Black || "";
  const possibleNames = [
    meta.userName,
    meta.profileName,
    fallbackProfileName,
  ].filter(Boolean);

  if (possibleNames.some((name) => samePlayerName(name, white))) return "w";
  if (possibleNames.some((name) => samePlayerName(name, black))) return "b";

  return null;
}

function getProfileTargets(snapshot = {}, { fallbackProfileId, fallbackProfileName } = {}) {
  const targets = [];
  const seen = new Set();
  const meta = snapshot.meta || {};

  function addTarget(profileId, side, extra = {}) {
    if (!profileId || !side) return;

    const key = `${profileId}-${side}`;
    if (seen.has(key)) return;

    seen.add(key);
    targets.push({ profileId, side, ...extra });
  }

  if (snapshot.sourceMode === "coach" && meta.profileId) {
    addTarget(meta.profileId, "w");
  }

  if (snapshot.sourceMode === "play" || snapshot.sourceMode === "review") {
    addTarget(meta.whiteProfileId, "w");
    addTarget(meta.blackProfileId, "b");
  }

  // Review/imported games often only know the active profile id/name, not
  // whiteProfileId or blackProfileId. When the saved player name matches one
  // side, we can safely attach those missed-move puzzles to that profile.
  if ((snapshot.sourceMode === "review" || snapshot.sourceMode === "unknown") && (meta.profileId || fallbackProfileId)) {
    const namedSide = getNamedUserSide(snapshot, fallbackProfileName);
    addTarget(meta.profileId || fallbackProfileId, namedSide, { isNameMatched: Boolean(namedSide) });
  }

  if (!targets.length && fallbackProfileId) {
    const legacySide = getLegacyYouSide(snapshot);
    if (legacySide) {
      addTarget(fallbackProfileId, legacySide, { isLegacyYou: true });
    }
  }

  return targets;
}


export function getPuzzles(profileId) {
  const puzzles = getAllPuzzles();

  return puzzles
    .filter((puzzle) => !profileId || puzzle.profileId === profileId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function saveGeneratedPuzzlesFromSnapshot(snapshot, analysis = [], { limit = 200, fallbackProfileId = null, fallbackProfileName = "" } = {}) {
  if (!snapshot?.id || !Array.isArray(analysis) || !analysis.length) return [];

  const targets = getProfileTargets(snapshot, { fallbackProfileId, fallbackProfileName });
  if (!targets.length) return [];

  const generated = [];

  targets.forEach(({ profileId, side }) => {
    const profilePuzzles = analysis
      .filter((item) => item.side === side)
      .filter(isPuzzleCandidate)
      .slice(0, 8)
      .map((item) =>
        buildPuzzleFromAnalysisItem({
          item,
          profileId,
          gameId: snapshot.id,
          gameTitle: snapshot.title,
          sourceMode: snapshot.sourceMode,
        })
      );

    generated.push(...profilePuzzles);
  });

  if (!generated.length) return [];

  const existing = getAllPuzzles();
  const existingById = new Map(existing.map((puzzle) => [puzzle.id, puzzle]));
  const existingIdByPositionKey = new Map(
    existing
      .filter((puzzle) => puzzle.positionKey || (puzzle.profileId && puzzle.fenBefore && puzzle.bestMove))
      .map((puzzle) => [
        puzzle.positionKey || getPositionKey(puzzle.profileId, puzzle.fenBefore, puzzle.bestMove),
        puzzle.id,
      ])
  );
  const newlySaved = [];

  generated.forEach((puzzle) => {
    const duplicateId = existingIdByPositionKey.get(puzzle.positionKey);
    const storageId = duplicateId || puzzle.id;
    const existingPuzzle = existingById.get(storageId);

    if (!existingPuzzle) {
      newlySaved.push({ ...puzzle, id: storageId });
    }

    existingById.set(storageId, {
      ...puzzle,
      id: storageId,
      ...(existingPuzzle
        ? {
            createdAt: existingPuzzle.createdAt || puzzle.createdAt,
            status: existingPuzzle.status || puzzle.status,
            attempts: existingPuzzle.attempts || 0,
            solvedCount: existingPuzzle.solvedCount || 0,
            failedCount: existingPuzzle.failedCount || 0,
            lastAttemptAt: existingPuzzle.lastAttemptAt || null,
            solutionLine: existingPuzzle.solutionLine?.length ? existingPuzzle.solutionLine : puzzle.solutionLine,
          }
        : {}),
    });

    existingIdByPositionKey.set(puzzle.positionKey, storageId);
  });

  const nextPuzzles = Array.from(existingById.values())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);

  saveAllPuzzles(nextPuzzles);
  return newlySaved;
}

export function updatePuzzleAttempt(profileId, puzzleId, { solved } = {}) {
  const puzzles = getAllPuzzles();
  let updatedPuzzle = null;

  const nextPuzzles = puzzles.map((puzzle) => {
    if (puzzle.id !== puzzleId || puzzle.profileId !== profileId) return puzzle;

    updatedPuzzle = {
      ...puzzle,
      status: solved ? "solved" : "failed",
      attempts: (Number(puzzle.attempts) || 0) + 1,
      solvedCount: (Number(puzzle.solvedCount) || 0) + (solved ? 1 : 0),
      failedCount: (Number(puzzle.failedCount) || 0) + (solved ? 0 : 1),
      lastAttemptAt: new Date().toISOString(),
    };

    return updatedPuzzle;
  });

  saveAllPuzzles(nextPuzzles);
  return { puzzle: updatedPuzzle, puzzles: nextPuzzles };
}

export function deletePuzzle(profileId, puzzleId) {
  const nextPuzzles = getAllPuzzles().filter(
    (puzzle) => !(puzzle.profileId === profileId && puzzle.id === puzzleId)
  );

  saveAllPuzzles(nextPuzzles);
  return getPuzzles(profileId);
}

export function syncPuzzlesFromAnalyzedGames(savedGames = [], { profileId, profileName = "", limit = 200 } = {}) {
  const games = Array.isArray(savedGames) ? savedGames : [];
  const beforeIds = new Set(getAllPuzzles().map((puzzle) => puzzle.id));
  let scannedCount = 0;
  let analyzedMoveCount = 0;
  let candidateCount = 0;
  let skippedGameCount = 0;

  games.forEach((game) => {
    const analysis = Array.isArray(game?.analysis) ? game.analysis : [];

    if (!game?.id || !analysis.length) {
      skippedGameCount += 1;
      return;
    }

    const targets = getProfileTargets(game, { fallbackProfileId: profileId, fallbackProfileName: profileName }).filter((target) =>
      !profileId || target.profileId === profileId
    );

    if (profileId && !targets.length) {
      skippedGameCount += 1;
      return;
    }

    scannedCount += 1;
    analyzedMoveCount += analysis.length;
    candidateCount += targets.reduce((count, target) => (
      count + analysis.filter((item) => item.side === target.side).filter(isPuzzleCandidate).length
    ), 0);

    saveGeneratedPuzzlesFromSnapshot(game, analysis, { limit, fallbackProfileId: profileId, fallbackProfileName: profileName });
  });

  const afterPuzzles = getAllPuzzles();
  const generatedCount = afterPuzzles.filter((puzzle) => !beforeIds.has(puzzle.id)).length;

  return {
    generatedCount,
    scannedCount,
    skippedGameCount,
    analyzedMoveCount,
    candidateCount,
    puzzles: profileId ? getPuzzles(profileId) : afterPuzzles,
  };
}
