import type { Category } from "@/lib/types";
import { getCategories } from "@/lib/storage";

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
