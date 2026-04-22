import type { Theme, BrandConfig } from './types';

export const darkTheme: Theme = {
  id: 'dark',
  name: 'Dark',
  mode: 'dark',
  colors: {
    primary: '#6366f1',
    secondary: '#8b5cf6',
    accent: '#06b6d4',
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    background: '#0f172a',
    surface: '#1e293b',
    text: '#f8fafc',
    textSecondary: '#cbd5e1',
    border: '#334155',
    overlay: 'rgba(15, 23, 42, 0.8)',
  },
};

export const lightTheme: Theme = {
  id: 'light',
  name: 'Light',
  mode: 'light',
  colors: {
    primary: '#6366f1',
    secondary: '#8b5cf6',
    accent: '#0891b2',
    success: '#059669',
    warning: '#d97706',
    error: '#dc2626',
    background: '#f8fafc',
    surface: '#ffffff',
    text: '#0f172a',
    textSecondary: '#475569',
    border: '#e2e8f0',
    overlay: 'rgba(248, 250, 252, 0.8)',
  },
};

export const builtInThemes: Theme[] = [darkTheme, lightTheme];

/** Create a brand theme by overriding brand colors on top of a base theme */
export function createBrandTheme(base: Theme, brand: BrandConfig, id: string, name: string): Theme {
  return {
    ...base,
    id,
    name,
    colors: {
      ...base.colors,
      primary: brand.primary,
      secondary: brand.secondary,
      accent: brand.accent,
    },
  };
}
