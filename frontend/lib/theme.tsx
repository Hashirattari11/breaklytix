// Breaklytix theme engine — light / dark / system.
// A no-flash inline script in app/layout.tsx applies the stored preference
// BEFORE React hydrates; these helpers keep state in sync at runtime.

export type ThemePref = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_KEY = "autofix_theme";

export function getStoredTheme(): ThemePref {
  if (typeof window === "undefined") return "dark";
  try {
    const raw = window.localStorage.getItem(THEME_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // Storage unavailable (private mode etc.) — fall through to dark default.
  }
  return "dark";
}

export function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

export function resolveTheme(pref: ThemePref): ResolvedTheme {
  if (pref === "system") return systemPrefersDark() ? "dark" : "light";
  return pref;
}

export function applyTheme(pref: ThemePref): ResolvedTheme {
  const resolved = resolveTheme(pref);
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", resolved);
  }
  return resolved;
}

export function initTheme(): ThemePref {
  const pref = getStoredTheme();
  applyTheme(pref);
  return pref;
}

export function setTheme(pref: ThemePref): ResolvedTheme {
  try {
    window.localStorage.setItem(THEME_KEY, pref);
  } catch {
    // Ignore storage failures — theme still applies for this session.
  }
  return applyTheme(pref);
}

// Re-apply the resolved theme when the OS preference changes while the user
// is in "system" mode. Returns an unsubscribe function.
export function watchSystemTheme(pref: ThemePref): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => {
    if (getStoredTheme() === "system") applyTheme("system");
  };
  mql.addEventListener?.("change", handler);
  return () => mql.removeEventListener?.("change", handler);
}

// Theme toggle icon (sun/moon) shared by header + user menu.
// Renders BOTH glyphs and morphs between them via CSS classes for a smooth
// professional rotate/fade transition when the theme changes.
export function ThemeGlyph({ dark }: { dark: boolean }) {
  return (
    <span className={`p-theme-glyph ${dark ? "is-dark" : "is-light"}`} aria-hidden="true">
      <svg className="p-theme-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
      <svg className="p-theme-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </span>
  );
}