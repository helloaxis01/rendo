export function isUsableImageUrl(
  url: string | null | undefined
): url is string {
  if (!url) return false;
  const value = url.trim();
  if (!value || value === "null" || value === "undefined") return false;
  return /^(https?:|data:image\/|blob:)/i.test(value);
}
