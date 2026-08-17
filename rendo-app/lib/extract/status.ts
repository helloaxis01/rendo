export const REQUIRES_TEXT_OR_IMAGE = "REQUIRES_TEXT_OR_IMAGE" as const;
export const REQUIRES_PASTE = "REQUIRES_PASTE" as const;

export const REQUIRES_TEXT_OR_IMAGE_MESSAGE =
  "We couldn't find a recipe in that source.";

export const REQUIRES_PASTE_MESSAGE =
  "We couldn't find a recipe in that source. Paste a recipe website link, the ingredients and steps, or a photo.";

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
