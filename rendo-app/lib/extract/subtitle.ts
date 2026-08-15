import { isUsableImageUrl } from "@/lib/cover";
import type { Recipe } from "@/lib/db/types";

const GENERIC =
  /\b(delicious|yummy|tasty|amazing|must[- ]try|homemade goodness|easy recipe|click (here|link)|subscribe|edit me|placeholder|lorem|recipe|untitled)\b/i;

export function isPhotolessCover(recipe: Pick<
  Recipe,
  | "cover_display"
  | "cover_image_url"
  | "user_cover_image_url"
>): boolean {
  if (recipe.cover_display === "type") return true;
  if (recipe.cover_display === "mine") {
    return !isUsableImageUrl(recipe.user_cover_image_url);
  }
  return (
    !isUsableImageUrl(recipe.cover_image_url) &&
    !isUsableImageUrl(recipe.user_cover_image_url)
  );
}

export function wordCount(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

export function cleanSubtitleText(
  raw: string | null | undefined
): string | null {
  const text = (raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?]+$/g, "")
    .trim();
  return text || null;
}

function titleTokens(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

function repeatsTitle(subtitle: string, title: string) {
  const titleNorm = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const subNorm = subtitle
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!titleNorm || !subNorm) return false;
  if (subNorm.includes(titleNorm) || titleNorm.includes(subNorm)) return true;
  const tokens = titleTokens(title);
  if (tokens.length === 0) return false;
  const subWords = new Set(subNorm.split(" "));
  const hits = tokens.filter((word) => subWords.has(word)).length;
  return hits >= Math.min(2, tokens.length) && hits / tokens.length >= 0.5;
}

/** Gemini cover line only. Invalid input becomes null — never a local rewrite. */
export function validateGeminiSubtitle(
  raw: string | null | undefined,
  title: string
): string | null {
  const text = cleanSubtitleText(raw);
  if (!text) return null;
  const words = wordCount(text);
  if (words < 4 || words > 7) return null;
  if (GENERIC.test(text)) return null;
  if (/^https?:\/\//i.test(text)) return null;
  if (repeatsTitle(text, title)) return null;
  return text;
}

/** @deprecated Use validateGeminiSubtitle(raw, title). */
export function normalizeSubtitle(
  raw: string | null | undefined,
  title = ""
): string | null {
  return validateGeminiSubtitle(raw, title);
}

export function displaySubtitle(recipe: {
  title: string;
  subtitle?: string | null;
  subtitle_manual?: boolean;
}): string | null {
  const text = recipe.subtitle?.replace(/\s+/g, " ").trim() || null;
  if (!text) return null;
  if (recipe.subtitle_manual) return text;
  return validateGeminiSubtitle(text, recipe.title);
}

export function needsGeminiSubtitle(recipe: Recipe): boolean {
  if (recipe.subtitle_manual) return false;
  if (!isPhotolessCover(recipe)) return false;
  return !validateGeminiSubtitle(recipe.subtitle, recipe.title);
}
