import type { Recipe } from "@/lib/db/types";
import {
  formatIngredientLine,
  scaleAmount,
  type UnitSystem,
} from "@/lib/units";

const PAPER = "#f6f1e8";
const INK = "#1a1a1a";
const MUTED = "#5c574e";
const RULE = "#c9c0b3";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sourceLabel(recipe: Recipe): string | null {
  if (recipe.source_handle) return recipe.source_handle;
  if (!recipe.source_url) return null;
  try {
    return new URL(recipe.source_url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function recipeKeepsakeHtml(
  recipe: Recipe,
  servings: number,
  unitSystem: UnitSystem
): string {
  const source = sourceLabel(recipe);
  const printedAt = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const about = recipe.subtitle?.trim() || "";
  const ingredients = recipe.ingredients_normalized
    .map((ing) => {
      const amount = scaleAmount(
        ing.amount,
        recipe.servings_base,
        servings
      );
      return escapeHtml(
        formatIngredientLine(amount, ing.unit, ing.name, unitSystem)
      );
    })
    .map((line) => `<li>${line}</li>`)
    .join("");
  const steps = recipe.steps
    .map(
      (step) => `
        <li>
          <span class="num">${String(step.step_number).padStart(2, "0")}</span>
          <p>${escapeHtml(step.instruction)}</p>
        </li>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(recipe.title)} · RENDO</title>
<style>
  @page { size: letter; margin: 0.55in 0.6in; }
  .recipe-print-sheet,
  .recipe-print-sheet * { box-sizing: border-box; }
  .recipe-print-sheet {
    margin: 0;
    background: ${PAPER};
    color: ${INK};
    font-family: "Iowan Old Style", Palatino, "Palatino Linotype", Georgia, serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .recipe-print-sheet .sheet { padding: 0; }
  .recipe-print-sheet .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 22px;
  }
  .recipe-print-sheet .mark {
    width: 36px;
    height: 36px;
    border-radius: 9px;
    background: ${INK};
    color: #ece8e1;
    font-family: Avenir Next, Futura, Helvetica, sans-serif;
    font-weight: 800;
    font-size: 20px;
    letter-spacing: -0.04em;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .recipe-print-sheet .wordmark {
    font-family: Avenir Next, Futura, Helvetica, sans-serif;
    font-weight: 800;
    font-size: 13px;
    letter-spacing: 0.28em;
  }
  .recipe-print-sheet .rule {
    height: 1px;
    background: ${RULE};
    border: 0;
    margin: 0 0 22px;
  }
  .recipe-print-sheet h1 {
    font-family: Avenir Next, Futura, Helvetica, sans-serif;
    font-weight: 800;
    font-size: 34px;
    line-height: 1.12;
    letter-spacing: -0.02em;
    margin: 0 0 10px;
  }
  .recipe-print-sheet .about {
    font-style: italic;
    font-size: 15px;
    line-height: 1.45;
    color: ${MUTED};
    margin: 0 0 14px;
    max-width: 38em;
  }
  .recipe-print-sheet .meta {
    font-family: Avenir Next, Futura, Helvetica, sans-serif;
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: ${MUTED};
    margin: 0 0 28px;
  }
  .recipe-print-sheet .grid {
    display: grid;
    grid-template-columns: 0.42fr 0.58fr;
    gap: 36px;
  }
  .recipe-print-sheet h2 {
    font-family: Avenir Next, Futura, Helvetica, sans-serif;
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: ${MUTED};
    margin: 0 0 12px;
    padding-bottom: 6px;
    border-bottom: 1px solid ${RULE};
  }
  .recipe-print-sheet .ingredients { list-style: none; margin: 0; padding: 0; }
  .recipe-print-sheet .ingredients li {
    font-size: 13.5px;
    line-height: 1.45;
    padding: 5px 0;
    border-bottom: 1px solid ${RULE};
  }
  .recipe-print-sheet .steps { list-style: none; margin: 0; padding: 0; }
  .recipe-print-sheet .steps li {
    display: grid;
    grid-template-columns: 2.1rem 1fr;
    gap: 10px;
    margin: 0 0 16px;
    page-break-inside: avoid;
  }
  .recipe-print-sheet .num {
    font-family: Avenir Next, Futura, Helvetica, sans-serif;
    font-weight: 800;
    font-size: 13px;
    letter-spacing: 0.04em;
    padding-top: 2px;
  }
  .recipe-print-sheet .steps p { margin: 0; font-size: 14.5px; line-height: 1.5; }
  .recipe-print-sheet footer {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    margin-top: 36px;
    padding-top: 12px;
    border-top: 1px solid ${INK};
    font-family: Avenir Next, Futura, Helvetica, sans-serif;
    font-size: 9px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: ${MUTED};
  }
  @media print {
    .recipe-print-sheet { background: ${PAPER}; }
  }
</style>
</head>
<body>
  <article class="sheet">
    <div class="brand">
      <div class="mark">R</div>
      <div class="wordmark">RENDO</div>
    </div>
    <hr class="rule" />
    <h1>${escapeHtml(recipe.title)}</h1>
    ${about ? `<p class="about">${escapeHtml(about)}</p>` : ""}
    <p class="meta">
      ${servings} serving${servings === 1 ? "" : "s"}
      · ${recipe.prep_time_minutes} min
      ${source ? `· ${escapeHtml(source)}` : ""}
    </p>
    <div class="grid">
      <section>
        <h2>Ingredients</h2>
        <ul class="ingredients">${ingredients}</ul>
      </section>
      <section>
        <h2>Method</h2>
        <ol class="steps">${steps}</ol>
      </section>
    </div>
    <footer>
      <span>A recipe from RENDO</span>
      <span>${escapeHtml(printedAt)}</span>
    </footer>
  </article>
</body>
</html>`;
}

/** Opens the system print dialog with a PDF preview (Print / Save as PDF). */
export async function printRecipeKeepsake(
  recipe: Recipe,
  servings: number,
  unitSystem: UnitSystem
) {
  const html = recipeKeepsakeHtml(recipe, servings, unitSystem);
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const style = parsed.querySelector("style")?.innerHTML ?? "";
  const article = parsed.querySelector("article")?.outerHTML ?? "";

  document.querySelector("#rendo-print-root")?.remove();
  const sheet = document.createElement("div");
  sheet.id = "rendo-print-root";
  sheet.className = "recipe-print-sheet";
  sheet.innerHTML = `<style>${style}</style>${article}`;
  document.body.appendChild(sheet);
  document.documentElement.dataset.printing = "true";

  let finished = false;
  const cleanup = () => {
    if (finished) return;
    finished = true;
    window.removeEventListener("afterprint", cleanup);
    delete document.documentElement.dataset.printing;
    sheet.remove();
  };

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.addEventListener("afterprint", () => {
          cleanup();
          resolve();
        });
        window.print();
        window.setTimeout(() => {
          cleanup();
          resolve();
        }, 60_000);
      });
    });
  });
}
