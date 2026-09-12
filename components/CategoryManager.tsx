"use client";

import { useState, type FormEvent } from "react";
import {
  getAllCategories,
  isDefaultCategoryName,
  renameCategory,
  deleteCategory,
} from "@/lib/categories";

export default function CategoryManager() {
  const [categories, setCategories] = useState(() => getAllCategories());
  const [editingName, setEditingName] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const customCategoryCount = categories.filter(
    (c) => !isDefaultCategoryName(c.name)
  ).length;

  function startRename(name: string) {
    setEditingName(name);
    setRenameValue(name);
    setRenameError(null);
    setDeleteError(null);
  }

  function cancelRename() {
    setEditingName(null);
    setRenameError(null);
  }

  function handleRenameSubmit(e: FormEvent, oldName: string) {
    e.preventDefault();
    const result = renameCategory(oldName, renameValue);
    if (!result.ok) {
      if (result.reason === "duplicate") {
        setRenameError("This category already exists.");
      } else if (result.reason === "storage") {
        setRenameError(result.error);
      } else if (result.reason === "invalid") {
        setRenameError("Enter a category name.");
      } else {
        // "default" or "not-found" shouldn't normally happen — rename is only offered for
        // a custom category that was present in the list a moment ago — but could arise
        // from a concurrent change elsewhere (e.g. another tab deleting it mid-edit).
        setRenameError("This category could not be renamed. It may have been changed elsewhere.");
      }
      return;
    }
    setCategories(getAllCategories());
    setEditingName(null);
    setRenameError(null);
    setDeleteError(null);
  }

  function handleDelete(name: string) {
    const result = deleteCategory(name);
    if (!result.ok) {
      setDeleteError(
        result.reason === "storage" ? result.error : "Could not delete this category."
      );
      return;
    }
    setDeleteError(null);
    setRenameError(null);
    setCategories(getAllCategories());
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Categories</h1>
      {deleteError && <p role="alert">{deleteError}</p>}
      <ul className="flex flex-col divide-y divide-(--border)">
        {categories.map((category) => {
          const isDefault = isDefaultCategoryName(category.name);
          const isEditing = editingName === category.name;

          if (isEditing) {
            return (
              <li key={category.name} className="py-2">
                <form
                  onSubmit={(e) => handleRenameSubmit(e, category.name)}
                  className="flex flex-col gap-1"
                >
                  <label htmlFor={`rename-${category.name}`}>Category name</label>
                  <input
                    id={`rename-${category.name}`}
                    type="text"
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                  />
                  {renameError && <p role="alert">{renameError}</p>}
                  <div className="flex gap-2">
                    <button type="submit" className="btn-primary">
                      Save
                    </button>
                    <button type="button" onClick={cancelRename} className="btn-text">
                      Cancel
                    </button>
                  </div>
                </form>
              </li>
            );
          }

          return (
            <li
              key={category.name}
              className="flex items-center justify-between gap-2 py-2"
            >
              <span>{category.name}</span>
              {!isDefault && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => startRename(category.name)}
                    className="btn-text"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(category.name)}
                    className="btn-text danger"
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {customCategoryCount === 0 && (
        <p className="text-sm text-(--muted)">
          No custom categories yet. Add one from the record-expense page.
        </p>
      )}
    </div>
  );
}
