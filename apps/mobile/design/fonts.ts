import { BricolageGrotesque_600SemiBold } from '@expo-google-fonts/bricolage-grotesque/600SemiBold';
import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque/700Bold';
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque/800ExtraBold';
import { Figtree_400Regular } from '@expo-google-fonts/figtree/400Regular';
import { Figtree_500Medium } from '@expo-google-fonts/figtree/500Medium';
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold';
import { Figtree_700Bold } from '@expo-google-fonts/figtree/700Bold';
import { Figtree_800ExtraBold } from '@expo-google-fonts/figtree/800ExtraBold';
import { Fraunces_400Regular } from '@expo-google-fonts/fraunces/400Regular';
import { Fraunces_500Medium } from '@expo-google-fonts/fraunces/500Medium';
import { useFonts } from 'expo-font';

/**
 * Bricolage Grotesque for numerals, day names and headings; Fraunces for greetings and chapter
 * titles; Figtree for everything else. Only the weights the app uses are bundled.
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    'Bricolage-600': BricolageGrotesque_600SemiBold,
    'Bricolage-700': BricolageGrotesque_700Bold,
    'Bricolage-800': BricolageGrotesque_800ExtraBold,
    'Fraunces-400': Fraunces_400Regular,
    'Fraunces-500': Fraunces_500Medium,
    'Figtree-400': Figtree_400Regular,
    'Figtree-500': Figtree_500Medium,
    'Figtree-600': Figtree_600SemiBold,
    'Figtree-700': Figtree_700Bold,
    'Figtree-800': Figtree_800ExtraBold,
  });
  // A font that fails to load falls back to the system font rather than blocking the app.
  return loaded || error !== null;
}
