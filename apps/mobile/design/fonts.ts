import { BricolageGrotesque_600SemiBold } from '@expo-google-fonts/bricolage-grotesque/600SemiBold';
import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque/700Bold';
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque/800ExtraBold';
import { Figtree_500Medium } from '@expo-google-fonts/figtree/500Medium';
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold';
import { Figtree_700Bold } from '@expo-google-fonts/figtree/700Bold';
import { Figtree_800ExtraBold } from '@expo-google-fonts/figtree/800ExtraBold';
import { Fraunces_400Regular } from '@expo-google-fonts/fraunces/400Regular';
import { Fraunces_500Medium } from '@expo-google-fonts/fraunces/500Medium';
import { FontDisplay, useFonts, type FontSource } from 'expo-font';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/** The web shows text in the system font at once and swaps the app's fonts in as they arrive. */
const web = Platform.OS === 'web';
const face = (uri: number | string): FontSource =>
  web ? { uri, display: FontDisplay.SWAP } : uri;

/**
 * Bricolage Grotesque for numerals, day names and headings; Fraunces for greetings and chapter
 * titles; Figtree for everything else. Only the weights the app uses are bundled.
 */
const FACES: Record<string, FontSource> = {
  'Bricolage-600': face(BricolageGrotesque_600SemiBold),
  'Bricolage-700': face(BricolageGrotesque_700Bold),
  'Bricolage-800': face(BricolageGrotesque_800ExtraBold),
  'Fraunces-400': face(Fraunces_400Regular),
  'Fraunces-500': face(Fraunces_500Medium),
  'Figtree-500': face(Figtree_500Medium),
  'Figtree-600': face(Figtree_600SemiBold),
  'Figtree-700': face(Figtree_700Bold),
  'Figtree-800': face(Figtree_800ExtraBold),
};

/** On iPhone, how long first paint waits for the bundled fonts before using the system font. */
const NATIVE_WAIT_MS = 1000;

/**
 * Whether the app can paint. The web never waits for fonts (they swap in); iPhone waits for its
 * bundled fonts at most about a second. A font that fails to load falls back to the system font.
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts(FACES);
  const [waited, setWaited] = useState(web);
  useEffect(() => {
    if (waited) return;
    const timer = setTimeout(() => setWaited(true), NATIVE_WAIT_MS);
    return () => clearTimeout(timer);
  }, [waited]);
  return loaded || error !== null || waited;
}
