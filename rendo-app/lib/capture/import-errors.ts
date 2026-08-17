/** Map raw extract/picker errors to a short line the capture sheet can show. */
export function publicImportError(message: string): string {
  if (!message) return "";
  if (
    /load failed|failed to fetch|networkerror when attempting to fetch/i.test(
      message
    )
  ) {
    return "Couldn't read those photos. Try again, or pick them one at a time.";
  }
  if (/payload too large|413|entity too large|body exceeded/i.test(message)) {
    return "Those photos are too large. Try 1–2 clearer shots, or paste the recipe text.";
  }
  if (
    /API_KEY_INVALID|API key not valid|GoogleGenerativeAI|generativelanguage|LocalizedMes|ErrorInfo|googleapis\.com|"@type"|google\.rpc|\{"@type"|generateContent|400 Bad Request/i.test(
      message
    )
  ) {
    return "Couldn't add that recipe right now. Try pasting the text or adding a photo.";
  }
  if (message.includes("{") || message.includes("@type")) {
    return "Couldn't add that recipe right now. Try pasting the text or adding a photo.";
  }
  return message;
}

export function isRetryableExtractFailure(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return /load failed|failed to fetch|networkerror|502|503|504|timed out|timeout/i.test(
    message
  );
}
