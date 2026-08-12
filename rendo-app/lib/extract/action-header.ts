/**
 * Derive a short cooking action headline from a step instruction.
 * Avoids naive "first 3 words" fragments like "TO THE SAME".
 */

const LEAD_IN =
  /^(meanwhile|next|then|finally|afterwards|after that|once|when|while|carefully|gently|slowly|quickly|immediately),?\s+/i;

const ACTION_VERBS = [
  "PREHEAT",
  "HEAT",
  "SEAR",
  "SAUTE",
  "SAUTÉ",
  "BROWN",
  "ROAST",
  "BAKE",
  "BOIL",
  "SIMMER",
  "WHISK",
  "STIR",
  "MIX",
  "COMBINE",
  "FOLD",
  "TOSS",
  "SEASON",
  "SPRINKLE",
  "DRIZZLE",
  "MARINATE",
  "CHILL",
  "REST",
  "SLICE",
  "CHOP",
  "DICE",
  "MINCE",
  "BLEND",
  "PUREE",
  "PURÉE",
  "GRILL",
  "BROIL",
  "FRY",
  "TRANSFER",
  "REMOVE",
  "DRAIN",
  "SERVE",
  "TOP",
  "FINISH",
  "BRING",
  "REDUCE",
  "COVER",
  "UNCOVER",
  "PLACE",
  "SET",
  "SPREAD",
  "BRUSH",
  "COAT",
  "RUB",
  "MELT",
  "SOFTEN",
  "WHIP",
  "KNEAD",
  "ROLL",
  "SHAPE",
  "ASSEMBLE",
  "LAYER",
  "STUFF",
  "FILL",
  "STRAIN",
  "RESERVE",
  "DISCARD",
  "TASTE",
  "ADJUST",
  "GARNISH",
  "PLATE",
  "COOL",
  "FREEZE",
  "THAW",
  "SOAK",
  "RINSE",
  "PAT",
  "TOAST",
  "CARAMELIZE",
  "DEGLAZE",
  "SCRAPE",
  "FLIP",
  "TURN",
  "CONTINUE",
  "RETURN",
  "LOWER",
  "RAISE",
  "COOK",
  "STEAM",
  "POACH",
  "BLANCH",
  "GLAZE",
  "EMULSIFY",
  "CRUSH",
  "MASH",
  "GRATE",
  "ZEST",
  "JUICE",
  "PEEL",
  "TRIM",
  "CUT",
  "HALVE",
  "QUARTER",
  "SEPARATE",
  "BEAT",
  "CREAM",
  "SIFT",
  "DUST",
  "LINE",
  "GREASE",
  "OIL",
  "WARM",
  "DIVIDE",
  "ARRANGE",
  "PRESS",
  "POUR",
  "ADD",
  "STIR-FRY",
  "PAN-FRY",
  "DEEP-FRY",
  "MICROWAVE",
  "REHEAT",
  "KEEP",
  "LET",
  "ALLOW",
  "CHECK",
  "TEST",
  "SKIM",
  "LADLE",
  "SPOON",
  "SCATTER",
  "DOT",
  "SCORE",
  "SEAL",
  "WRAP",
  "TIE",
  "THREAD",
  "SKEWER",
] as const;

const VERB_SET: Set<string> = new Set(ACTION_VERBS);

const STOP = new Set([
  "A",
  "AN",
  "THE",
  "TO",
  "OF",
  "IN",
  "ON",
  "AT",
  "FOR",
  "AND",
  "OR",
  "WITH",
  "INTO",
  "ONTO",
  "FROM",
  "OVER",
  "UNDER",
  "UNTIL",
  "THEN",
  "YOUR",
  "THIS",
  "THAT",
  "SAME",
  "VERY",
  "SOME",
  "ALL",
  "EACH",
  "BOTH",
  "ABOUT",
  "AROUND",
  "ACROSS",
  "THROUGH",
  "AFTER",
  "BEFORE",
  "DURING",
  "AS",
  "IF",
  "SO",
  "BUT",
  "BY",
  "UP",
  "DOWN",
  "OUT",
  "OFF",
  "BACK",
  "AWAY",
  "ALONG",
  "USING",
  "PER",
  "PLUS",
  "MORE",
  "LESS",
  "WELL",
  "JUST",
  "ALSO",
  "NOW",
  "STILL",
  "AGAIN",
]);

function normalizeToken(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{N}'’-]/gu, "")
    .replace(/’/g, "'")
    .toUpperCase();
}

function firstClause(instruction: string): string {
  return instruction
    .replace(LEAD_IN, "")
    .split(/[.!?;]|\n/)[0]
    ?.trim() ?? instruction.trim();
}

/** True when a stored header is a weak fragment and should be replaced. */
export function isWeakActionHeader(header: string, instruction?: string): boolean {
  const h = header.trim().toUpperCase();
  if (!h || /^STEP\s+\d+$/i.test(h)) return true;
  const words = h.split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  if (words.every((w) => STOP.has(w))) return true;
  if (!words.some((w) => VERB_SET.has(w))) return true;
  // Classic bad pattern: TO THE SAME / TO THE VERY / ADD TO THE
  if (/^(TO|IN|OF|ON|AT|FOR|WITH|INTO|ONTO|FROM)\b/.test(h)) return true;
  if (/^(ADD|POUR|RETURN)\s+TO\s+THE\b/.test(h) && words.length <= 4) return true;
  if (instruction) {
    const naive = firstClause(instruction)
      .toUpperCase()
      .split(/\s+/)
      .map(normalizeToken)
      .filter(Boolean)
      .slice(0, 3)
      .join(" ");
    if (naive && h === naive) return true;
  }
  return false;
}

export function deriveActionHeader(
  instruction: string,
  index = 0
): string {
  const clause = firstClause(instruction);
  const tokens = clause
    .split(/\s+/)
    .map(normalizeToken)
    .filter(Boolean);

  let verbIndex = tokens.findIndex((t) => VERB_SET.has(t));
  // "Add …" sometimes written without recognizing ADD if punctuation stuck — already normalized
  if (verbIndex < 0) {
    // Imperative gerunds / variants
    verbIndex = tokens.findIndex((t) =>
      ACTION_VERBS.some((v) => t === `${v}ING` || t === `${v}S`)
    );
  }

  if (verbIndex < 0) {
    return `STEP ${index + 1}`;
  }

  const resolvedVerb = tokens[verbIndex];
  const objects: string[] = [];
  for (let i = verbIndex + 1; i < tokens.length && objects.length < 2; i += 1) {
    const t = tokens[i];
    if (STOP.has(t)) continue;
    if (VERB_SET.has(t) && objects.length) break;
    if (/^\d/.test(t)) continue;
    if (
      /^(CUP|CUPS|TBSP|TSP|TEASPOON|TABLESPOON|OZ|LB|LBS|G|KG|ML|L|PINCH|HANDFUL|CLOVE|CLOVES)$/.test(
        t
      )
    ) {
      continue;
    }
    objects.push(t);
  }

  const header = [resolvedVerb, ...objects].join(" ").trim();
  if (header.length < 3) return `STEP ${index + 1}`;
  return header.length > 28 ? header.slice(0, 28).trim() : header;
}

export function resolveActionHeader(
  stored: string | null | undefined,
  instruction: string,
  index = 0
): string {
  const header = (stored ?? "").trim();
  if (header && !isWeakActionHeader(header, instruction)) {
    return header.toUpperCase();
  }
  return deriveActionHeader(instruction, index);
}
