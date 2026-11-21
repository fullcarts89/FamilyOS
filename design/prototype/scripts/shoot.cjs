// Screenshots for visual QA: node scripts/shoot.cjs <port> <out-dir> [directions] [screens]
// e.g. node scripts/shoot.cjs 5181 /tmp/shots a home,reset,tasks
// Desktop at 1440×900 and phone at 390×844 (the prototype lays out by container width, so a
// 390px window is a real phone layout). Also logs console errors per page.
const { chromium } = require('playwright');
const [port = '5173', out = 'shots', dirs = 'a,b,c', screens = 'home,reset,tasks', extra = ''] = process.argv.slice(2);
(async () => {
  const fs = require('fs');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  for (const d of dirs.split(',')) {
    for (const s of screens.split(',')) {
      for (const [name, w, h] of [['desktop', 1440, 900], ['phone', 390, 844]]) {
        const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
        await page.goto(`http://127.0.0.1:${port}/#${d}-${s}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(600);
        const file = `${out}/${d}-${s}-${name}.png`;
        await page.screenshot({ path: file, fullPage: extra === 'full' });
        console.log(file, errors.length ? `ERRORS: ${errors.join(' | ')}` : 'ok');
        await page.close();
      }
    }
  }
  await browser.close();
})();
