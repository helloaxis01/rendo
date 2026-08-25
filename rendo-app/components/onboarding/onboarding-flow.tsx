"use client";

import { useEffect, useState } from "react";
import {
  BookMarked,
  Camera,
  Check,
  FileText,
  Link2,
  List,
  NotebookPen,
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
    body: "A screenshot. A link. A memory of your grandmother's recipe. Rendo turns it into something you'll actually cook from.",
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
    title: "However else you find them",
    body: "",
    detail: "",
    items: [
      {
        label: "Paste a link",
        blurb: "Recipe blogs and websites import automatically.",
      },
      {
        label: "Type or paste text",
        blurb: "Copied ingredients or steps from anywhere.",
      },
      {
        label: "Photo of a cookbook page",
        blurb: "Snap it like a screenshot.",
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

function BrandVisual() {
  return (
    <div
      className="rendo-onboard-morph mx-auto w-full max-w-[280px]"
      aria-hidden
    >
      <div className="relative aspect-[4/5] w-full">
        {/* Messy Instagram screenshot */}
        <div className="rendo-onboard-morph-messy absolute inset-0 flex flex-col overflow-hidden rounded-[18px] border border-border-hairline bg-bg-surface shadow-[0_12px_40px_rgba(10,10,10,0.08)]">
          <div className="flex items-center gap-2 border-b border-border-hairline px-2.5 py-2">
            <span className="h-6 w-6 shrink-0 rounded-full bg-bg-muted ring-1 ring-border-hairline" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold leading-none">
                pasta.late.night
              </p>
              <p className="mt-0.5 truncate text-[9px] text-text-secondary">
                Sponsored · Instagram
              </p>
            </div>
            <span className="text-[12px] leading-none text-text-secondary">
              ···
            </span>
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden bg-[#1a1a1a] px-2.5 py-2.5 text-left">
            <div className="rendo-onboard-messy-shot h-full overflow-hidden rounded-[10px] border border-white/10 bg-[#f3efe6] px-2.5 py-2 text-[#1a1a1a] shadow-inner">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8a8478]">
                Screenshot
              </p>
              <p className="mt-1.5 font-display text-[13px] leading-none tracking-tight">
                weeknight ragu!!!!
              </p>
              <p className="mt-2 space-y-0.5 text-[9px] leading-snug text-[#3a3832]">
                <span className="block">1. brown the meat (dont skip)</span>
                <span className="block">2 onion + garlic 🧄 lots</span>
                <span className="block">tin of tomatoes?? maybe 2</span>
                <span className="block">wine if u have it idk</span>
                <span className="block">pasta water !!!!</span>
                <span className="block text-[#8a8478]">
                  #reels #easyrecipe #dinnerideas #pasta
                </span>
              </p>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#f3efe6] to-transparent" />
            </div>
            <div className="pointer-events-none absolute -right-1 top-8 rotate-6 rounded-md border border-white/20 bg-white/10 px-1.5 py-0.5 text-[8px] text-white/80 backdrop-blur-sm">
              1/4
            </div>
          </div>
          <div className="space-y-1.5 px-2.5 py-2">
            <div className="flex gap-3 text-[11px] text-text-secondary">
              <span>♡ 2,418</span>
              <span>💬 84</span>
              <span>↗</span>
            </div>
            <p className="line-clamp-2 text-[10px] leading-snug text-text-primary">
              <span className="font-semibold">pasta.late.night</span> save this
              for thursday when you have zero energy 🍝✨
            </p>
          </div>
        </div>

        {/* Clean Rendo recipe card */}
        <div className="rendo-onboard-morph-clean absolute inset-0 flex flex-col justify-center">
          <div className="overflow-hidden rounded-[18px] border border-border-hairline bg-bg-surface shadow-[0_12px_40px_rgba(10,10,10,0.08)]">
            <div className="rendo-type-cover relative aspect-[4/3] w-full">
              <span className="rendo-type-cover-desc absolute inset-0 z-10 flex items-center justify-center p-5 text-center">
                olive oil · onion · garlic · tomato · pasta
              </span>
            </div>
            <div className="border-t border-border-hairline px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display text-[15px] leading-tight tracking-tight">
                    Weeknight Ragu
                  </p>
                  <p className="mt-0.5 text-[10px] text-text-secondary">
                    Dinner · Pasta · 35 min
                  </p>
                </div>
                <span className="mt-0.5 text-[12px] text-text-secondary">♡</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImportVisual() {
  return (
    <div className="mx-auto w-full max-w-md" aria-hidden>
      <div className="flex items-stretch justify-center gap-1.5 sm:gap-2">
        {/* Instagram post */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[12px] border border-border-hairline bg-bg-surface shadow-[0_8px_24px_rgba(10,10,10,0.06)]">
          <div className="flex items-center gap-1 border-b border-border-hairline px-1.5 py-1">
            <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-bg-muted" />
            <p className="truncate text-[7px] font-semibold leading-none">
              pasta.late
            </p>
          </div>
          <div className="aspect-square bg-bg-muted" />
          <div className="space-y-0.5 px-1.5 py-1.5">
            <p className="text-[7px] leading-none text-text-secondary">♡ 2.4k</p>
            <p className="line-clamp-4 text-[7px] leading-[1.25] text-text-primary">
              <span className="font-semibold">pasta.late</span> weeknight ragu!!
              brown meat, onion garlic, tomatoes, pasta water #recipe
            </p>
          </div>
          <p className="border-t border-border-hairline px-1.5 py-1 text-center text-[7px] font-semibold tracking-[0.06em] text-text-secondary">
            POST
          </p>
        </div>

        <span
          className="flex shrink-0 items-center self-center font-display text-[14px] text-text-secondary"
          aria-hidden
        >
          →
        </span>

        {/* Screenshot */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[12px] border border-border-hairline bg-bg-surface shadow-[0_8px_24px_rgba(10,10,10,0.06)]">
          <div className="flex items-center justify-between border-b border-border-hairline px-1.5 py-1">
            <p className="text-[7px] font-semibold tracking-[0.06em] text-text-secondary">
              SCREENSHOT
            </p>
            <p className="text-[7px] text-text-secondary">Just now</p>
          </div>
          <div className="relative min-h-0 flex-1 bg-[#1a1a1a] p-1">
            <div className="h-full overflow-hidden rounded-[6px] bg-[#f3efe6] px-1.5 py-1.5 text-[#1a1a1a]">
              <p className="font-display text-[8px] leading-none tracking-tight">
                weeknight ragu!!
              </p>
              <p className="mt-1 space-y-0.5 text-[6.5px] leading-snug text-[#3a3832]">
                <span className="block">brown the meat</span>
                <span className="block">onion + garlic</span>
                <span className="block">tomatoes</span>
                <span className="block">pasta water</span>
              </p>
            </div>
          </div>
          <p className="border-t border-border-hairline px-1.5 py-1 text-center text-[7px] font-semibold tracking-[0.06em] text-text-secondary">
            CAPTURE
          </p>
        </div>

        <span
          className="flex shrink-0 items-center self-center font-display text-[14px] text-text-secondary"
          aria-hidden
        >
          →
        </span>

        {/* Rendo card */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[12px] border border-border-hairline bg-bg-surface shadow-[0_8px_24px_rgba(10,10,10,0.06)]">
          <div className="rendo-type-cover relative aspect-[4/3] w-full">
            <span className="rendo-type-cover-desc absolute inset-0 z-10 flex items-center justify-center p-1.5 text-center !text-[6.5px] !leading-snug">
              olive oil · onion · garlic · tomato · pasta
            </span>
          </div>
          <div className="border-t border-border-hairline px-1.5 py-1.5">
            <p className="font-display text-[8px] leading-tight tracking-tight">
              Weeknight Ragu
            </p>
            <p className="mt-0.5 text-[6.5px] text-text-secondary">
              Dinner · 35 min
            </p>
          </div>
          <p className="mt-auto border-t border-border-hairline px-1.5 py-1 text-center text-[7px] font-semibold tracking-[0.06em] text-text-secondary">
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

        <div className="mx-3.5 mt-3 rounded-2xl border border-accent-working/40 bg-accent-working/[0.08] px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-working">
            Check these first
          </p>
          <p className="mt-1 text-[12px] leading-snug text-text-primary">
            1 ingredient looked unclear. Tap to tweak or confirm before saving.
          </p>
        </div>

        <div className="p-3.5 pt-3">
          <p className="mb-2 px-0.5 text-[12px] font-semibold text-text-primary">
            Weeknight Ragu
          </p>
          <ul className="overflow-hidden rounded-2xl border border-border-hairline">
            <li className="flex items-stretch gap-1 bg-accent-working/[0.06]">
              <div className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-3 text-left">
                <span className="inline-flex h-6 shrink-0 items-center rounded-md bg-accent-working/20 px-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-accent-working">
                  Check
                </span>
                <span className="min-w-0 text-[14px] leading-snug text-text-primary">
                  <span className="mr-1.5 font-semibold tabular-nums">
                    2 tbsp
                  </span>
                  <span>olive oill</span>
                </span>
              </div>
              <div className="inline-flex w-12 shrink-0 flex-col items-center justify-center gap-0.5 border-l border-border-hairline text-accent-working">
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                <span className="text-[9px] font-semibold">OK</span>
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

export function OnboardingFlow({ open, onFinish }: Props) {
  const [index, setIndex] = useState(0);
  const [entered, setEntered] = useState(false);
  const [stepReady, setStepReady] = useState(false);

  useEffect(() => {
    if (!open) {
      setIndex(0);
      setEntered(false);
      setStepReady(false);
      return;
    }
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
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

  function finish(reason: OnboardingFinishReason) {
    void hapticMedium();
    onFinish(reason);
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
      className={cn(
        "fixed inset-0 z-[110] flex flex-col bg-bg-primary transition-opacity duration-300",
        entered ? "opacity-100" : "opacity-0"
      )}
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
            "flex min-h-0 flex-1 flex-col justify-center gap-8 transition-all duration-300",
            stepReady ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
          )}
        >
          <StepVisual kind={step.visual} />

          <div className="mx-auto w-full max-w-sm text-center">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-text-secondary">
              {step.eyebrow}
            </p>
            {step.title ? (
              <h2
                id="onboarding-title"
                className="mt-2 font-display text-[28px] leading-[1.05] tracking-tight sm:text-[32px]"
              >
                {step.title}
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

        <div className="mt-6 flex flex-col items-center gap-4">
          <ProgressDots index={index} total={STEPS.length} />
          <button
            type="button"
            onClick={next}
            className="flex h-12 w-full max-w-sm items-center justify-center rounded-full bg-text-primary text-[15px] font-semibold text-bg-primary"
          >
            {last ? "Add your first recipe" : "Next"}
          </button>
          {last ? (
            <button
              type="button"
              onClick={() => finish("done")}
              className="py-1 text-[13px] text-text-secondary"
            >
              Browse the library
            </button>
          ) : (
            <div className="h-7" aria-hidden />
          )}
        </div>
      </div>
    </div>
  );
}
