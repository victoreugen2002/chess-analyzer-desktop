import { useState } from "react";
import { Chess } from "chess.js";

export function useLinePreview(sounds) {
  const [previewFen, setPreviewFen] = useState(null);
  const [previewTimeouts, setPreviewTimeouts] = useState([]);

  function clearPreviewPlayback() {
    previewTimeouts.forEach((id) => clearTimeout(id));
    setPreviewTimeouts([]);
  }

  function resetPreview() {
    clearPreviewPlayback();
    setPreviewFen(null);
  }

  function playLinePreview(fen, line) {
    if (!fen || !line || line === "—") return;

    clearPreviewPlayback();

    try {
      const chess = new Chess(fen);
      const moves = line.split(/\s+/).filter(Boolean).slice(0, 10);

      setPreviewFen(chess.fen());

      const timeouts = moves.map((uci, index) =>
        setTimeout(() => {
          const moveObj = {
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
          };

          if (uci.length > 4) moveObj.promotion = uci[4];

          const move = chess.move(moveObj);

          if (move) {
            setPreviewFen(chess.fen());
            sounds.playFromSan(move.san);
          }
        }, (index + 1) * 700)
      );

      setPreviewTimeouts(timeouts);
    } catch {}
  }

  return {
    previewFen,
    resetPreview,
    playLinePreview,
  };
}