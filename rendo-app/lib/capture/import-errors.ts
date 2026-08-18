import { notEnoughInfoMessage } from "@/lib/extract/status";

/** Map raw extract/picker errors to a short, actionable line. */
export function publicImportError(
  message: string,
  kind: "photo" | "general" = "general"
): string {
  if (!message) return "";

  if (
    /load failed|failed to fetch|networkerror when attempting to fetch/i.test(
      message
    )
  ) {
    return kind === "photo"
      ? "Couldn't reach RENDO. Check your connection and tap Process Recipe again."
      : "Couldn't reach RENDO. Check your connection and try again.";
  }
  if (/payload too large|413|entity too large|body exceeded/i.test(message)) {
    return "Those photos are too large. Try 1–2 closer shots.";
  }
  if (/timed out|timeout|deadline exceeded/i.test(message)) {
    return kind === "photo"
      ? "That photo took too long. Try one closer, well-lit shot."
      : "That took too long. Try again, or paste the recipe text.";
  }
  if (/too dark|try more light/i.test(message)) {
    return keepPhotoFrame(message, "That photo is too dark. Try more light.");
  }
  if (/washed out|reduce glare/i.test(message)) {
    return keepPhotoFrame(
      message,
      "That photo is washed out. Reduce glare and try again."
    );
  }
  if (
    /text unreadable|couldn't find a readable recipe|couldn't read the recipe in that (image|photo)/i.test(
      message
    )
  ) {
    return keepPhotoFrame(message, "Text unreadable, try a clearer photo.");
  }
  if (
    /couldn't read those photos|couldn't read that photo format|couldn't decode that photo|couldn't read that file/i.test(
      message
    )
  ) {
    return "Couldn't read that photo. Take a new shot or use a screenshot.";
  }
  if (/heic|heif|unsupported.*format/i.test(message)) {
    return "That photo format isn't supported. Take a new photo or use a screenshot.";
  }
  if (
    /not authorized|permission|access denied|denied camera|denied photos/i.test(
      message
    )
  ) {
    return "Photo access is off. Enable it in Settings, or paste the recipe text.";
  }
  if (
    /API_KEY_INVALID|API key not valid|GoogleGenerativeAI|generativelanguage|LocalizedMes|ErrorInfo|googleapis\.com|"@type"|google\.rpc|\{"@type"|generateContent|400 Bad Request/i.test(
      message
    )
  ) {
    return "Recipe reading is unavailable right now. Paste the recipe text instead.";
  }
  if (message.includes("{") || message.includes("@type")) {
    return "Recipe reading is unavailable right now. Paste the recipe text instead.";
  }
  if (
    kind === "photo" &&
    /couldn't add that recipe|extract failed|couldn't extract|text unreadable/i.test(
      message
    )
  ) {
    return keepPhotoFrame(message, notEnoughInfoMessage("photo"));
  }
  if (/couldn't add that recipe|extract failed|couldn't extract|no recipes found/i.test(message)) {
    return notEnoughInfoMessage("source");
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

function keepPhotoFrame(message: string, mapped: string) {
  const prefix = message.match(/^(Photo \d+ of \d+:\s*)/i)?.[1];
  return prefix ? `${prefix}${mapped}` : mapped;
}
