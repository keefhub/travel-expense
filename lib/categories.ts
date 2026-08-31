import type { Category } from "@/lib/types";
import { getCategories, saveCategories } from "@/lib/storage";

export type CategoryMutationResult =
  | { ok: true }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "duplicate" }
  | { ok: false; reason: "default" }
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "storage"; error: string };

const RAW_DEFAULT_CATEGORIES: Category[] = [
  { name: "Food", isDefault: true },
  { name: "Transport", isDefault: true },
  { name: "Accommodation", isDefault: true },
  { name: "Shopping", isDefault: true },
  { name: "Activities", isDefault: true },
  { name: "Others", isDefault: true },
];

export const DEFAULT_CATEGORIES: readonly Category[] = Object.freeze(
  RAW_DEFAULT_CATEGORIES.map((c) => Object.freeze(c))
);

export function getAllCategories(): Category[] {
  return [...DEFAULT_CATEGORIES.map((c) => ({ ...c })), ...getCategories()];
}

export function isDefaultCategoryName(name: string): boolean {
  return DEFAULT_CATEGORIES.some((c) => c.name.toLowerCase() === name.toLowerCase());
}

export function addCategory(name: string): CategoryMutationResult {
  const trimmed = name.trim();
  if (trimmed === "") return { ok: false, reason: "invalid" };

  const isDuplicate = getAllCategories().some(
    (c) => c.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (isDuplicate) return { ok: false, reason: "duplicate" };

  const updated = [...getCategories(), { name: trimmed, isDefault: false }];
  const result = saveCategories(updated);
  return result.ok ? { ok: true } : { ok: false, reason: "storage", error: result.error };
}
