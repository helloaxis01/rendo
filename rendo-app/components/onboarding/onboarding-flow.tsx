"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  BookMarked,
  Camera,
  Check,
  FileText,
  Link2,
  List,
  NotebookPen,
  Pencil,
  Scale,
  ShoppingBasket,
  Type,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { hapticLight, hapticMedium } from "@/lib/native/haptics";

export type OnboardingFinishReason = "skip" | "done" | "capture";

/**
 * Permission policy: never prompt during onboarding.
 * Photo library / camera only when the user taps Screenshots / Photo / Take Photos
 * in Add Recipe. Notifications only when scheduling a cook timer. Reminders only
 * from shopping-list “Send to Reminders.” Opening Add Recipe from Skip or the
 * final CTA must land on the menu — not auto-open a picker.
 */

type Props = {
  open: boolean;
  onFinish: (reason: OnboardingFinishReason) => void;
  onBackToIntro?: () => void;
};

type StepItem = {
  label: string;
  blurb: string;
  icon?: "cook" | "scale" | "shop" | "notes" | "memory";
};

function StepItemIcon({ icon }: { icon: NonNullable<StepItem["icon"]> }) {
  const className = "h-5 w-5 shrink-0 text-text-primary";
  switch (icon) {
    case "cook":
      return <List className={className} strokeWidth={2} />;
    case "scale":
      return <Scale className={className} strokeWidth={2} />;
    case "shop":
      return <ShoppingBasket className={className} strokeWidth={2} />;
    case "notes":
      return <NotebookPen className={className} strokeWidth={2} />;
    case "memory":
      return <BookMarked className={className} strokeWidth={2} />;
  }
}

const STEPS = [
  {
    id: "brand",
    eyebrow: "01",
    title: "However you found it, it goes here.",
    body: "A screenshot. A link. Your favorite cookbook recipe. Your grandmother's famous apple pie. Rendo saves all of them and organizes them into something you'll actually cook from.",
    detail: "",
    items: [] as StepItem[],
    visual: "brand" as const,
  },
  {
    id: "import",
    eyebrow: "02",
    title: "Screenshot it. That's it.",
    body: "Scrolling Instagram or TikTok and see a recipe? Screenshot the caption, the on-screen text, or the ingredient list. However much you can capture. Rendo reads it and builds the recipe for you.",
    detail:
      "Take up to 6 screenshots for one recipe. Handy for posts that split ingredients and steps across multiple slides.",
    items: [] as StepItem[],
    visual: "import" as const,
  },
  {
    id: "other",
    eyebrow: "03",
    title: "Wherever you find them",
    body: "",
    detail: "",
    items: [
      {
        label: "Paste a link",
        blurb: "Most recipe blogs and websites import automatically.",
      },
      {
        label: "Type or paste text",
        blurb: "Copied ingredients or steps from anywhere.",
      },
      {
        label: "Photo of a cookbook page",
        blurb: "Snap it or take a screenshot.",
      },
      {
        label: "Import a file",
        blurb: "PDF, text, or markdown.",
      },
    ] as StepItem[],
    visual: "other" as const,
  },
  {
    id: "memory",
    eyebrow: "04",
    title: "We'll double-check the tricky parts",
    body: "If anything in the ingredients or steps looks unclear, Rendo will flag it for a quick check before saving. So your recipe is right from the start, not just fast.",
    detail: "",
    items: [] as StepItem[],
    visual: "memory" as const,
  },
  {
    id: "features",
    eyebrow: "05",
    title: "Then make it yours",
    body: "",
    detail: "",
    items: [
      {
        label: "Cook Mode",
        blurb: "Full-screen, step-by-step, hands-free.",
        icon: "cook",
      },
      {
        label: "Recipe Notes",
        blurb: "Your standing tweaks and swaps.",
        icon: "notes",
      },
      {
        label: "Memory Log",
        blurb: "Track who you cooked for, when, and what you'd change.",
        icon: "memory",
      },
      {
        label: "Shopping List",
        blurb: "Pull ingredients from multiple recipes into one list.",
        icon: "shop",
      },
    ] as StepItem[],
    visual: "features" as const,
  },
] as const;

