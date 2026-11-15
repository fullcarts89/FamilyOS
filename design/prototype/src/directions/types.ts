/** Screens a direction can show. Home, Weekly Reset and Tasks are designed in full; the others
 * appear in navigation and show the direction's own "designed after you choose" placeholder. */
export type Screen = 'home' | 'reset' | 'tasks' | 'calendar' | 'household' | 'meals';

export interface DirectionProps {
  screen: Screen;
  go: (screen: Screen) => void;
}
