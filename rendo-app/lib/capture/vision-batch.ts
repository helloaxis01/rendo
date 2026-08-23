import { buildVisionUserPrompt } from "@/lib/extract/schema";
import { geminiImageMime, stripBase64Prefix } from "@/lib/extract/media-mime";

export type VisionMedia = {
  mimeType: string;
  data: string;
};

export const MAX_VISION_BATCH = 6;

export type VisionBatchPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

/** Always an array of 1–6 frames. Never a lone image object. */
export function visionBatchMedia(
  media?: VisionMedia | VisionMedia[] | null
): VisionMedia[] {
  if (!media) return [];
  const list = Array.isArray(media) ? media : [media];
  return list.filter((item) => item?.data).slice(0, MAX_VISION_BATCH);
}

/** POST /api/extract body: validated frames as one `media` array. */
export function visionBatchRequest(input: {
  type: string;
  payload: string;
  media?: VisionMedia | VisionMedia[] | null;
}) {
  const media = visionBatchMedia(input.media);
  return {
    type: input.type,
    payload: input.payload,
    media: media.length ? media : null,
  };
}

/**
 * One Gemini generateContent parts list for the whole session.
 * Do not call generateContent once per photo.
 */
export function visionBatchPromptParts(
  payload: string,
  media?: VisionMedia | VisionMedia[] | null
): VisionBatchPart[] {
  const batch = visionBatchMedia(media);
  const parts: VisionBatchPart[] = [
    { text: buildVisionUserPrompt({ payload, imageCount: batch.length || 1 }) },
  ];
  for (const [index, item] of batch.entries()) {
    parts.push({
      text: `Image ${index + 1} of ${batch.length} (capture order):`,
    });
    parts.push({
      inlineData: {
        mimeType: geminiImageMime(item.mimeType),
        data: stripBase64Prefix(item.data),
      },
    });
  }
  return parts;
}
