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
      case "check":
        return "This gives check to the king.";

      case "castle":
        return "This castles the king to safety.";

      case "recapture": {
        const target = signal.targets?.[0];
        if (!target) return "This recaptures.";

        const name = getPieceName(target.piece) || "piece";
        return `This recaptures the ${name}${target.square ? ` on ${target.square}` : ""}.`;
      }

      case "capture": {
        const target = signal.targets?.[0];
        if (!target) return "This captures a piece.";

        const name = getPieceName(target.piece) || "piece";
        return `This captures the ${name}${target.square ? ` on ${target.square}` : ""}.`;
      }
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

      if (signal.reason === "recapture") {
        return `This loses a ${name} to an immediate recapture.`;
      }

      if (signal.reason === "undefended") {
        return `This allows the ${name} to become undefended and is lost.`;
      }

      return `This loses a ${name}.`;
    }

    case "hanging": {
      const target = signal.targets?.[0];
      if (!target) return "";

      const name = getPieceName(target.piece) || "piece";
      return `This leaves the ${name} on ${target.square} undefended.`;
    }

    case "enemyPressure": {
      const target = signal.targets?.[0];
      if (!target) return "";

      const name = getPieceName(target.piece) || "piece";

      if (!target.isDefended) {
        return `This leaves the ${name} on ${target.square} undefended.`;
      }

      return `This leaves the ${name} on ${target.square} under pressure.`;
    }

    case "discoveredCheck": {
      const attacker = getPieceName(signal.tags?.attacker) || "piece";
      return `This opens a discovered check from the ${attacker}.`;
    }
    case "discoveredAttack": {
      const target = signal.targets?.[0];
      if (!target) return "";

      const attacker = getPieceName(signal.tags?.attacker) || "piece";
      const targetName = getPieceName(target.piece) || "piece";

      return `This opens a discovered attack from the ${attacker} on the ${targetName} on ${target.square}.`;
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

    case "pin": {
      const target = signal.targets?.[0];
      const name = getPieceName(target?.piece) || "piece";
      const pinnedTo = signal.tags?.pinnedTo || "king";

      return `This pins the ${name} on ${target.square} to the ${pinnedTo}.`;
    }
    case "unpin": {
      const target = signal.targets?.[0];
      const name = getPieceName(target?.piece) || "piece";

      return `This breaks the pin on the ${name} on ${target.square}.`;
    }
    case "ignoredAttack": {
      if (!signal.targets?.length) return "";

      const text = signal.targets
        .map(formatTarget)
        .join(" and ");

      return `This ignores the attack on ${text}.`;
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