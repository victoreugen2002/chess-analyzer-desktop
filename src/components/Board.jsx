import React, { useMemo } from "react";
import woodBoard from "../assets/wood-board.png";
import wp from "../assets/pieces/wp.png";
import wn from "../assets/pieces/wn.png";
import wb from "../assets/pieces/wb.png";
import wr from "../assets/pieces/wr.png";
import wq from "../assets/pieces/wq.png";
import wk from "../assets/pieces/wk.png";
import bp from "../assets/pieces/bp.png";
import bn from "../assets/pieces/bn.png";
import bb from "../assets/pieces/bb.png";
import br from "../assets/pieces/br.png";
import bq from "../assets/pieces/bq.png";
import bk from "../assets/pieces/bk.png";
import { fenToBoardRows } from "../chess/utils";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

const pieceImages = {
  wp, wn, wb, wr, wq, wk,
  bp, bn, bb, br, bq, bk,
};

function ChessPiece({ piece, size }) {
  if (!piece) return null;

  const src = pieceImages[piece];

  return (
    <img
      src={src}
      alt={piece}
      style={{
        width: size * 0.92,
        height: size * 0.92,
        objectFit: "contain",
        pointerEvents: "none",
      }}
    />
  );
}

export default function Board({ fen, size }) {
  const rows = useMemo(() => fenToBoardRows(fen), [fen]);
  const cellSize = Math.floor(size / 8);

  return (
    <div className="board-shell">
      <div className="board-head">
        <span>Board</span>
        <span>White at bottom</span>
      </div>
      <div
        className="board-grid"
        style={{
          width: cellSize * 8,
          height: cellSize * 8,
          gridTemplateColumns: "repeat(8, 1fr)",
          backgroundImage: `url(${woodBoard})`,
          backgroundSize: "100% 100%",
          backgroundRepeat: "no-repeat",
        }}
      >
        {rows.map((row, rowIndex) =>
          row.map((piece, colIndex) => {
            const isLight = (rowIndex + colIndex) % 2 === 0;
            const file = FILES[colIndex];
            const rank = 8 - rowIndex;

            return (
              <div
                key={`${rowIndex}-${colIndex}`}
                className={`board-cell ${isLight ? "board-cell--light" : "board-cell--dark"}`}
                style={{ width: cellSize, height: cellSize }}
              >
                {rowIndex === 7 && (
                  <span className={`coord coord--file ${isLight ? "coord--light" : "coord--dark"}`}>
                    {file}
                  </span>
                )}
                {colIndex === 0 && (
                  <span className={`coord coord--rank ${isLight ? "coord--light" : "coord--dark"}`}>
                    {rank}
                  </span>
                )}
                <ChessPiece piece={piece} size={cellSize} />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}