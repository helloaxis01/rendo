/** Gemini only accepts a few image MIME types; iOS often reports image/jpg. */
export function geminiImageMime(mime: string): string {
  const m = (mime || "").toLowerCase();
  if (m.includes("png")) return "image/png";
  if (m.includes("webp")) return "image/webp";
  if (m.includes("gif")) return "image/gif";
  return "image/jpeg";
}

export function stripBase64Prefix(data: string): string {
  const trimmed = data.trim();
  const comma = trimmed.indexOf(",");
  if (trimmed.startsWith("data:") && comma >= 0) {
    return trimmed.slice(comma + 1).replace(/\s/g, "");
  }
  return trimmed.replace(/\s/g, "");
}
