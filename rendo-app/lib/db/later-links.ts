import { getDb } from "@/lib/db";
import type { LaterLink } from "@/lib/db/types";

function notifyLaterLinksChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("rendo:vault-changed"));
}

export function normalizeLaterUrl(raw: string): string {
  const trimmed = raw.trim();
  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return trimmed.replace(/[),.;]+$/g, "");
  }
}

export function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "link";
  }
}

export function faviconUrlForDomain(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

function laterLinkId(): string {
  return `lnk_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export async function upsertLaterLinkFromUrl(
  url: string,
  options?: { title?: string; source?: string }
): Promise<LaterLink> {
  const db = getDb();
  const normalized = normalizeLaterUrl(url);
  const existing = await db.later_links.where("url").equals(normalized).first();
  const now = new Date().toISOString();
  const title =
    options?.title?.trim() ||
    existing?.title ||
    domainFromUrl(normalized);
  if (existing) {
    const next: LaterLink = {
      ...existing,
      domain: domainFromUrl(normalized),
      title,
      source: options?.source ?? existing.source,
      status: "open",
      updated_at: now,
    };
    await db.later_links.put(next);
    notifyLaterLinksChanged();
    return next;
  }

  const link: LaterLink = {
    id: laterLinkId(),
    url: normalized,
    domain: domainFromUrl(normalized),
    title,
    source: options?.source,
    created_at: now,
    updated_at: now,
    status: "open",
  };
  await db.later_links.put(link);
  notifyLaterLinksChanged();
  return link;
}

export async function listOpenLaterLinks(): Promise<LaterLink[]> {
  const db = getDb();
  const rows = await db.later_links.where("status").equals("open").toArray();
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function archiveLaterLink(id: string): Promise<void> {
  const db = getDb();
  const existing = await db.later_links.get(id);
  if (!existing) return;
  await db.later_links.put({
    ...existing,
    status: "archived",
    updated_at: new Date().toISOString(),
  });
  notifyLaterLinksChanged();
}

export async function deleteLaterLink(id: string): Promise<void> {
  const db = getDb();
  await db.later_links.delete(id);
  notifyLaterLinksChanged();
}

export function filterLaterLinks(
  links: LaterLink[],
  query: string
): LaterLink[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return links;
  return links.filter((link) => {
    const haystack = `${link.title} ${link.domain} ${link.url} ${link.source ?? ""}`.toLowerCase();
    return haystack.includes(needle);
  });
}