function ProgressDots({ index, total }: { index: number; total: number }) {
  return (
    <div
      className="flex items-center justify-center gap-2"
      role="tablist"
      aria-label="Onboarding progress"
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          role="tab"
          aria-selected={i === index}
          className={cn(
            "h-1.5 w-1.5 rounded-[1px] transition-colors duration-200",
            i === index ? "bg-text-primary" : "bg-text-secondary/30"
          )}
        />
      ))}
    </div>
  );
}

/** Real recipe detail screenshot — shown in full after import. */
function OnboardingRecipeDetailShot({
  className,
}: {
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/onboarding/recipe-detail.jpg"
      alt=""
      className={cn(
        "block h-full w-full object-contain object-top",
        className
      )}
      draggable={false}
    />
  );
}

function OnboardingSourceCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "h-full overflow-hidden rounded-[12px] border border-border-hairline shadow-[0_10px_28px_rgba(10,10,10,0.12)]",
        className
      )}
    >
      {children}
    </div>
  );
}

function IndexCardSource() {
  return (
    <OnboardingSourceCard className="relative h-full bg-[#f2ebd8]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(139,119,86,0.12),transparent_42%),radial-gradient(circle_at_80%_85%,rgba(139,119,86,0.1),transparent_38%)]" />
      <div className="rendo-onboard-handwritten relative flex h-full flex-col p-2.5 text-[#2f4267]">
        <p className="text-[13px] leading-none">Weeknight Ragu</p>
        <div className="mt-2.5 space-y-1.5 text-[9px] leading-snug">
          <p className="-rotate-1">1 lb ground beef</p>
          <p className="rotate-[0.5deg]">1 onion, chopped</p>
          <p className="-rotate-[0.5deg]">3 cloves garlic</p>
          <p className="rotate-1">1 tin tomatoes</p>
          <p className="pt-1 text-[#6b5a45]">brown meat first!!</p>
        </div>
        <p className="mt-auto text-right text-[8px] text-[#6b5a45]">Mom&apos;s Recipe</p>
      </div>
    </OnboardingSourceCard>
  );
}

function CookbookSource() {
  return (
    <OnboardingSourceCard className="h-full bg-[#faf8f4]">
      <div className="flex h-full flex-col p-2 text-[#2a2824]">
        <div className="flex items-start justify-between gap-1 border-b border-[#ddd6cb] pb-1">
          <div className="min-w-0">
            <p className="text-[6px] uppercase tracking-[0.08em] text-[#8a8478]">
              Italian Cooking
            </p>
            <p className="mt-0.5 text-[5.5px] italic text-[#8a8478]">by Famous Chef</p>
          </div>
          <p className="shrink-0 text-[6px] text-[#8a8478]">142</p>
        </div>
        <div className="mt-2 flex flex-1 flex-col gap-1.5 text-[6px] leading-snug">
          <p className="font-semibold">Ragu di carne</p>
          <div>
            <p className="font-semibold">Ingredients</p>
            <p className="mt-0.5">beef, onion</p>
            <p>garlic, tomatoes</p>
            <p>pasta, oil</p>
          </div>
          <div>
            <p className="font-semibold">Directions</p>
            <p className="mt-0.5">Sauté onion in oil.</p>
            <p>Add garlic, beef.</p>
            <p>Simmer tomatoes.</p>
          </div>
        </div>
      </div>
    </OnboardingSourceCard>
  );
}

