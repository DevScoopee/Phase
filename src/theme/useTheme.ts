import { useThemeStore } from './themeStore';

/** Convenience hook — returns only the active theme colors */
export function useTheme() {
  return useThemeStore((s) => s.theme);
}
