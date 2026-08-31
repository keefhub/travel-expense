import Link from "next/link";

export const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/expenses/new", label: "Add Expense" },
  { href: "/categories", label: "Categories" },
  { href: "/settings", label: "Settings" },
] as const;

export default function BottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 border-t border-black/[.08] bg-white pb-[env(safe-area-inset-bottom)] dark:border-white/[.145] dark:bg-black"
    >
      <ul className="mx-auto flex max-w-2xl justify-around">
        {NAV_ITEMS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="flex flex-col items-center gap-1 px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