function SocialPostSource() {
  return (
    <OnboardingSourceCard className="flex h-full flex-col bg-bg-surface">
      <div className="flex items-center gap-1 border-b border-border-hairline px-1.5 py-1">
        <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-bg-muted ring-1 ring-border-hairline" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[7px] font-semibold leading-none">
            pasta.late.night
          </p>
          <p className="mt-0.5 truncate text-[5.5px] text-text-secondary">
            Sponsored
          </p>
        </div>
        <span className="text-[8px] leading-none text-text-secondary">···</span>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-[#1a1a1a]">
        <div className="absolute inset-0 bg-gradient-to-br from-[#3a2618] via-[#6b4528] to-[#241610]" />
      </div>
      <div className="space-y-0.5 px-1.5 py-1">
        <div className="flex gap-2 text-[6px] text-text-secondary">
          <span>♡ 2,418</span>
          <span>💬 84</span>
          <span>↗</span>
        </div>
        <p className="line-clamp-3 text-[6px] leading-[1.25] text-text-primary">
          <span className="font-semibold">pasta.late.night</span> weeknight ragu!!!!
          brown the meat, onion + garlic 🧄, tin of tomatoes, pasta water
        </p>
        <p className="text-[6px] leading-snug text-text-secondary">
          #easyrecipe #dinnerideas #pasta #weeknight
        </p>
      </div>
    </OnboardingSourceCard>
  );
}

function BrandVisual() {
  return (
    <div className="relative mx-auto aspect-[402/258] w-full" aria-hidden>
      <div className="absolute left-[15%] top-[29%] z-0 w-[32%] -rotate-[2deg]">
        <div className="aspect-[3/4] w-full">
          <CookbookSource />
        </div>
      </div>
      <div className="absolute left-[34%] top-[17%] z-10 w-[32%] rotate-[1deg]">
        <div className="aspect-[3/4] w-full">
          <IndexCardSource />
        </div>
      </div>
      <div className="absolute left-[53%] top-[5%] z-20 w-[32%] rotate-[3deg]">
        <div className="aspect-[3/4] w-full">
          <SocialPostSource />
        </div>
      </div>
    </div>
  );
}

function ImportVisual() {
  return (
    <div className="mx-auto w-full max-w-xs sm:max-w-sm" aria-hidden>
      <div className="flex items-stretch justify-center gap-3 sm:gap-4">
        {/* Instagram post */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[12px] border border-border-hairline bg-bg-surface shadow-[0_8px_24px_rgba(10,10,10,0.06)]">
          <div className="flex items-center gap-1.5 border-b border-border-hairline px-2 py-1.5">
            <span className="h-4 w-4 shrink-0 rounded-full bg-bg-muted" />
            <p className="truncate text-[8px] font-semibold leading-none">
              pasta.late
            </p>
          </div>
          <div className="relative aspect-square overflow-hidden bg-[#1a1a1a]">
            <div className="absolute inset-0 bg-gradient-to-br from-[#3a2618] via-[#6b4528] to-[#241610]" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 pb-2 pt-8">
              <p className="text-[7px] font-semibold text-white">weeknight ragu!!</p>
            </div>
          </div>
          <div className="space-y-0.5 px-2 py-2">
            <p className="text-[8px] leading-none text-text-secondary">♡ 2.4k</p>
            <p className="line-clamp-3 text-[8px] leading-[1.3] text-text-primary">
              <span className="font-semibold">pasta.late</span> brown meat,
              onion garlic, tomatoes, pasta water #recipe
            </p>
          </div>
          <p className="border-t border-border-hairline px-2 py-1.5 text-center text-[8px] font-semibold tracking-[0.06em] text-text-secondary">
            POST
          </p>
        </div>

        <span
          className="flex shrink-0 items-center self-center font-display text-[16px] text-text-secondary"
          aria-hidden
        >
          →
        </span>

        {/* Rendo recipe detail */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[12px] border border-border-hairline bg-bg-primary shadow-[0_8px_24px_rgba(10,10,10,0.06)]">
          <div className="min-h-0 flex-1 overflow-hidden">
            <OnboardingRecipeDetailShot className="object-cover object-top" />
          </div>
          <p className="border-t border-border-hairline px-2 py-1.5 text-center text-[8px] font-semibold tracking-[0.06em] text-text-secondary">
            RENDO
          </p>
        </div>
      </div>
    </div>
  );
}

function OtherVisual() {
  const options = [
    { label: "Link", icon: Link2 },
    { label: "Text", icon: Type },
    { label: "Photo", icon: Camera },
    { label: "File", icon: FileText },
  ] as const;

  return (
    <div className="mx-auto w-full max-w-sm" aria-hidden>
      <div className="rounded-[18px] border border-border-hairline bg-bg-surface px-3 py-4 shadow-[0_8px_24px_rgba(10,10,10,0.06)]">
        <p className="mb-3 px-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
          Import via
        </p>
        <div className="grid grid-cols-4 gap-2">
          {options.map(({ label, icon: Icon }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-2 rounded-md border border-border-hairline bg-bg-primary px-2 py-3"
            >
              <Icon className="h-5 w-5 text-text-primary" strokeWidth={2} />
              <span className="text-[10px] font-medium text-text-secondary">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MemoryVisual() {
  return (
    <div className="mx-auto w-full max-w-sm" aria-hidden>
      <div className="overflow-hidden rounded-[18px] border border-border-hairline bg-bg-surface shadow-[0_8px_24px_rgba(10,10,10,0.06)]">
        <div className="border-b border-border-hairline px-3.5 py-3">
          <p className="font-display text-[13px] tracking-tight">
            CHECK INGREDIENTS
          </p>
          <p className="mt-1 text-[11px] leading-snug text-text-secondary">
            Confirm anything that looked ambiguous, then save.
          </p>
        </div>

        <div className="mx-3.5 mt-3 rounded-2xl border border-accent-working/40 bg-accent-working/[0.08] px-3.5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-working">
            Check these first
          </p>
          <p className="mt-1.5 text-[14px] leading-snug text-text-primary">
            1 ingredient looked unclear. Tap to tweak or confirm before saving.
          </p>
        </div>

        <div className="p-3.5 pt-3">
          <p className="mb-2 px-0.5 text-[13px] font-semibold text-text-primary">
            Weeknight Ragu
          </p>
          <ul className="overflow-hidden rounded-2xl border border-border-hairline">
            <li className="flex items-stretch gap-1 bg-accent-working/[0.06]">
              <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3.5 text-left">
                <span className="inline-flex h-6 shrink-0 items-center rounded-md bg-accent-working/20 px-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-accent-working">
                  Check
                </span>
                <span className="min-w-0 text-[15px] leading-[22px] text-text-primary">
                  <span className="mr-2 font-semibold tabular-nums">2 tbsp</span>
                  <span className="font-normal">olive oill</span>
                </span>
                <Pencil className="ml-auto h-3.5 w-3.5 shrink-0 text-text-secondary" />
              </div>
              <div className="inline-flex w-14 shrink-0 flex-col items-center justify-center gap-0.5 border-l border-border-hairline text-accent-working">
                <Check className="h-4 w-4" strokeWidth={2.5} />
                <span className="text-[10px] font-semibold">OK</span>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function FeaturesVisual() {
  return (
    <div className="mx-auto w-full max-w-[280px]" aria-hidden>
      <div className="overflow-hidden rounded-[18px] border border-border-hairline bg-bg-surface shadow-[0_8px_24px_rgba(10,10,10,0.06)]">
        <div className="flex items-center justify-between border-b border-border-hairline px-3 py-2">
          <p className="text-[10px] font-semibold tracking-[0.08em] text-text-secondary">
            COOK MODE
          </p>
          <p className="text-[10px] text-text-secondary">2 of 6</p>
        </div>
        <div className="bg-bg-primary px-4 py-5">
          <p className="font-display text-[42px] leading-none tracking-tight">
            2
          </p>
          <p className="mt-3 text-[14px] leading-snug text-text-primary">
            Simmer until thickened, then fold in the pasta.
          </p>
        </div>
      </div>
    </div>
  );
}

function StepVisual({ kind }: { kind: (typeof STEPS)[number]["visual"] }) {
  switch (kind) {
    case "brand":
      return <BrandVisual />;
    case "import":
      return <ImportVisual />;
    case "other":
      return <OtherVisual />;
    case "memory":
      return <MemoryVisual />;
    case "features":
      return <FeaturesVisual />;
  }
}

export function OnboardingFlow({ open, onFinish, onBackToIntro }: Props) {
  const [index, setIndex] = useState(0);
  const [stepReady, setStepReady] = useState(false);

  useEffect(() => {
    if (!open) {
      setIndex(0);
      setStepReady(false);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setStepReady(false);
    const id = window.requestAnimationFrame(() => setStepReady(true));
    return () => window.cancelAnimationFrame(id);
  }, [open, index]);

  if (!open) return null;

  const step = STEPS[index];
  const last = index === STEPS.length - 1;
  const first = index === 0;

  function finish(reason: OnboardingFinishReason) {
    void hapticMedium();
    onFinish(reason);
  }

  function back() {
    void hapticLight();
    if (first) {
      onBackToIntro?.();
      return;
    }
    setIndex((i) => Math.max(i - 1, 0));
  }

  function next() {
    void hapticLight();
    if (last) {
      finish("capture");
      return;
    }
    setIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-bg-primary"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <p className="font-display text-[15px] tracking-tight">RENDO</p>
        <button
          type="button"
          className="px-2 py-2 text-[13px] text-text-secondary"
          onClick={() => finish("skip")}
        >
          Skip
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div
          key={step.id}
          className={cn(
            "flex min-h-0 flex-1 flex-col transition-all duration-300",
            stepReady ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
          )}
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
            <div
              className={cn(
                "flex flex-col",
                step.visual === "brand" ? "gap-4 pt-1" : "justify-center gap-6 pt-2"
              )}
            >
              <div
                className={cn(
                  step.visual === "brand"
                    ? "mx-auto w-full max-w-[402px] shrink-0"
                    : "shrink-0"
                )}
              >
                <StepVisual kind={step.visual} />
              </div>

              <div className="mx-auto w-full max-w-sm shrink-0 pb-2 text-center">
                <p className="text-[11px] font-semibold tracking-[0.14em] text-text-secondary">
                  {step.eyebrow}
                </p>
                {step.title ? (
                  <h2
                    id="onboarding-title"
                    className="mt-2 font-display text-[26px] leading-[1.1] tracking-tight sm:text-[30px]"
                  >
                    {step.id === "brand" ? (
                      <>
                        However you found it,{" "}
                        <span className="whitespace-nowrap">it goes here.</span>
                      </>
                    ) : (
                      step.title
                    )}
                  </h2>
                ) : (
                  <h2 id="onboarding-title" className="sr-only">
                    Rendo
                  </h2>
                )}
                {step.body ? (
                  <p className="mx-auto mt-3 max-w-[34ch] text-[15px] leading-snug text-text-secondary">
                    {step.body}
                  </p>
                ) : null}
                {step.items.length ? (
                  <ul
                    className={cn(
                      "mx-auto mt-4 w-full max-w-sm text-left",
                      step.visual === "features" ? "space-y-3.5" : "space-y-3"
                    )}
                  >
                    {step.items.map((item) =>
                      item.icon ? (
                        <li
                          key={item.label}
                          className="flex items-start gap-3 leading-snug"
                        >
                          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border-hairline bg-bg-surface">
                            <StepItemIcon icon={item.icon} />
                          </span>
                          <p className="min-w-0 pt-1.5 text-[15px] text-text-primary">
                            <span className="font-semibold">{item.label}</span>
                            <span className="text-text-secondary">
                              {" "}
                              {item.blurb}
                            </span>
                          </p>
                        </li>
                      ) : (
                        <li key={item.label} className="leading-snug">
                          <p className="text-[15px] font-semibold text-text-primary">
                            {item.label}
                          </p>
                          <p className="mt-0.5 text-[13px] text-text-secondary">
                            {item.blurb}
                          </p>
                        </li>
                      )
                    )}
                  </ul>
                ) : null}
                {step.detail ? (
                  <p className="mx-auto mt-2.5 max-w-[34ch] text-[12px] leading-snug text-text-secondary/80">
                    {step.detail}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex shrink-0 flex-col items-center gap-4">
          <ProgressDots index={index} total={STEPS.length} />
          <div className="flex w-full max-w-sm gap-3">
            <button
              type="button"
              onClick={back}
              className="flex h-12 min-w-[5.75rem] shrink-0 items-center justify-center rounded-full border border-border-hairline bg-bg-surface px-5 text-[15px] font-semibold text-text-primary"
            >
              Back
            </button>
            <button
              type="button"
              onClick={next}
              className="flex h-12 min-w-0 flex-1 items-center justify-center rounded-full bg-text-primary px-4 text-[15px] font-semibold text-bg-primary"
            >
              {last ? "Add your first recipe" : "Next"}
            </button>
          </div>
          {last ? (
            <button
              type="button"
              onClick={() => finish("done")}
              className="py-1 text-[13px] text-text-secondary"
            >
              Or browse the library
            </button>
          ) : (
            <div className="h-7" aria-hidden />
          )}
        </div>
      </div>
    </div>
  );
}
