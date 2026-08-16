import type { Recipe } from "@/lib/db/types";
import type { UnitSystem } from "@/lib/units";

type RendoPrintWindow = Window & {
  webkit?: {
    messageHandlers?: {
      rendoPrint?: { postMessage: (message: unknown) => void };
    };
  };
};

/** Opens the system print dialog (Print / Save as PDF). */
export function printRecipeKeepsake(
  _recipe: Recipe,
  _servings: number,
  _unitSystem: UnitSystem
) {
  document.documentElement.dataset.printing = "true";

  const done = () => {
    delete document.documentElement.dataset.printing;
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
