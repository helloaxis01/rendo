import Dexie, { type EntityTable } from "dexie";
import type { Preferences, Recipe, SyncMutation, TagRecord } from "./types";

export class RendoDB extends Dexie {
  recipes!: EntityTable<Recipe, "id">;
  tags!: EntityTable<TagRecord, "id">;
  sync_queue!: EntityTable<SyncMutation, "id">;
  preferences!: EntityTable<Preferences, "id">;

  constructor() {
    super("rendo");
    this.version(1).stores({
      recipes:
        "id, title, is_favorite, prep_time_minutes, updated_at, last_opened_at, *tags",
      tags: "id, name, count",
      sync_queue: "id, created_at, entity",
      preferences: "id",
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
