import { Capacitor } from "@capacitor/core";
import type { Recipe } from "@/lib/db/types";
import type { UnitSystem } from "@/lib/units";
import { buildRecipePdf } from "@/lib/print/build-recipe-pdf";
import {
  buildRecipePrintContent,
  formatRecipePlainText,
  recipePdfFilename,
} from "@/lib/print/recipe-print-content";

type RendoPrintWindow = Window & {
  webkit?: {
    messageHandlers?: {
      rendoPrint?: { postMessage: (message: unknown) => void };
    };
  };
};

function setPrinting(active: boolean) {
  if (active) {
    document.documentElement.dataset.printing = "true";
  } else {
    delete document.documentElement.dataset.printing;
  }
}

/** Opens the system print dialog (Print / Save as PDF). */
export function printRecipeDocument() {
  setPrinting(true);

  const done = () => {
    setPrinting(false);
    window.removeEventListener("afterprint", done);
  };

  window.addEventListener("afterprint", done);

  const native = (window as RendoPrintWindow).webkit?.messageHandlers?.rendoPrint;
  if (native) {
    native.postMessage("print");
    window.setTimeout(done, 2000);
    return;
  }

  window.print();
}

export function emailRecipeDocument(
  recipe: Recipe,
  servings: number,
  unitSystem: UnitSystem
) {
  const subject = encodeURIComponent(recipe.title);
  const body = encodeURIComponent(
    formatRecipePlainText(recipe, servings, unitSystem)
  );
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
}

async function sharePdfBlob(blob: Blob, filename: string, title: string) {
  const file = new File([blob], filename, { type: "application/pdf" });

  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Filesystem")) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const path = `prints/${filename}`;
    const base64 = await blobToBase64(blob);
    await Filesystem.writeFile({
      path,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    });
    const { uri } = await Filesystem.getUri({
      path,
      directory: Directory.Cache,
    });
    if (Capacitor.isPluginAvailable("Share")) {
      const { Share } = await import("@capacitor/share");
      await Share.share({
        title,
        files: [uri],
        dialogTitle: "Share recipe PDF",
      });
      return;
    }
  }

  if (typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      title,
      files: [file],
    });
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function shareRecipePdf(
  recipe: Recipe,
  servings: number,
  unitSystem: UnitSystem
) {
  const content = buildRecipePrintContent(recipe, servings, unitSystem);
  const bytes = buildRecipePdf(content);
  const blob = new Blob([bytes], { type: "application/pdf" });
  await sharePdfBlob(blob, recipePdfFilename(recipe.title), recipe.title);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}