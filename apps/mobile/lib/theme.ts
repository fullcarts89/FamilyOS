import type { StatusTone } from '@familyos/domain';
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
  tones: {
    neutral: { bg: '#EFECE6', fg: '#4A463F' },
    attention: { bg: '#FBE7C6', fg: '#7A4B00' },
    active: { bg: '#DCEFE9', fg: '#1F5649' },
    waiting: { bg: '#E3E8F4', fg: '#34477A' },
    done: { bg: '#D9F0D9', fg: '#225C22' },
    unverified: { bg: '#F3E6F3', fg: '#6B3A6B' },
    stopped: { bg: '#F1E1DE', fg: '#7E2F23' },
  } satisfies Record<StatusTone, { bg: string; fg: string }>,
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
  tones: {
    neutral: { bg: '#34322E', fg: '#D9D4CB' },
    attention: { bg: '#4A3714', fg: '#F7CF8A' },
    active: { bg: '#1E3E36', fg: '#9ED9C9' },
    waiting: { bg: '#262F47', fg: '#B5C3EA' },
    done: { bg: '#1F3A1F', fg: '#A9DDA9' },
    unverified: { bg: '#3B2A3B', fg: '#E1B9E1' },
    stopped: { bg: '#43261F', fg: '#F2AE9F' },
  },
};

export type Theme = typeof light;
export const useTheme = (): Theme => (useColorScheme() === 'dark' ? dark : light);
