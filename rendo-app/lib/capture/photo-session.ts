/**
 * Temporary capture frames for one ADD RECIPE session.
 * Held in memory only — never written to Photos, Dexie, or disk.
 */
export const MAX_SESSION_PHOTOS = 4;

let captures: File[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribePhotoSession(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPhotoSession(): File[] {
  return captures;
}

export function replacePhotoSession(files: File[]) {
  captures = files.slice(0, MAX_SESSION_PHOTOS);
  emit();
}

export function appendPhotoSession(files: File | File[]) {
  const incoming = Array.isArray(files) ? files : [files];
  captures = [...captures, ...incoming].slice(0, MAX_SESSION_PHOTOS);
  emit();
}

export function removePhotoSessionAt(index: number) {
  captures = captures.filter((_, i) => i !== index);
  emit();
}

export function clearPhotoSession() {
  captures = [];
  emit();
}

/** Camera / share captures must never land in the user's Photos library. */
export function writesCapturesToPhotoLibrary() {
  return false;
}
