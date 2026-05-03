import { buildMoveObjectsFromPgn } from "../pgn/pgnParser";
import { getBoardPixelSize } from "../ui/uiHelpers";
import { START_PGN } from "../pgn/samplePgn";

export function runSelfTests() {
  const results = [];

  try {
    const parsed = buildMoveObjectsFromPgn(START_PGN);
    results.push({ name: "Parses sample PGN", pass: parsed.moves.length > 0 });
  } catch {
    results.push({ name: "Parses sample PGN", pass: false });
  }

  try {
    const width = getBoardPixelSize(400);
    results.push({
      name: "Calculates mobile board size",
      pass: width >= 280 && width <= 368,
    });
  } catch {
    results.push({
      name: "Calculates mobile board size",
      pass: false,
    });
  }

  return results;
}