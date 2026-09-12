import type { CategoryTotal } from "@/lib/currency";

// A single-hue (accent teal, ~173°) lightness ramp, not a hue-per-segment rainbow: see
// design.md §2 "Category chart colors" — an arbitrary hue per segment reads as extra brand
// colors competing with the one-accent system. Category names are already in the legend text,
// so the ramp only needs to be distinguishable, not independently identifying.
function getCategoryColor(index: number, total: number): string {
  const steps = Math.max(total, 1);
  const lightness = steps === 1 ? 45 : 30 + (index * 40) / (steps - 1);
  return `hsl(173, 55%, ${lightness}%)`;
}

export default function CategoryPieChart({
  categoryTotals,
}: {
  categoryTotals: CategoryTotal[];
}) {
  const total = categoryTotals.reduce((sum, c) => sum + c.amount, 0);
  if (total <= 0) {
    return null;
  }

  const segments = categoryTotals.reduce<
    { category: string; percent: number; start: number; end: number; color: string }[]
  >((acc, c, index) => {
    const percent = (c.amount / total) * 100;
    const start = acc.length > 0 ? acc[acc.length - 1].end : 0;
    acc.push({
      category: c.category,
      percent,
      start,
      end: start + percent,
      color: getCategoryColor(index, categoryTotals.length),
    });
    return acc;
  }, []);

  const gradient = segments.map((s) => `${s.color} ${s.start}% ${s.end}%`).join(", ");
  const summary = segments.map((s) => `${s.category} ${s.percent.toFixed(0)}%`).join(", ");

  return (
    <div className="flex items-center gap-4">
      <div
        role="img"
        aria-label={`Spending by category: ${summary}`}
        className="h-32 w-32 shrink-0 rounded-full"
        style={{ background: `conic-gradient(${gradient})` }}
      />
      <ul className="flex flex-col gap-1">
        {segments.map((s) => (
          <li key={s.category} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span>
              {s.category}: {s.percent.toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
