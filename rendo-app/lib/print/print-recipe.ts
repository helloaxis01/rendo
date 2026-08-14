import type { Recipe } from "@/lib/db/types";
import {
  formatIngredientLine,
  scaleAmount,
  type UnitSystem,
} from "@/lib/units";

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
  @page { size: letter; margin: 0.6in 0.65in; }
  .recipe-print-sheet,
  .recipe-print-sheet * { box-sizing: border-box; }
  .recipe-print-sheet {
    margin: 0;
    background: #fff;
    color: #000;
    font-family: Georgia, "Times New Roman", serif;
  }
  .recipe-print-sheet .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 0 18px;
  }
  .recipe-print-sheet .mark {
    width: 28px;
    height: 28px;
    border: 1.5px solid #000;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: Helvetica, Arial, sans-serif;
    font-weight: 800;
    font-size: 16px;
    letter-spacing: -0.04em;
    background: #000;
    color: #fff;
  }
  .recipe-print-sheet .wordmark {
    font-family: Helvetica, Arial, sans-serif;
    font-weight: 800;
    font-size: 13px;
    letter-spacing: 0.32em;
  }
  .recipe-print-sheet .rule {
    height: 0;
    border: 0;
    border-top: 1px solid #000;
    margin: 0 0 20px;
  }
  .recipe-print-sheet h1 {
    font-family: Helvetica, Arial, sans-serif;
    font-weight: 800;
    font-size: 28px;
    line-height: 1.12;
    letter-spacing: -0.03em;
    margin: 0 0 8px;
  }
  .recipe-print-sheet .about {
    font-style: italic;
    font-size: 14px;
    line-height: 1.45;
    margin: 0 0 12px;
    max-width: 38em;
  }
  .recipe-print-sheet .meta {
    font-family: Helvetica, Arial, sans-serif;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    margin: 0 0 26px;
  }
  .recipe-print-sheet .grid {
    display: grid;
    grid-template-columns: 0.4fr 0.6fr;
    gap: 32px;
  }
  .recipe-print-sheet h2 {
    font-family: Helvetica, Arial, sans-serif;
    font-size: 10px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    margin: 0 0 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid #000;
  }
  .recipe-print-sheet .ingredients { list-style: none; margin: 0; padding: 0; }
  .recipe-print-sheet .ingredients li {
    font-size: 13px;
    line-height: 1.4;
    padding: 5px 0;
    border-bottom: 1px solid #000;
  }
  .recipe-print-sheet .steps { list-style: none; margin: 0; padding: 0; }
  .recipe-print-sheet .steps li {
    display: grid;
    grid-template-columns: 1.8rem 1fr;
    gap: 8px;
    margin: 0 0 14px;
    page-break-inside: avoid;
  }
  .recipe-print-sheet .num {
    font-family: Helvetica, Arial, sans-serif;
    font-weight: 800;
    font-size: 12px;
    padding-top: 1px;
  }
  .recipe-print-sheet .steps p { margin: 0; font-size: 13.5px; line-height: 1.45; }
  .recipe-print-sheet footer {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    margin-top: 28px;
    padding-top: 10px;
    border-top: 1px solid #000;
    font-family: Helvetica, Arial, sans-serif;
    font-size: 9px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
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

/** Opens the system print dialog from the tap, and keeps the sheet until print ends. */
export function printRecipeKeepsake(
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
  const mq = window.matchMedia("print");
  const cleanup = () => {
    if (finished) return;
    finished = true;
    mq.removeEventListener("change", onMq);
    delete document.documentElement.dataset.printing;
    sheet.remove();
  };
  const onMq = (event: MediaQueryListEvent) => {
    if (!event.matches) window.setTimeout(cleanup, 300);
  };
  mq.addEventListener("change", onMq);
  window.setTimeout(cleanup, 180_000);
  window.setTimeout(() => {
    sheet.addEventListener("click", cleanup, { once: true });
  }, 400);

  try {
    window.print();
  } catch {
    cleanup();
  }
}
