import { useColorScheme } from 'react-native';

/** Calm, warm palette (PRD §10). Light and dark share the same roles. */
const light = {
  background: '#FAF8F5',
  surface: '#FFFFFF',
  text: '#1C1B19',
  muted: '#5C5850',
  border: '#E4DFD6',
  accent: '#2F6B5E',
  onAccent: '#FFFFFF',
  danger: '#A33A2B',
};

const dark: typeof light = {
  background: '#1C1B19',
  surface: '#262522',
  text: '#F4F1EC',
  muted: '#B5AFA5',
  border: '#3A3833',
  accent: '#7CC2B0',
  onAccent: '#10211D',
  danger: '#F09A8C',
};

export type Theme = typeof light;
export const useTheme = (): Theme => (useColorScheme() === 'dark' ? dark : light);
