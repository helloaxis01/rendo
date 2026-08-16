export const REQUIRES_TEXT_OR_IMAGE = "REQUIRES_TEXT_OR_IMAGE" as const;
export const REQUIRES_PASTE = "REQUIRES_PASTE" as const;

export const REQUIRES_TEXT_OR_IMAGE_MESSAGE =
  "Instagram link did not contain caption text.";

export const REQUIRES_PASTE_MESSAGE =
  "Could not find public caption. Please use Paste Text or attach a screenshot.";

export const REQUIRES_TEXT_OR_IMAGE_PROMPT =
  'Instagram didn\'t include the post text with this link. Tap "Paste Text" to drop in the copied caption, or snap a screenshot to import instantly!';

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
