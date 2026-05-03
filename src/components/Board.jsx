import React, { useMemo, useState } from "react";
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
import { fenToBoardRows, uciLineToSanLine } from "../chess/utils";

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

export default function Board({ fen, size, hoveredMove, highlights = {}, arrowFrom, arrowTo, onSquareClick, onMove }) {
  const rows = useMemo(() => fenToBoardRows(fen), [fen]);
  const cellSize = Math.floor(size / 8);
  const boardPixelSize = cellSize * 8;
  const [dragFrom, setDragFrom] = useState(null);

  const firstMove = hoveredMove?.bestContinuation?.split(" ")[0];
  const playedMove = hoveredMove?.lan;

  const shouldShowBestMove =
    firstMove && playedMove && firstMove !== playedMove;

  let highlightFrom = null;
  let highlightTo = null;

  if (shouldShowBestMove && firstMove.length >= 4) {
    highlightFrom = firstMove.slice(0, 2);
    highlightTo = firstMove.slice(2, 4);
  }

  function squareToCenter(square) {
    if (!square) return null;

    const file = square.charCodeAt(0) - 97;
    const rank = Number(square[1]);

    return {
      x: file * cellSize + cellSize / 2,
      y: (8 - rank) * cellSize + cellSize / 2,
    };
  }

  const computedArrowFrom = arrowFrom || squareToCenter(highlightFrom);
  const computedArrowTo = arrowTo || squareToCenter(highlightTo);


  return (
    <div className="board-shell">
      <div className="board-head">
        <span>Board</span>
        <span>White at bottom</span>
      </div>

      <div
        className="board-wrap"
        style={{ width: boardPixelSize, height: boardPixelSize }}
      >
        <div
          className="board-grid"
          style={{
            width: boardPixelSize,
            height: boardPixelSize,
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
              const square = file + rank;
              const highlightType = highlights[square];
              return (
                <div
                  key={`${rowIndex}-${colIndex}`}
                  onClick={() => onSquareClick?.(square)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();

                    const fromSquare = e.dataTransfer.getData("text/plain") || dragFrom;

                    if (!fromSquare || fromSquare === square) {
                      setDragFrom(null);
                      return;
                    }

                    onMove?.(fromSquare, square);
                    setDragFrom(null);
                  }}
                      
  
                  className={`
                    board-cell
                    ${isLight ? "board-cell--light" : "board-cell--dark"}
                    ${square === highlightFrom ? "highlight-from" : ""}
                    ${square === highlightTo ? "highlight-to" : ""}
                    ${highlightType ? `signal-highlight signal-highlight--${highlightType}` : ""}
                  `}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      backgroundColor:
                        square === highlightFrom
                          ? "rgba(255, 200, 0, 0.35)"
                          : square === highlightTo
                          ? "rgba(0, 200, 255, 0.35)"
                          : undefined
                    }}
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

                  <div
                    draggable={!!piece}
                    onDragStart={(e) => {
                      if (!piece) return;

                      e.dataTransfer.setData("text/plain", square);
                      e.dataTransfer.effectAllowed = "move";
                      setDragFrom(square);

                      const dragImg = document.createElement("img");
                      dragImg.src = pieceImages[piece];
                      dragImg.style.width = `${cellSize * 0.92}px`;
                      dragImg.style.height = `${cellSize * 0.92}px`;
                      dragImg.style.position = "absolute";
                      dragImg.style.top = "-1000px";
                      dragImg.style.pointerEvents = "none";
                      dragImg.style.opacity = "1";

                      document.body.appendChild(dragImg);

                      e.dataTransfer.setDragImage(
                        dragImg,
                        (cellSize * 0.92) / 2,
                        (cellSize * 0.92) / 2
                      );

                      requestAnimationFrame(() => {
                        document.body.removeChild(dragImg);
                      });
                    }}
                  >
                  <div style={{ opacity: dragFrom === square ? 0 : 1 }}>
                    <ChessPiece piece={piece} size={cellSize} />
                  </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {computedArrowFrom && computedArrowTo && (
          <svg
            className="board-arrow-layer"
            width={boardPixelSize}
            height={boardPixelSize}
            viewBox={`0 0 ${boardPixelSize} ${boardPixelSize}`}
          >
            <defs>
              <marker
                id="arrowhead"
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="5"
                orient="auto"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" />
              </marker>
            </defs>

            <line
              x1={computedArrowFrom.x}
              y1={computedArrowFrom.y}
              x2={computedArrowTo.x}
              y2={computedArrowTo.y}
              markerEnd="url(#arrowhead)"
            />
          </svg>
        )}
      </div>
    </div>
  );
}