export function getOpeningInfo(moves) {
  if (!Array.isArray(moves) || !moves.length) return null;

  const sans = moves
    .map((m) => (typeof m === "string" ? m : m?.san))
    .filter(Boolean)
    .map((san) => san.replace(/[+#?!]+/g, "").replace(/\s+/g, ""));

  const line = sans.join(" ");

  const openings = [
    {
      name: "Ruy Lopez: Exchange Variation",
      patterns: ["e4 e5 Nf3 Nc6 Bb5 a6 Bxc6"],
      description:
        "White gives up the bishop pair to damage Black’s pawn structure.\nPlan: simplify pieces and target Black’s doubled pawns.",
    },
    {
      name: "Ruy Lopez: Berlin Defense",
      patterns: ["e4 e5 Nf3 Nc6 Bb5 Nf6"],
      description:
        "Black challenges the e4 pawn early and aims for a solid structure.\nPlan: develop smoothly and look for small positional advantages.",
    },
    {
      name: "Ruy Lopez",
      patterns: ["e4 e5 Nf3 Nc6 Bb5"],
      description:
        "White pressures the knight on c6 and fights for the center indirectly.\nPlan: complete development and build central control.",
    },
    {
      name: "Italian Game",
      patterns: ["e4 e5 Nf3 Nc6 Bc4"],
      description:
        "White develops quickly and targets the weak f7 square.\nPlan: castle early and coordinate pieces for an attack.",
    },
    {
      name: "Scotch Game",
      patterns: ["e4 e5 Nf3 Nc6 d4"],
      description:
        "White opens the center quickly and creates active play.\nPlan: develop fast and use open lines actively.",
    },
    {
      name: "Sicilian Defense: Najdorf",
      patterns: ["e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6"],
      description:
        "Black creates an unbalanced and tactical position.\nPlan: be ready for sharp play and control key central squares.",
    },
    {
      name: "Sicilian Defense",
      patterns: ["e4 c5"],
      description:
        "Black fights for the center from the side.\nPlan: develop quickly and look for tactical chances.",
    },
    {
      name: "French Defense",
      patterns: ["e4 e6"],
      description:
        "Black builds a solid pawn structure and challenges the center.\nPlan: improve piece placement behind the pawn chain.",
    },
    {
      name: "Caro-Kann Defense",
      patterns: ["e4 c6"],
      description:
        "Black aims for a safe and solid setup.\nPlan: develop calmly and look for gradual counterplay.",
    },
    {
      name: "Queen's Gambit Declined",
      patterns: ["d4 d5 c4 e6"],
      description:
        "Black maintains a strong center and solid structure.\nPlan: develop pieces and contest central control.",
    },
    {
      name: "Queen's Gambit Accepted",
      patterns: ["d4 d5 c4 dxc4"],
      description:
        "Black accepts the pawn and challenges White’s center.\nPlan: develop quickly and regain central control.",
    },
    {
      name: "Queen's Gambit",
      patterns: ["d4 d5 c4"],
      description:
        "White challenges the center with the c-pawn.\nPlan: build strong central control and active pieces.",
    },
    {
      name: "King's Indian Defense",
      patterns: ["d4 Nf6 c4 g6 Nc3 Bg7"],
      description:
        "Black allows White to build a center and plans to attack it.\nPlan: prepare counterplay and strike at the right moment.",
    },
    {
      name: "London System",
      patterns: ["d4 d5 Bf4", "d4 Nf6 Bf4"],
      description:
        "White uses a simple and solid setup.\nPlan: develop smoothly and maintain a stable position.",
    },
    {
      name: "English Opening",
      patterns: ["c4"],
      description:
        "White controls the center from the flank.\nPlan: stay flexible and adapt your setup.",
    },
    {
      name: "King's Pawn Opening",
      patterns: ["e4"],
      description:
        "White immediately fights for the center.\nPlan: develop quickly and use open lines.",
    },
    {
      name: "Queen's Pawn Opening",
      patterns: ["d4"],
      description:
        "White takes central space and builds a solid position.\nPlan: develop steadily and control the center.",
    },
  ];

  let bestMatch = null;

  for (const opening of openings) {
    for (const pattern of opening.patterns) {
      if (line.startsWith(pattern)) {
        const length = pattern.split(" ").length;

        if (!bestMatch || length > bestMatch.length) {
          bestMatch = { ...opening, matchedPattern: pattern, length };
        }
      }
    }
  }

  if (!bestMatch) return null;

  return {
    name: bestMatch.name,
    description: bestMatch.description,
    matchedPattern: bestMatch.matchedPattern,
  };
}