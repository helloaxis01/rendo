/** True for instagram.com / instagr.am post, reel, or TV URLs. */
export function isInstagramUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return (
      host === "instagram.com" ||
      host === "instagr.am" ||
      host.endsWith(".instagram.com")
    );
  } catch {
    return false;
  }
}

export const INSTAGRAM_CAPTION_MISSING =
  "Couldn't find recipe text in this post. Try copying the post's text directly into Paste Recipe Text, or take a screenshot and import it using Photo.";

/** Caption-like text left after stripping URLs. */
export function captionBesideUrls(payload: string): string {
  return payload
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function payloadHasInstagramUrl(payload: string): boolean {
  const match = payload.match(/https?:\/\/\S+/gi) ?? [];
  if (match.some(isInstagramUrl)) return true;
  try {
    return isInstagramUrl(payload.trim());
  } catch {
    return false;
  }
}

/** Instagram link with no usable caption — do not scrape; fail fast. */
export function isInstagramWithoutCaption(payload: string): boolean {
  return (
    payloadHasInstagramUrl(payload) && captionBesideUrls(payload).length < 40
  );
}
