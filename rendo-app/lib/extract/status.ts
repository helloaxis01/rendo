export const REQUIRES_TEXT_OR_IMAGE = "REQUIRES_TEXT_OR_IMAGE" as const;

export const REQUIRES_TEXT_OR_IMAGE_MESSAGE =
  "Instagram link did not contain caption text.";

export const REQUIRES_TEXT_OR_IMAGE_PROMPT =
  'Instagram didn\'t include the post text with this link. Tap "Paste Text" to drop in the copied caption, or snap a screenshot to import instantly!';

export type ExtractStatus = typeof REQUIRES_TEXT_OR_IMAGE;

export function isRequiresTextOrImage(data: {
  status?: string | null;
}): boolean {
  return data.status === REQUIRES_TEXT_OR_IMAGE;
}
