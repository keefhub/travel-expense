import { test, expect, type Page } from "@playwright/test";

// Keys and shapes come from REFERENCE.md §6 and lib/types.ts — not guessed.
const STORAGE_KEYS = {
  trip: "travel-expense:trip",
  categories: "travel-expense:categories",
} as const;

const TRIP = {
  destinationCountry: "Japan",
  currency: "JPY",
  startDate: "2026-01-01",
  endDate: "2026-01-10",
};

// /categories redirects to / when getTrip() returns null, so every test needs
// an active trip seeded before the page's first render.
async function seed(page: Page, customCategories: { name: string; isDefault: boolean }[] = []) {
  await page.addInitScript(
    ([keys, trip, categories]) => {
      window.localStorage.setItem(keys.trip, JSON.stringify(trip));
      window.localStorage.setItem(keys.categories, JSON.stringify(categories));
    },
    [STORAGE_KEYS, TRIP, customCategories] as const
  );
}

test.describe("feature 010 — manage expense categories", () => {
  test("lists the six default categories with no rename or delete action", async ({ page }) => {
    await seed(page);
    await page.goto("/categories");

    await expect(page.getByRole("heading", { name: "Categories" })).toBeVisible();

    for (const name of [
      "Food",
      "Transport",
      "Accommodation",
      "Shopping",
      "Activities",
      "Others",
    ]) {
      await expect(page.getByRole("listitem").filter({ hasText: name })).toBeVisible();
    }

    // Defaults are not renamable or deletable — no action buttons anywhere on a
    // list containing only defaults.
    await expect(page.getByRole("button", { name: "Rename" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
    await expect(page.getByText("No custom categories yet.")).toBeVisible();
  });

  test("a custom category offers both rename and delete", async ({ page }) => {
    await seed(page, [{ name: "Souvenirs", isDefault: false }]);
    await page.goto("/categories");

    const row = page.getByRole("listitem").filter({ hasText: "Souvenirs" });
    await expect(row.getByRole("button", { name: "Rename" })).toBeVisible();
    await expect(row.getByRole("button", { name: "Delete" })).toBeVisible();
    await expect(page.getByText("No custom categories yet.")).toBeHidden();
  });

  test("renaming a custom category to a blank name is rejected", async ({ page }) => {
    await seed(page, [{ name: "Souvenirs", isDefault: false }]);
    await page.goto("/categories");

    await page.getByRole("button", { name: "Rename" }).click();
    await page.getByLabel("Category name").fill("   ");
    await page.getByRole("button", { name: "Save" }).click();

    // Scoped to the list: Next.js renders its own role="alert" route announcer
    // on every page, so an unscoped getByRole("alert") is ambiguous here.
    await expect(
      page.getByRole("listitem").getByRole("alert")
    ).toHaveText("Enter a category name.");
    // The original name survives a rejected rename.
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Souvenirs" })).toBeVisible();
  });

  test("deleting a custom category removes it from the list", async ({ page }) => {
    await seed(page, [{ name: "Souvenirs", isDefault: false }]);
    await page.goto("/categories");

    await page.getByRole("button", { name: "Delete" }).click();

    await expect(page.getByRole("listitem").filter({ hasText: "Souvenirs" })).toHaveCount(0);
    await expect(page.getByText("No custom categories yet.")).toBeVisible();
    // Defaults are untouched by a custom-category delete.
    await expect(page.getByRole("listitem").filter({ hasText: "Food" })).toBeVisible();
  });
});
