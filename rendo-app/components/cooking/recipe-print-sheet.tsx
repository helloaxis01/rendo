"use client";

import { createPortal } from "react-dom";
import type { Recipe } from "@/lib/db/types";
import type { UnitSystem } from "@/lib/units";
import { buildRecipePrintContent } from "@/lib/print/recipe-print-content";

type Props = {
  recipe: Recipe;
  servings: number;
  unitSystem: UnitSystem;
};

export function RecipePrintSheet({ recipe, servings, unitSystem }: Props) {
  const content = buildRecipePrintContent(recipe, servings, unitSystem);

  if (typeof document === "undefined") return null;

  return createPortal(
    <article className="recipe-print-sheet" aria-hidden>
      <header className="recipe-print-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon.png"
          alt=""
          className="recipe-print-logo"
          draggable={false}
        />
        <div className="recipe-print-heading">
          <h1 className="recipe-print-title">{content.title}</h1>
          <p className="recipe-print-meta">{content.meta.join(" · ")}</p>
        </div>
      </header>

      <div className="recipe-print-grid">
        <section className="recipe-print-column recipe-print-column-ingredients">
          <h2 className="recipe-print-section-title">Ingredients</h2>
          {content.ingredientGroups.map((group, groupIndex) => (
            <div
              key={`${group.section ?? "default"}-${groupIndex}`}
              className={
                groupIndex > 0 ? "recipe-print-ingredient-group" : undefined
              }
            >
              {group.section ? (
                <h3 className="recipe-print-ingredient-group-title">
                  {group.section}
                </h3>
              ) : null}
              <ul className="recipe-print-ingredients">
                {group.items.map((item, itemIndex) => (
                  <li
                    key={`${group.section ?? "default"}-${itemIndex}`}
                    className="recipe-print-ingredient"
                  >
                    <span className="recipe-print-checkbox" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="recipe-print-column recipe-print-column-steps">
          <h2 className="recipe-print-section-title">Steps</h2>
          <ol className="recipe-print-steps">
            {content.steps.map((step) => (
              <li key={step.number} className="recipe-print-step">
                <span className="recipe-print-step-num">{step.number}.</span>
                <p className="recipe-print-step-body">{step.instruction}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <footer className="recipe-print-footer">
        <span>{content.footer}</span>
      </footer>
    </article>,
    document.body
  );
}

export function RecipePrintPreview({
  recipe,
  servings,
  unitSystem,
}: Props) {
  const content = buildRecipePrintContent(recipe, servings, unitSystem);

  return (
    <article className="recipe-print-preview">
      <header className="recipe-print-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon.png"
          alt=""
          className="recipe-print-logo"
          draggable={false}
        />
        <div className="recipe-print-heading">
          <h1 className="recipe-print-title">{content.title}</h1>
          <p className="recipe-print-meta">{content.meta.join(" · ")}</p>
        </div>
      </header>

      <div className="recipe-print-grid recipe-print-grid-preview">
        <section className="recipe-print-column recipe-print-column-ingredients">
          <h2 className="recipe-print-section-title">Ingredients</h2>
          {content.ingredientGroups.map((group, groupIndex) => (
            <div
              key={`${group.section ?? "default"}-${groupIndex}`}
              className={
                groupIndex > 0 ? "recipe-print-ingredient-group" : undefined
              }
            >
              {group.section ? (
                <h3 className="recipe-print-ingredient-group-title">
                  {group.section}
                </h3>
              ) : null}
              <ul className="recipe-print-ingredients">
                {group.items.map((item, itemIndex) => (
                  <li
                    key={`${group.section ?? "default"}-${itemIndex}`}
                    className="recipe-print-ingredient"
                  >
                    <span className="recipe-print-checkbox" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="recipe-print-column recipe-print-column-steps">
          <h2 className="recipe-print-section-title">Steps</h2>
          <ol className="recipe-print-steps">
            {content.steps.map((step) => (
              <li key={step.number} className="recipe-print-step">
                <span className="recipe-print-step-num">{step.number}.</span>
                <p className="recipe-print-step-body">{step.instruction}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </article>
  );
}
