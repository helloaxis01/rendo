/**
 * Camera.pickImages returns a local file URL plus a webPath.
 * The iOS app loads https://rendorecipes.netlify.app, so fetch(webPath)
 * always fails with TypeError: Load failed. Read bytes via Filesystem instead.
 */
export function filesystemPathCandidates(path: string): string[] {
  const trimmed = path.trim();
  if (!trimmed) return [];
  const out: string[] = [];
  const add = (value: string) => {
    if (value && !out.includes(value)) out.push(value);
  };
  if (trimmed.startsWith("file:") || trimmed.startsWith("content:")) {
    add(trimmed);
    add(trimmed.replace(/^file:\/\//, ""));
  } else {
    add(`file://${trimmed}`);
    add(trimmed);
  }
  return out;
}

/** Always false for RENDO's remote WebView. Kept explicit so tests lock it in. */
export function canFetchGalleryWebPath(): boolean {
  return false;
}
