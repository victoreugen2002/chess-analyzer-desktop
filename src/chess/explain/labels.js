export function getLabelFromEval(loss) {
  if (!Number.isFinite(loss)) return "Good";

  if (loss >= 300) return "Blunder";  
  if (loss >= 150) return "Mistake";
  if (loss >= 60) return "Inaccuracy";


  return "Good";
}

export function getAdvantageSide(evalCp) {
  if (!Number.isFinite(evalCp)) return "equal";
  if (evalCp > 80) return "white";
  if (evalCp < -80) return "black";
  return "equal";
}