import type { Category } from "@/lib/types";
import { getCategories, saveCategories, getExpenses, saveExpenses } from "@/lib/storage";

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

// Writes the expense cascade BEFORE the category list, deliberately. If the
// category write went first and then the expense write failed, oldName
// would no longer be findable (rename already "succeeded" on the category
// side), so a retry would return not-found and the obvious manual recovery
// (re-add oldName, rename again) would hit duplicate on newName -- leaving
// expenses permanently stuck on an orphaned name with no way back through
// this module's own API. Writing expenses first means: if that write fails,
// nothing changed yet (a clean retry); if it succeeds and the category
// write then fails, oldName is still findable and a retry heals cleanly
// (the second cascade attempt is a harmless no-op).
export function renameCategory(oldName: string, newName: string): CategoryMutationResult {
  if (isDefaultCategoryName(oldName)) return { ok: false, reason: "default" };

  const current = getCategories();
  const target = current.find((c) => c.name === oldName);
  if (!target) return { ok: false, reason: "not-found" };

  const trimmedNew = newName.trim();
  if (trimmedNew === "") return { ok: false, reason: "invalid" };

  const isDuplicate = getAllCategories().some(
    (c) => c.name.toLowerCase() === trimmedNew.toLowerCase() && c.name !== oldName
  );
  if (isDuplicate) return { ok: false, reason: "duplicate" };

  const updatedExpenses = getExpenses().map((e) =>
    e.category === oldName ? { ...e, category: trimmedNew } : e
  );
  const expensesResult = saveExpenses(updatedExpenses);
  if (!expensesResult.ok) {
    return { ok: false, reason: "storage", error: expensesResult.error };
  }

  const updatedCategories = current.map((c) =>
    c.name === oldName ? { ...c, name: trimmedNew } : c
  );
  const categoriesResult = saveCategories(updatedCategories);
  if (!categoriesResult.ok) {
    return { ok: false, reason: "storage", error: categoriesResult.error };
  }

  return { ok: true };
}

export function deleteCategory(name: string): CategoryMutationResult {
  if (isDefaultCategoryName(name)) return { ok: false, reason: "default" };

  const current = getCategories();
  if (!current.some((c) => c.name === name)) return { ok: false, reason: "not-found" };

  const updated = current.filter((c) => c.name !== name);
  const result = saveCategories(updated);
  return result.ok ? { ok: true } : { ok: false, reason: "storage", error: result.error };
}
