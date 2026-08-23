import Dexie, { type EntityTable } from "dexie";
import type {
  LaterLink,
  Preferences,
  Recipe,
  SyncMutation,
  TagRecord,
} from "./types";
import type { ShoppingItem } from "@/lib/shopping/types";

export class RendoDB extends Dexie {
  recipes!: EntityTable<Recipe, "id">;
  tags!: EntityTable<TagRecord, "id">;
  sync_queue!: EntityTable<SyncMutation, "id">;
  preferences!: EntityTable<Preferences, "id">;
  later_links!: EntityTable<LaterLink, "id">;
  shopping_items!: EntityTable<ShoppingItem, "id">;

  constructor() {
    super("rendo");
    this.version(1).stores({
      recipes:
        "id, title, is_favorite, prep_time_minutes, updated_at, last_opened_at, *tags",
      tags: "id, name, count",
      sync_queue: "id, created_at, entity",
      preferences: "id",
    });
    this.version(2).stores({
      later_links: "id, &url, created_at, status, domain",
    });
    this.version(3).stores({
      shopping_items: "id, name_key, created_at, checked",
    });
  }
}

export const db = typeof window !== "undefined" ? new RendoDB() : null;

export function getDb(): RendoDB {
  if (!db) {
    throw new Error("Dexie is only available in the browser");
  }
  return db;
}
