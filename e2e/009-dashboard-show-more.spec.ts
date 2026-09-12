import { test, expect, type Page } from "@playwright/test";

// Keys and shapes come from REFERENCE.md §6 and lib/types.ts — not guessed.
const STORAGE_KEYS = {
  trip: "travel-expense:trip",
  expenses: "travel-expense:expenses",
} as const;

const TRIP = {
  destinationCountry: "Japan",
  currency: "JPY",
  startDate: "2026-01-01",
  endDate: "2026-01-31",
} as const;

// 1..count expenses, each on a distinct date 2026-01-01..2026-01-17 so
// getRecentExpenses's newest-first sort is deterministic. Every expense uses
// the trip's own currency (JPY) so no missing-rate warning interferes.
function makeExpenses(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `e${i + 1}`,
    amount: 1000 + i,
    currency: "JPY",
    category: "Food",
    date: `2026-01-${String(i + 1).padStart(2, "0")}`,
    paymentMethod: "Cash",
    location: "Tokyo",
  }));
}

// / redirects to trip setup when getTrip() is null, so every test seeds an
// active trip before first render.
async function seed(page: Page, expenses: unknown[]) {
  await page.addInitScript(
    ([keys, trip, exp]) => {
      window.localStorage.setItem(keys.trip, JSON.stringify(trip));
      window.localStorage.setItem(keys.expenses, JSON.stringify(exp));
    },
    [STORAGE_KEYS, TRIP, expenses] as const
  );
}

// Transaction rows only: the plain a[href^="/expenses/"] prefix also matches
// BottomNav's "Add Expense" link (/expenses/new), so it must be excluded.
const transactionLinks = (page: Page) =>
  page.locator('a[href^="/expenses/"]:not([href="/expenses/new"])');

test.describe("feature 009 — show more / show less recent transactions", () => {
  test("with 5 or fewer expenses, no Show more or Show less button renders", async ({ page }) => {
    await seed(page, makeExpenses(3));
    await page.goto("/");

    await expect(transactionLinks(page)).toHaveCount(3);
    await expect(page.getByRole("button", { name: "Show more" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Show less" })).toHaveCount(0);
  });

  test("Show more reveals in batches of 10 and Show less collapses back to 5", async ({ page }) => {
    await seed(page, makeExpenses(17));
    await page.goto("/");

    const links = transactionLinks(page);
    const showMore = page.getByRole("button", { name: "Show more" });
    const showLess = page.getByRole("button", { name: "Show less" });

    // Initial view: exactly the latest 5, with only "Show more" available.
    await expect(links).toHaveCount(5);
    await expect(showMore).toBeVisible();
    await expect(showLess).toHaveCount(0);

    // One click reveals 15 total; both controls are now available.
    await showMore.click();
    await expect(links).toHaveCount(15);
    await expect(showMore).toBeVisible();
    await expect(showLess).toBeVisible();

    // A second click reveals all 17 (capped at the total); "Show more" is gone.
    await showMore.click();
    await expect(links).toHaveCount(17);
    await expect(showMore).toHaveCount(0);
    await expect(showLess).toBeVisible();

    // "Show less" collapses fully back to 5.
    await showLess.click();
    await expect(links).toHaveCount(5);
    await expect(showMore).toBeVisible();
    await expect(showLess).toHaveCount(0);

    // visibleCount is component-local state — it resets to 5 on navigation away
    // and back (no persistence).
    await showMore.click();
    await expect(links).toHaveCount(15);

    await page.getByRole("link", { name: "Settings" }).click();
    await page.getByRole("link", { name: "Home" }).click();

    await expect(links).toHaveCount(5);
    await expect(showMore).toBeVisible();
    await expect(showLess).toHaveCount(0);
  });
});
