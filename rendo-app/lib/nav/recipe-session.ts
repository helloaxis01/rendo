export type RecipeSession =
  | { kind: "auto" }
  | { kind: "recipe"; id: string }
  | { kind: "library" };

let session: RecipeSession = { kind: "auto" };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function getRecipeSession(): RecipeSession {
  return session;
}

export function subscribeRecipeSession(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function openRecipeSession(id: string) {
  if (session.kind === "recipe" && session.id === id) return;
  session = { kind: "recipe", id };
  emit();
}

export function closeRecipeSession() {
  if (session.kind === "library") return;
  session = { kind: "library" };
  emit();
}

export function followRouteSession() {
  if (session.kind === "auto") return;
  session = { kind: "auto" };
  emit();
}
