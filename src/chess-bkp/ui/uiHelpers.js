export function getMoveSymbol(label) {
  if (label === "Blunder") return "??";
  if (label === "Mistake") return "?";
  if (label === "Inaccuracy") return "?!";
  return "";
}

export function getMoveBadgeClass(label) {
  if (label === "Blunder") return "badge badge--blunder";
  if (label === "Mistake") return "badge badge--mistake";
  if (label === "Inaccuracy") return "badge badge--inaccuracy";
  return "";
}

export function getProgressWidth(cp) {
  if (cp == null || Number.isNaN(cp)) return 50;
  const normalized = Math.max(-600, Math.min(600, cp));
  return 50 + normalized / 12;
}

export function getBoardPixelSize(viewportWidth) {
  const vh = window.innerHeight;
  if (!viewportWidth) return 520;
  return Math.min(viewportWidth - 80, vh - 430);
}