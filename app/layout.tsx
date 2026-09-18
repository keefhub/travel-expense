import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import TripSwitcher from "@/components/TripSwitcher";
import { THEME_STORAGE_KEY } from "@/lib/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Travel Expense Tracker",
  description:
    "A mobile-first, offline-capable travel expense tracker with multi-currency expenses and manual exchange rates.",
};

// Applies the saved theme before the browser paints, so a chosen light/dark
// theme never flashes the other one first. "System" clears data-theme and lets
// the CSS `prefers-color-scheme` query decide, so this only handles the two
// explicit values. Inline and blocking on purpose: see
// node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md.
// Kept in step with lib/theme.ts, which owns the same key and values.
const themeInitScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}else{document.documentElement.removeAttribute("data-theme")}}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full bg-background text-foreground antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <TripSwitcher />
        <main className="mx-auto w-full max-w-2xl flex-1 pb-20">
          {children}
        </main>
        <BottomNav />
      </body>
    </html>
  );
}
