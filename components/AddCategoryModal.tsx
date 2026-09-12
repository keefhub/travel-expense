"use client";

import { useState, type FormEvent } from "react";
import { addCategory } from "@/lib/categories";

export default function AddCategoryModal({
  onAdded,
  onCancel,
}: {
  onAdded: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const result = addCategory(name);
    if (!result.ok) {
      if (result.reason === "duplicate") {
        setError("This category already exists.");
      } else if (result.reason === "storage") {
        setError(result.error);
      } else {
        setError("Enter a category name.");
      }
      return;
    }
    onAdded(name.trim());
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg bg-(--background) p-4"
      >
        <h2 className="text-xl font-semibold">Add category</h2>
        <div className="flex flex-col gap-1">
          <label htmlFor="newCategoryName">Category name</label>
          <input
            id="newCategoryName"
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {error && <p role="alert">{error}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <button type="submit" className="btn-primary">
            Add
          </button>
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
