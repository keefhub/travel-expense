"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/expenses/new", label: "Add Expense" },
  { href: "/categories", label: "Categories" },
  { href: "/settings", label: "Settings" },
] as const;

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 border-t border-(--border) bg-(--surface) pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-2xl justify-around">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex flex-col items-center gap-1 px-4 py-3 text-sm ${
                  isActive ? "text-(--accent)" : "text-(--muted)"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
