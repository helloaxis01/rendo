/** Decode HTML entities, including nested &amp;amp; style corruption. */

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "\u2019",
  lsquo: "\u2018",
  rdquo: "\u201D",
  ldquo: "\u201C",
  trade: "™",
  reg: "®",
  copy: "©",
};

function decodeOnce(input: string): string {
  return input
    .replace(/&([a-z]+);/gi, (match, name: string) => {
      const mapped = NAMED[name.toLowerCase()];
      return mapped ?? match;
    })
    .replace(/&#(\d+);/g, (_, digits: string) => {
      const code = Number(digits);
      if (!Number.isFinite(code) || code < 0) return _;
      try {
        return String.fromCodePoint(code);
      } catch {
        return _;
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      if (!Number.isFinite(code) || code < 0) return _;
      try {
        return String.fromCodePoint(code);
      } catch {
        return _;
      }
    });
}

/** Decode repeatedly so `&amp;amp;` becomes `&`. */
export function decodeHtmlEntities(input: string): string {
  if (!input || !input.includes("&")) return input;
  let current = input;
  for (let i = 0; i < 8; i += 1) {
    const next = decodeOnce(current);
    if (next === current) break;
    current = next;
  }
  return current;
}
