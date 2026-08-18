import type { CookEvent, Recipe } from "@/lib/db/types";

export type CookMemory = {
  cooked_at?: string | null;
  occasion?: string | null;
  who?: string[];
  note?: string | null;
};

function trimText(value: string | null | undefined): string | null {
  const next = value?.replace(/\s+/g, " ").trim() ?? "";
  return next ? next : null;
}

function cleanWho(who: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of who ?? []) {
    const name = raw.replace(/\s+/g, " ").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

export function parseCookEvents(value: unknown): CookEvent[] {
  if (!Array.isArray(value)) return [];
  const events: CookEvent[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const id = typeof rec.id === "string" ? rec.id.trim() : "";
    const cookedAt =
      typeof rec.cooked_at === "string" ? rec.cooked_at.trim() : "";
    if (!id || !cookedAt) continue;
    events.push({
      id,
      cooked_at: cookedAt,
      occasion: trimText(typeof rec.occasion === "string" ? rec.occasion : null),
      who: cleanWho(Array.isArray(rec.who) ? rec.who.map(String) : []),
      note: trimText(typeof rec.note === "string" ? rec.note : null),
    });
  }
  return events;
}

export function sortCookEvents(events: CookEvent[]): CookEvent[] {
  return [...events].sort((a, b) => {
    const byDate = Date.parse(b.cooked_at) - Date.parse(a.cooked_at);
    if (Number.isFinite(byDate) && byDate !== 0) return byDate;
    return b.id.localeCompare(a.id);
  });
}

export function cookEventHasMemory(event: CookEvent): boolean {
  return Boolean(
    event.occasion?.trim() || event.who.length || event.note?.trim()
  );
}

export function newCookEventId(): string {
  return `cook_${crypto.randomUUID()}`;
}

/** Synthesize a single date-only event so older cooked recipes still have a log row. */
export function backfillCookEvents(recipe: Recipe): CookEvent[] {
  const existing = parseCookEvents(recipe.cook_events);
  if (existing.length) return existing;
  const times = recipe.times_cooked ?? 0;
  if (!recipe.cooked && !recipe.last_cooked_at && times <= 0) return [];
  return [
    {
      id: `cook_legacy_${recipe.id}`,
      cooked_at: recipe.last_cooked_at || recipe.updated_at,
      occasion: null,
      who: [],
      note: null,
    },
  ];
}

export function withDerivedCooked(
  recipe: Recipe,
  events: CookEvent[] = backfillCookEvents(recipe)
): Recipe {
  const sorted = sortCookEvents(events);
  const times = Math.max(sorted.length, recipe.times_cooked ?? 0);
  const latest = sorted[0];
  return {
    ...recipe,
    cook_events: events,
    cooked: times > 0,
    times_cooked: times,
    last_cooked_at:
      latest?.cooked_at ?? (times > 0 ? recipe.last_cooked_at ?? null : null),
  };
}

export function appendCookEvent(
  recipe: Recipe,
  cookedAt = new Date().toISOString(),
  memory?: CookMemory
): { recipe: Recipe; event: CookEvent } {
  const events = backfillCookEvents(recipe);
  const event: CookEvent = {
    id: newCookEventId(),
    cooked_at: cookedAt,
    occasion: trimText(memory?.occasion),
    who: cleanWho(memory?.who),
    note: trimText(memory?.note),
  };
  const nextEvents = [...events, event];
  const previousTimes = recipe.times_cooked ?? events.length;
  return {
    recipe: withDerivedCooked(
      { ...recipe, times_cooked: Math.max(previousTimes + 1, nextEvents.length) },
      nextEvents
    ),
    event,
  };
}

export function popLatestCookEvent(recipe: Recipe): Recipe {
  const events = sortCookEvents(backfillCookEvents(recipe));
  const previousTimes = recipe.times_cooked ?? events.length;
  const times = Math.max(0, previousTimes - 1);
  if (times === 0) {
    return withDerivedCooked({ ...recipe, times_cooked: 0 }, []);
  }
  // Legacy recipes can have a count higher than logged events — decrement count only.
  if (events.length < previousTimes) {
    return withDerivedCooked({ ...recipe, times_cooked: times }, events);
  }
  return withDerivedCooked(
    { ...recipe, times_cooked: times },
    events.slice(1)
  );
}

export function setLatestCookedAt(recipe: Recipe, iso: string): Recipe {
  const events = backfillCookEvents(recipe);
  if (!events.length) {
    return appendCookEvent(recipe, iso).recipe;
  }
  const latest = sortCookEvents(events)[0];
  const nextEvents = events.map((event) =>
    event.id === latest.id ? { ...event, cooked_at: iso } : event
  );
  return withDerivedCooked(
    { ...recipe, times_cooked: Math.max(recipe.times_cooked ?? 0, 1) },
    nextEvents
  );
}

export function applyCookMemory(
  recipe: Recipe,
  eventId: string,
  memory: CookMemory
): Recipe {
  const events = backfillCookEvents(recipe).map((event) =>
    event.id === eventId
      ? {
          ...event,
          cooked_at: memory.cooked_at?.trim() || event.cooked_at,
          occasion: trimText(memory.occasion),
          who: cleanWho(memory.who),
          note: trimText(memory.note),
        }
      : event
  );
  return withDerivedCooked(recipe, events);
}

/** Fill the latest date-only cook, or log a new cook with this memory. */
export function rememberCook(recipe: Recipe, memory: CookMemory): Recipe {
  const cookedAt = memory.cooked_at?.trim() || new Date().toISOString();
  const events = sortCookEvents(backfillCookEvents(recipe));
  const latest = events[0];
  if (!latest) {
    return appendCookEvent(recipe, cookedAt, memory).recipe;
  }
  if (!cookEventHasMemory(latest)) {
    return applyCookMemory(recipe, latest.id, {
      ...memory,
      cooked_at: cookedAt,
    });
  }
  return appendCookEvent(recipe, cookedAt, memory).recipe;
}

export function applyLatestCookMemory(
  recipe: Recipe,
  memory: CookMemory
): Recipe {
  const latest = sortCookEvents(backfillCookEvents(recipe))[0];
  if (!latest) return recipe;
  return applyCookMemory(recipe, latest.id, memory);
}

export function mergeCookEvents(
  remote?: CookEvent[] | null,
  local?: CookEvent[] | null
): CookEvent[] {
  const map = new Map<string, CookEvent>();
  for (const event of [...parseCookEvents(local), ...parseCookEvents(remote)]) {
    const prev = map.get(event.id);
    if (!prev) {
      map.set(event.id, event);
      continue;
    }
    const score = (item: CookEvent) =>
      (item.occasion ? 1 : 0) + (item.note ? 1 : 0) + item.who.length;
    if (score(event) >= score(prev)) map.set(event.id, event);
  }
  return [...map.values()];
}
