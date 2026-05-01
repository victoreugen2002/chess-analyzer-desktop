export function formatEval(cp) {
  if (cp == null || Number.isNaN(cp)) return "—";

  if (cp >= 99000) return "Mate for White";
  if (cp <= -99000) return "Mate for Black";

  return `${cp > 0 ? "+" : ""}${(cp / 100).toFixed(2)}`;
}