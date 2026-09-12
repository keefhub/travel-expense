/**
 * Theme preference: "system" follows the device, "light"/"dark" pin it.
 *
 * The resolved value is written to `data-theme` on `<html>`, which selects the
 * token block in app/globals.css. `app/layout.tsx` runs an inline script that
 * does the same thing before the first paint, so the saved theme is applied
 * without a flash of the wrong colors; keep that script and this module in step.
 */
export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "travel-expense:theme";

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

export const THEME_PREFERENCE_OPTIONS: readonly {
  value: ThemePreference;
  label: string;
}[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function getThemePreference(): ThemePreference {
  if (typeof window === "undefined") return DEFAULT_THEME_PREFERENCE;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(raw) ? raw : DEFAULT_THEME_PREFERENCE;
  } catch {
    // Storage can be blocked (private mode, disabled cookies). Follow the
    // device rather than failing to render a theme at all.
    return DEFAULT_THEME_PREFERENCE;
  }
}

export function saveThemePreference(preference: ThemePreference): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // A failed write only means the choice is not remembered for next visit.
    // The theme still applies for this session, so there is nothing to report.
  }
}

export function resolveTheme(
  preference: ThemePreference,
  prefersDark: boolean,
): ResolvedTheme {
  if (preference === "system") return prefersDark ? "dark" : "light";
  return preference;
}

export function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Applies `preference` to the document and returns the theme that resulted, or
 * `null` during server rendering where there is no document.
 */
export function applyThemeToDocument(
  preference: ThemePreference,
  options: { root?: HTMLElement; prefersDark?: boolean } = {},
): ResolvedTheme | null {
  if (typeof document === "undefined") return null;
  const root = options.root ?? document.documentElement;
  const resolved = resolveTheme(
    preference,
    options.prefersDark ?? systemPrefersDark(),
  );
  root.setAttribute("data-theme", resolved);
  return resolved;
}
