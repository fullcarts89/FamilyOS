// Fails when any installed dependency's licence is outside the allow-list (plan gate G0).
// SPDX "A OR B" passes if either side is allowed; "A AND B" needs both.
import { execFileSync } from 'node:child_process';

const ALLOWED = new Set([
  'MIT',
  'MIT-0',
  'ISC',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'BlueOak-1.0.0',
  'Unlicense',
  'CC0-1.0',
  'Python-2.0',
  // Weak, file-level copyleft: fine for unmodified dependencies.
  'MPL-2.0',
  // Data files only (caniuse-lite); attribution is satisfied by the package itself.
  'CC-BY-4.0',
  // Font files (Google Fonts via @expo-google-fonts): the SIL Open Font License permits bundling
  // in software; the fonts are not sold on their own.
  'OFL-1.1',
]);

function allowed(expression) {
  const expr = expression.trim().replace(/^\((.*)\)$/, '$1');
  if (/ OR /.test(expr)) return expr.split(/ OR /).some(allowed);
  if (/ AND /.test(expr)) return expr.split(/ AND /).every(allowed);
  return ALLOWED.has(expr);
}

const report = JSON.parse(
  execFileSync('pnpm', ['-r', 'licenses', 'list', '--json'], { encoding: 'utf8' }),
);

const rejected = [];
let total = 0;
for (const [license, packages] of Object.entries(report)) {
  for (const pkg of packages) {
    total += 1;
    if (!allowed(license)) rejected.push(`${pkg.name}@${pkg.versions.join(',')}: ${license}`);
  }
}

if (rejected.length > 0) {
  console.error(`Disallowed licences (${rejected.length}):\n  ${rejected.join('\n  ')}`);
  process.exit(1);
}
console.log(`Licence check passed: ${total} packages, all on the allow-list.`);
