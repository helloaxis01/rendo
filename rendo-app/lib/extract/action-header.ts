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

/** Adjectives / prep states that make a bad headline object ("SPREAD SOFTENED"). */
const MODIFIERS = new Set([
  "SOFTENED",
  "MELTED",
  "CHOPPED",
  "DICED",
  "MINCED",
  "SLICED",
  "GRATED",
  "ZESTED",
  "COOKED",
  "DRAINED",
  "RESERVED",
  "FRESH",
  "LARGE",
  "SMALL",
  "MEDIUM",
  "WHOLE",
  "DRIED",
  "GROUND",
  "CRUSHED",
  "PEELED",
  "SEEDED",
  "SOFT",
  "HARD",
  "COLD",
  "HOT",
  "WARM",
  "REMAINING",
  "OPTIONAL",
  "FINELY",
  "ROUGHLY",
  "THINLY",
  "THICKLY",
  "LIGHTLY",
  "HEAVILY",
  "EXTRA",
  "VIRGIN",
  "KOSHER",
  "FLAKY",
  "FRESHLY",
  "ROOM",
  "TEMPERATURE",
  "GOLDEN",
  "BROWN",
  "TENDER",
]);

/** Words that are verbs in the set but usually nouns in a recipe object. */
const NOUN_OVERRIDE = new Set([
  "OIL",
  "CREAM",
  "PEEL",
  "ZEST",
  "JUICE",
  "COVER",
  "TOP",
  "GLAZE",
  "SEASON",
  "REST",
  "WARM",
  "COOL",
  "PRESS",
  "BEAT",
  "WHIP",
  "SALT",
  "PEPPER",
  "MIX",
  "WATER",
  "STOCK",
  "BROTH",
]);

const LIST_VERBS = new Set([
  "ADD",
  "MIX",
  "COMBINE",
  "TOSS",
  "STIR",
  "FOLD",
  "WHISK",
  "SCATTER",
  "SPRINKLE",
]);

const UNITS =
  /^(CUP|CUPS|TBSP|TSP|TEASPOON|TEASPOONS|TABLESPOON|TABLESPOONS|OZ|LB|LBS|G|KG|ML|L|PINCH|HANDFUL|CLOVE|CLOVES|DEGREES|DEGREE|F|C|FAHRENHEIT|CELSIUS|MIN|MINS|MINUTE|MINUTES|HOUR|HOURS|SEC|SECONDS)$/;

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

function listItemCount(clause: string, verb: string): number {
  const upper = clause.toUpperCase();
  const at = upper.indexOf(verb);
  const after = at >= 0 ? clause.slice(at + verb.length) : clause;
  return after
    .split(/\s*(?:,|;|\/|&|\band\b)\s+/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 1 && !/^(the|a|an|to|into|in|with)$/i.test(part))
    .length;
}

function isModifier(token: string): boolean {
  if (MODIFIERS.has(token)) return true;
  if (token.endsWith("ED") && VERB_SET.has(token.slice(0, -2))) return true;
  if (token.endsWith("ED") && VERB_SET.has(token.slice(0, -1))) return true;
  return false;
}

/** True when a stored header is a weak fragment and should be replaced. */
export function isWeakActionHeader(header: string, instruction?: string): boolean {
  const h = header.trim().toUpperCase();
  if (!h || /^STEP\s+\d+$/i.test(h)) return true;
  const words = h.split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  if (words.every((w) => STOP.has(w) || isModifier(w))) return true;
  if (!words.some((w) => VERB_SET.has(w))) return true;
  if (/^(TO|IN|OF|ON|AT|FOR|WITH|INTO|ONTO|FROM)\b/.test(h)) return true;
  if (/^(ADD|POUR|RETURN)\s+TO\s+THE\b/.test(h) && words.length <= 4) return true;
  if (words.length === 2 && isModifier(words[1])) return true;
  if (instruction) {
    const clause = firstClause(instruction);
    const naive = clause
      .toUpperCase()
      .split(/\s+/)
      .map(normalizeToken)
      .filter(Boolean)
      .slice(0, 3)
      .join(" ");
    if (naive && h === naive) return true;
    const verb = words.find((w) => LIST_VERBS.has(w));
    if (verb && words.length <= 2 && listItemCount(clause, verb) >= 3) {
      return true;
    }
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

  let verbIndex = tokens.findIndex((t) => VERB_SET.has(t) && !NOUN_OVERRIDE.has(t));
  if (verbIndex < 0) {
    verbIndex = tokens.findIndex((t) => VERB_SET.has(t));
  }
  if (verbIndex < 0) {
    verbIndex = tokens.findIndex((t) =>
      ACTION_VERBS.some((v) => t === `${v}ING` || t === `${v}S`)
    );
  }

  if (verbIndex < 0) {
    return `STEP ${index + 1}`;
  }

  const resolvedVerb = tokens[verbIndex];
  if (LIST_VERBS.has(resolvedVerb) && listItemCount(clause, resolvedVerb) >= 3) {
    return resolvedVerb === "ADD"
      ? "ADD INGREDIENTS"
      : `${resolvedVerb} INGREDIENTS`;
  }

  const objects: string[] = [];
  for (let i = verbIndex + 1; i < tokens.length && objects.length < 2; i += 1) {
    const t = tokens[i];
    if (STOP.has(t) || isModifier(t)) continue;
    if (VERB_SET.has(t) && !NOUN_OVERRIDE.has(t) && objects.length) break;
    if (/^\d/.test(t) || UNITS.test(t)) continue;
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
