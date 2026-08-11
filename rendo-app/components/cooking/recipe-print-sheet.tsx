"use client";

import type { Recipe } from "@/lib/db/types";
import {
  formatIngredientLine,
  scaleAmount,
  type UnitSystem,
} from "@/lib/units";

type Props = {
  recipe: Recipe;
  servings: number;
  unitSystem: UnitSystem;
};

export function RecipePrintSheet({ recipe, servings, unitSystem }: Props) {
  const source =
    recipe.source_handle ||
    (recipe.source_url
      ? (() => {
          try {
            return new URL(recipe.source_url).hostname.replace(/^www\./, "");
          } catch {
            return null;
          }
        })()
      : null);

  const printedAt = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <article className="recipe-print-sheet hidden print:block">
      <header className="recipe-print-header">
        <p className="recipe-print-brand">RENDO</p>
        <h1 className="recipe-print-title">{recipe.title}</h1>
        <div className="recipe-print-meta">
          <span>
            {servings} serving{servings === 1 ? "" : "s"}
          </span>
          <span className="recipe-print-dot" aria-hidden>
            ·
          </span>
          <span>{recipe.prep_time_minutes} min</span>
          {source ? (
            <>
              <span className="recipe-print-dot" aria-hidden>
                ·
              </span>
              <span>{source}</span>
            </>
          ) : null}
          <span className="recipe-print-dot" aria-hidden>
            ·
          </span>
          <span className="capitalize">{unitSystem}</span>
        </div>
        {recipe.tags.length > 0 ? (
          <p className="recipe-print-tags">{recipe.tags.join("  ·  ")}</p>
        ) : null}
      </header>

      <div className="recipe-print-grid">
        <section className="recipe-print-section">
          <h2 className="recipe-print-section-title">Ingredients</h2>
          <ul className="recipe-print-ingredients">
            {recipe.ingredients_normalized.map((ing) => {
              const amount = scaleAmount(
                ing.amount,
                recipe.servings_base,
                servings
              );
              return (
                <li key={ing.id}>
                  {formatIngredientLine(
                    amount,
                    ing.unit,
                    ing.name,
                    unitSystem
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="recipe-print-section">
          <h2 className="recipe-print-section-title">Steps</h2>
          <ol className="recipe-print-steps">
            {recipe.steps.map((step) => (
              <li key={step.step_number} className="recipe-print-step">
                <div className="recipe-print-step-num">
                  {String(step.step_number).padStart(2, "0")}
                </div>
                <div>
                  <p className="recipe-print-step-header">
                    {step.action_header}
                  </p>
                  <p className="recipe-print-step-body">{step.instruction}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <footer className="recipe-print-footer">
        <span>Printed {printedAt}</span>
        {recipe.source_url ? (
          <span className="recipe-print-source-url">{recipe.source_url}</span>
        ) : (
          <span>rendorecipes.netlify.app</span>
        )}
      </footer>
    </article>
  );
}
