export const REQUIRES_TEXT_OR_IMAGE = "REQUIRES_TEXT_OR_IMAGE" as const;
export const REQUIRES_PASTE = "REQUIRES_PASTE" as const;

export type NotEnoughSource =
  | "source"
  | "share"
  | "text"
  | "photo"
  | "document"
  | "page";

function wherePhrase(source: NotEnoughSource): string {
  if (source === "share") return "in that share";
  if (source === "text") return "in that text";
  if (source === "photo") return "in that photo";
  if (source === "document") return "in that document";
  if (source === "page") return "on that page";
  return "in that source";
}

/** Shared empty-import copy. Adjust only the source noun. */
export function notEnoughInfoMessage(
  source: NotEnoughSource = "source"
): string {
  return `We couldn't find a recipe ${wherePhrase(source)}. Paste a recipe website link, the ingredients and steps, or a photo.`;
}

export const REQUIRES_TEXT_OR_IMAGE_MESSAGE = notEnoughInfoMessage("source");

export const REQUIRES_PASTE_MESSAGE = notEnoughInfoMessage("source");

export const REQUIRES_TEXT_OR_IMAGE_PROMPT = REQUIRES_PASTE_MESSAGE;

export type ExtractStatus =
  | typeof REQUIRES_TEXT_OR_IMAGE
  | typeof REQUIRES_PASTE;

export function isRequiresManualInput(data: {
  status?: string | null;
}): boolean {
  return (
    data.status === REQUIRES_PASTE || data.status === REQUIRES_TEXT_OR_IMAGE
  );
}

/** @deprecated use isRequiresManualInput */
export const isRequiresTextOrImage = isRequiresManualInput;
