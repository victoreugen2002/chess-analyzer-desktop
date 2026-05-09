import { Chess } from "chess.js";

export function getLineTokens(line) {
  if (!line) return [];

  if (Array.isArray(line)) return line.filter(Boolean);

  return String(line)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !/^\d+\.{1,3}$/.test(token))
    .filter((token) => !["1-0", "0-1", "1/2-1/2", "*"].includes(token));
}

export function playUci(chess, uci) {
  if (!chess || !uci || !/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(uci)) {
    return null;
  }

  try {
    const move = {
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
    };

    if (uci[4]) {
      move.promotion = uci[4];
    }

    return chess.move(move);
  } catch {
    return null;
  }
}

export function playSan(chess, san) {
  if (!chess || !san) return null;

  try {
    return chess.move(san, { sloppy: true });
  } catch {
    return null;
  }
}

export function playMoveToken(chess, token) {
  if (!chess || !token) return null;

  const cleanToken = String(token).trim();
  if (!cleanToken) return null;

  if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(cleanToken)) {
    return playUci(chess, cleanToken);
  }

  return playSan(chess, cleanToken);
}

export function buildLegalContinuation({ fen, line, maxPlies = 4 }) {
  if (!fen || !line) return [];

  const tokens = getLineTokens(line);
  if (!tokens.length) return [];

  const chess = new Chess(fen);
  const moves = [];

  for (const token of tokens) {
    if (moves.length >= maxPlies) break;

    try {
      const fenBefore = chess.fen();
      const move = playMoveToken(chess, token);

      if (!move) {
        continue;
      }

      moves.push({
        ...move,
        fenBefore,
        fenAfter: chess.fen(),
        token,
      });
    } catch {
      continue;
    }
  }

  return moves;
}