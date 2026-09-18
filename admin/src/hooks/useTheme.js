import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "u_do_theme";
const THEMES = ["dark", "light"];
const DEFAULT_THEME = "dark";

const readStoredTheme = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
};

/**
 * Applied once at boot, before React renders.
 *
 * useTheme lives inside AdminShell, but the sign-in, setup and access-denied
 * screens render outside it — without this they would ignore a stored light
 * theme and come up dark.
 */
export const applyStoredTheme = () => {
  document.documentElement.setAttribute("data-theme", readStoredTheme());
};

/**
 * Dark by default, light opt-in and remembered — the same behaviour, storage
 * key and default as the consumer app, so the console does not feel like a
 * different product in a different mood.
 *
 * The attribute goes on the root element, which is what tokens.css keys off.
 */
export function useTheme() {
  const [theme, setTheme] = useState(readStoredTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);

    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* Remembering the choice is best-effort. */
    }
  }, [theme]);

  const toggleTheme = useCallback(
    () => setTheme((current) => (current === "dark" ? "light" : "dark")),
    [],
  );

  return { theme, toggleTheme };
}
