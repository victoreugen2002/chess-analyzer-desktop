import { getPieceName } from "../core/pieces";

function formatTarget(t) {
  const name = t.name || getPieceName(t.piece?.type || t.piece) || "piece";
  return `the ${name}${t.square ? ` on ${t.square}` : ""}`;
}

function formatPieceList(targets = []) {
  const names = targets
    .map((target) => getPieceName(target?.piece) || "piece")
    .filter(Boolean);

  if (!names.length) return "material";
  if (names.length === 1) return `the ${names[0]}`;

  return `the ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
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


    case "opponentTacticalReply": {
      const replySan = signal.tags?.replySan;
      const motifText = signal.tags?.motifText || "with a tactical response";
      const moveAttackText = signal.tags?.moveAttackText;

      if (!replySan) return "";

      if (moveAttackText) {
        return `${moveAttackText}, but it allows ${replySan}, ${motifText}.`;
      }

      return `This allows ${replySan}, ${motifText}.`;
    }

    case "greedyCapturePunishment": {
      const exposedName = signal.tags?.exposedPieceName || getPieceName(signal.tags?.exposedPiece) || "piece";
      const exposedSquare = signal.tags?.exposedSquare || signal.targets?.[0]?.square;
      const greedySide = signal.tags?.greedySide || "the opponent";
      const greedySan = signal.tags?.greedyCaptureSan;
      const punishingSide = signal.tags?.punishingSide || "the player";
      const replySan = signal.tags?.tacticalReplySan;
      const motifText = signal.tags?.motifText || "with a tactical response";

      if (!exposedSquare || !greedySan || !replySan) return "";

      return `This move appears to leave the ${exposedName} on ${exposedSquare} undefended, but if ${greedySide} grabs it with ${greedySan}, ${punishingSide} has ${replySan} ${motifText}.`;
    }
    case "tacticalSequence":
    case "tacticalContinuation": {
      const recapturingSide = signal.tags?.recapturingSide || "the opponent";
      const punishingSide = signal.tags?.punishingSide || "the player";
      const replySan = signal.tags?.tacticalReplySan || signal.tags?.replySan;
      const motifText = signal.tags?.motifText || "with a tactical continuation";

      if (!replySan) return "";

      return `This capture is tactically justified because if ${recapturingSide} recaptures, ${punishingSide} has ${replySan} ${motifText}.`;
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

    case "removeDefender": {
      const target = signal.targets?.[0];
      if (!target) return "";

      const defenderName = getPieceName(signal.tags?.defender) || "piece";
      const targetName = getPieceName(target.piece) || "piece";

      return `This removes the ${defenderName} defending the ${targetName} on ${target.square}.`;
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
    case "protectsAttackedPiece": {
      const target = signal.targets?.[0];
      if (!target) return "";

      const name = getPieceName(target.piece) || "piece";
      return `This protects the attacked ${name} on ${target.square}.`;
    }
    case "validatedSkewer":
    case "skewer": {
      const front = signal.targets?.[0];
      const rear = signal.targets?.[1];

      if (!front || !rear) return "";

      const frontName = getPieceName(front.piece) || "piece";
      const rearName = getPieceName(rear.piece) || "piece";
      const attackerName = getPieceName(signal.tags?.attacker) || "piece";
      const isValidated = signal.type === "validatedSkewer";

      if (isValidated && (signal.tags?.frontIsKing || front.piece === "k")) {
        return `This creates a skewer with the ${attackerName}: the king on ${front.square} is checked, with the ${rearName} behind it on ${rear.square}.`;
      }

      if (isValidated) {
        return `This creates a skewer with the ${attackerName}: the ${frontName} on ${front.square} is attacked, with the ${rearName} behind it on ${rear.square}.`;
      }

      if (signal.tags?.frontIsKing || front.piece === "k") {
        return `This gives check, with the ${rearName} on ${rear.square} lined up behind the king.`;
      }

      return `This creates a skewer with the ${attackerName}: the ${frontName} on ${front.square} is attacked, with the ${rearName} behind it on ${rear.square}.`;
    }

    case "discoveredCheck": {
      const attacker = getPieceName(signal.tags?.attacker) || "piece";
      return `This opens a discovered check from the ${attacker}.`;
    }
    case "fork": {
      if (!signal.targets?.length) return "";

      const text = signal.targets.map(formatTarget).join(" and ");

      if (signal.tags?.kind === "doubleAttack") {
        return `This creates a double attack, also attacking ${text}.`;
      }

      if (signal.tags?.includesCheck) {
        return `This creates a fork, checking the king and attacking ${text}.`;
      }

      return `This creates a fork, attacking ${text}.`;
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