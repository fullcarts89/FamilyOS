import { Platform } from 'react-native';
import { color } from './tokens';

const CSS = `
html, body { background: ${color.ground}; }
body { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; font-feature-settings: 'tnum' 1; }
:focus { outline: none; }
:focus-visible { outline: 2px solid ${color.ink} !important; outline-offset: 2px; }
[data-focus-ring="inside"]:focus-visible { outline-offset: -2px; }
input:focus-visible, textarea:focus-visible { outline: none !important; }
::selection { background: ${color.lane}; }
* { scrollbar-width: thin; scrollbar-color: ${color.line2} transparent; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
`;

/** Web-only: keyboard focus rings (not on mouse clicks), ground color and font smoothing. */
export function installWebStyles(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.getElementById('familyos-web-styles')) return;
  const style = document.createElement('style');
  style.id = 'familyos-web-styles';
  style.textContent = CSS;
  document.head.appendChild(style);
}
