import { createContext } from "react";

export const THEMES = ["dark", "light"];
export const DEFAULT_THEME = "dark";

export const ThemeContext = createContext({
  theme: DEFAULT_THEME,
  setTheme: () => {},
  toggleTheme: () => {},
});
