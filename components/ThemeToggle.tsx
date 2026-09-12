"use client";

import { useLayoutEffect, useState } from "react";
import {
  applyThemeToDocument,
  getThemePreference,
  isThemePreference,
  saveThemePreference,
  THEME_PREFERENCE_OPTIONS,
  type ThemePreference,
} from "@/lib/theme";

export default function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>(
    getThemePreference,
  );

  // Re-apply on mount. In development, React's Strict Mode remounts the tree
  // once and resets the attributes the pre-paint script in app/layout.tsx set;
  // this restores them. A no-op in production.
  useLayoutEffect(() => {
    applyThemeToDocument(getThemePreference());
  }, []);

  // While following the device, keep tracking it. An explicit choice clears
  // data-theme, so no listener is needed for those.
  useLayoutEffect(() => {
    if (preference !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyThemeToDocument("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  function handleChange(next: ThemePreference) {
    setPreference(next);
    saveThemePreference(next);
    applyThemeToDocument(next);
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="theme">Theme</label>
      <select
        id="theme"
        value={preference}
        onChange={(e) => {
          const next = e.target.value;
          if (isThemePreference(next)) handleChange(next);
        }}
      >
        {THEME_PREFERENCE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <p className="text-xs text-(--muted)">
        System follows your device setting.
      </p>
    </div>
  );
}
