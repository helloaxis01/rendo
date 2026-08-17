import { upsertRecipe } from "@/lib/db/queries";
import {
  upsertLaterLinkFromUrl,
  archiveLaterLink,
} from "@/lib/db/later-links";
import type { LaterLink, Recipe } from "@/lib/db/types";
import { isRequiresManualInput } from "@/lib/extract/status";
import { isInstagramUrl } from "@/lib/extract/instagram";
import type { ExtractMedia } from "@/lib/extract/gemini";
import type { IncomingShare } from "@/lib/native/incoming-share";

export type SilentImportResult =
  | { kind: "saved"; recipes: Recipe[] }
  | { kind: "later"; link: LaterLink };

export function laterLinkOptions(url: string): { title?: string; source?: string } {
  if (!isInstagramUrl(url)) return {};
  return { title: "Unparsed Recipe Link", source: "Instagram" };
}

export async function extractUrlToVault(
  url: string,
  options?: { laterLinkId?: string }
): Promise<SilentImportResult> {
  const res = await fetch("/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "url", payload: url, media: null }),
  });
  const data = await res.json();
  const recipes = Array.isArray(data.recipes) ? (data.recipes as Recipe[]) : [];
  if (res.ok && recipes.length && !isRequiresManualInput(data)) {
    for (const recipe of recipes) {
      await upsertRecipe(recipe);
    }
    if (options?.laterLinkId) await archiveLaterLink(options.laterLinkId);
    return { kind: "saved", recipes };
  }

  const link = await upsertLaterLinkFromUrl(url, laterLinkOptions(url));
  return { kind: "later", link };
}

export async function extractPayloadToVault(input: {
  type: "text" | "ocr" | "upload";
  payload: string;
  media?: ExtractMedia | ExtractMedia[] | null;
  laterLinkId?: string;
}): Promise<Recipe[]> {
  const res = await fetch("/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: input.type,
      payload: input.payload,
      media: input.media ?? null,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Couldn't extract that recipe.");
  }
  if (isRequiresManualInput(data)) {
    throw new Error(
      "No recipe found. Paste the text or add screenshots of the recipe."
    );
  }
  const recipes = Array.isArray(data.recipes) ? (data.recipes as Recipe[]) : [];
  if (!recipes.length) {
    throw new Error(
      "No recipe found. Paste the text or add screenshots of the recipe."
    );
  }
  for (const recipe of recipes) {
    await upsertRecipe(recipe);
  }
  if (input.laterLinkId) await archiveLaterLink(input.laterLinkId);
  return recipes;
}

export async function importIncomingShare(
  share: IncomingShare
): Promise<SilentImportResult> {
  if (Array.isArray(share.recipes) && share.recipes.length) {
    for (const recipe of share.recipes) {
      await upsertRecipe(recipe);
    }
    return { kind: "saved", recipes: share.recipes };
  }

  const url = share.url?.trim() ?? "";
  const text = share.text?.trim() ?? "";
  const caption = text
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const hasCaption = caption.length >= 20;

  if (url && hasCaption) {
    try {
      const recipes = await extractPayloadToVault({
        type: "text",
        payload: `Source URL: ${url}\n\n${text}`.slice(0, 40_000),
      });
      return { kind: "saved", recipes };
    } catch {
      const link = await upsertLaterLinkFromUrl(url, laterLinkOptions(url));
      return { kind: "later", link };
    }
  }

  if (url) {
    return extractUrlToVault(url);
  }

  if (hasCaption) {
    try {
      const recipes = await extractPayloadToVault({
        type: "text",
        payload: text.slice(0, 40_000),
      });
      return { kind: "saved", recipes };
    } catch {
      throw new Error("Couldn't extract that recipe.");
    }
  }

  throw new Error("Nothing to import.");
}
