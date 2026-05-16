import { useState } from "react";
import { Chess } from "chess.js";

export function getLineTokens(line) {
  if (!line || line === "—") return [];

  if (Array.isArray(line)) return line.filter(Boolean);

  return String(line)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !/^\d+\.{1,3}$/.test(token))
    .filter((token) => !["1-0", "0-1", "1/2-1/2", "*"].includes(token));
}

export function joinLineTokens(line, maxMoves = 6) {
  return getLineTokens(line).slice(0, maxMoves).join(" ");
}

function sameMoveToken(a, b) {
  if (!a || !b) return false;
  return String(a).replace(/[+#?!]+$/g, "") === String(b).replace(/[+#?!]+$/g, "");
}

export function buildRelevantPreviewLine({
  playedMove = "",
  playedSan = "",
  relevantLine = "",
  fallbackLine = "",
  includePlayedMove = true,
  maxMoves = 6,
} = {}) {
  const lineTokens = getLineTokens(relevantLine || fallbackLine).slice(0, maxMoves);

  if (!includePlayedMove || !playedMove) {
    return lineTokens.join(" ");
  }

  const firstToken = lineTokens[0] || "";

  if (sameMoveToken(firstToken, playedMove) || sameMoveToken(firstToken, playedSan)) {
    return lineTokens.join(" ");
  }

  return [playedMove, ...lineTokens].filter(Boolean).slice(0, maxMoves + 1).join(" ");
}

function playLineToken(chess, token) {
  if (!chess || !token) return null;

  try {
    if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(token)) {
      return chess.move({
        from: token.slice(0, 2),
        to: token.slice(2, 4),
        promotion: token[4] || undefined,
      });
    }

    return chess.move(token, { sloppy: true });
  } catch {
    return null;
  }
}

function buildPreviewMoves(fen, line, maxMoves = 10) {
  if (!fen || !line || line === "—") return [];

  try {
    const chess = new Chess(fen);
    const tokens = getLineTokens(line).slice(0, maxMoves);
    const moves = [];

    for (const token of tokens) {
      const move = playLineToken(chess, token);
      if (!move) break;

      moves.push({
        token,
        san: move.san,
        fenAfter: chess.fen(),
      });
    }

    return moves;
  } catch {
    return [];
  }
}

function buildPreviewInfo({ label, moves, index, isPlaying }) {
  const currentMove = index > 0 ? moves[index - 1] : null;

  return {
    label: label || "Line preview",
    current: index,
    total: moves.length,
    currentSan: currentMove?.san || null,
    lineSan: moves.map((move) => move.san).join(" "),
    isPlaying: Boolean(isPlaying),
    canStepBack: index > 0,
    canStepForward: index < moves.length,
  };
}

export function useLinePreview(sounds) {
  const [previewFen, setPreviewFen] = useState(null);
  const [previewInfo, setPreviewInfo] = useState(null);
  const [previewTimeouts, setPreviewTimeouts] = useState([]);
  const [previewState, setPreviewState] = useState(null);

  function clearPreviewPlayback() {
    previewTimeouts.forEach((id) => clearTimeout(id));
    setPreviewTimeouts([]);
  }

  function setPreviewPosition(nextState, index, { playSound = false, isPlaying = false } = {}) {
    if (!nextState?.moves?.length) return;

    const safeIndex = Math.max(0, Math.min(index, nextState.moves.length));
    const nextFen = safeIndex === 0 ? nextState.startFen : nextState.moves[safeIndex - 1].fenAfter;
    const nextInfo = buildPreviewInfo({
      label: nextState.label,
      moves: nextState.moves,
      index: safeIndex,
      isPlaying,
    });

    setPreviewFen(nextFen);
    setPreviewInfo(nextInfo);
    setPreviewState({ ...nextState, index: safeIndex });

    if (playSound && safeIndex > 0) {
      sounds?.playFromSan?.(nextState.moves[safeIndex - 1]?.san);
    }
  }

  function resetPreview() {
    clearPreviewPlayback();
    setPreviewFen(null);
    setPreviewInfo(null);
    setPreviewState(null);
  }

  function stepPreviewBack() {
    if (!previewState) return;
    clearPreviewPlayback();
    setPreviewPosition(previewState, previewState.index - 1, { isPlaying: false });
  }

  function stepPreviewForward() {
    if (!previewState) return;
    clearPreviewPlayback();
    setPreviewPosition(previewState, previewState.index + 1, {
      isPlaying: false,
      playSound: true,
    });
  }

  function playLinePreview(fen, line, options = {}) {
    if (!fen || !line || line === "—") return;

    clearPreviewPlayback();

    const moves = buildPreviewMoves(fen, line, options.maxMoves || 6);
    if (!moves.length) {
      setPreviewFen(null);
      setPreviewInfo(null);
      setPreviewState(null);
      return;
    }

    const state = {
      startFen: fen,
      label: options.label || "Line preview",
      moves,
      index: 0,
    };

    setPreviewPosition(state, 0, { isPlaying: true });

    const timeouts = moves.map((move, index) =>
      setTimeout(() => {
        setPreviewPosition(state, index + 1, { isPlaying: index + 1 < moves.length });
        sounds?.playFromSan?.(move.san);
      }, (index + 1) * (options.delayMs || 700))
    );

    setPreviewTimeouts(timeouts);
  }

  return {
    previewFen,
    previewInfo,
    resetPreview,
    playLinePreview,
    stepPreviewBack,
    stepPreviewForward,
  };
}
