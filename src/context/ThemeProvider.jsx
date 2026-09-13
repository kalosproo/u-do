import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_THEME, THEMES, ThemeContext } from "./themeContext";

const STORAGE_KEY = "u_do_theme";

const readStoredTheme = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
};

/**
 * Dark charcoal is the default; cream white is opt-in and remembered. The
 * choice is written to the root element, which is what tokens.css keys off.
 */
export function ThemeProvider({ children }) {
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
    []
  );

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
