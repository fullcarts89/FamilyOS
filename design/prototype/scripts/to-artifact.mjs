// Turns the single-file build (dist/index.html) into a hosted-preview page: the host adds its own
// doctype/html/head/body, so this keeps the title, styles, root element and script in order.
//   node scripts/to-artifact.mjs dist/index.html <out.html>
import { readFileSync, writeFileSync } from 'node:fs';

const [input = 'dist/index.html', output = 'familyos-directions.html'] = process.argv.slice(2);
const html = readFileSync(input, 'utf8');

const title = /<title>[\s\S]*?<\/title>/.exec(html)?.[0] ?? '<title>FamilyOS Design Directions</title>';
const styles = [...html.matchAll(/<style[\s\S]*?<\/style>/g)].map((m) => m[0]);
const scripts = [...html.matchAll(/<script[\s\S]*?<\/script>/g)].map((m) => m[0]);
if (scripts.length === 0) throw new Error('no script found in build output');

const page = [title, ...styles, '<div id="root"></div>', ...scripts].join('\n');
writeFileSync(output, page);
console.log(`${output}: ${(page.length / 1024).toFixed(0)} KB, ${styles.length} style, ${scripts.length} script`);
