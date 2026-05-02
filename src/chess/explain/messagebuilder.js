import { getPieceName } from "../core/pieces";

function formatTarget(t) {
  const name = t.name || getPieceName(t.piece?.type || t.piece) || "piece";
  return `the ${name}${t.square ? ` on ${t.square}` : ""}`;
}

export function buildCoachMessage(signal) {
  if (!signal) return "";

  switch (signal.type) {
    case "mateThreat":
      return signal.tags?.opponent
        ? "This allows a checkmate in one."
        : "This creates a checkmate threat.";

    case "materialGain": {
      const target = signal.targets?.[0];
      const name = getPieceName(target?.piece || signal.piece) || "piece";

      if (signal.tags?.recapture) {
        return `This recaptures the ${name}.`;
      }

      return `This wins a ${name}.`;
    }

    case "materialLoss": {
      const target = signal.targets?.[0];
      const name = getPieceName(target?.piece || signal.piece) || "piece";
      return `This loses a ${name}.`;
    }

    case "moveToSafety": {
      const piece = getPieceName(signal.tags?.piece);
      const attacker = getPieceName(signal.tags?.attacker);

      if (piece && attacker) {
        return `This moves the ${piece} away from a ${attacker} attack.`;
      }

      if (piece) {
        return `This moves the ${piece} to safety.`;
      }

      return "This moves the piece to safety.";
    }

    case "battery": {
      if (!signal.targets?.length) return "This creates battery pressure.";

      const text = signal.targets.map(formatTarget).join(" and ");
      return `This creates battery pressure on ${text}.`;
    }

    case "attack": {
      if (!signal.targets?.length) return "";

      const text = signal.targets.map(formatTarget).join(" and ");

      if (!text) return "";

      if (signal.tags?.fork) {
        return `This creates a fork, attacking ${text}.`;
      }

      if (signal.tags?.multiple) {
        return `This attacks multiple pieces: ${text}.`;
      }

      return `This attacks ${text}.`;
    }

    default:
      return "";
  }
}