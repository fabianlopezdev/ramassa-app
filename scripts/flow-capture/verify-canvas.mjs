// Renders the canvas in a real browser and PROVES no two nodes overlap, in
// every flow view and under every platform toggle - then keeps a screenshot
// per flow as the corroborating artifact.
//
// This exists because verifying the embedded positions JSON proved nothing,
// twice: the row pitch was "fixed" by the numbers while a second bug kept the
// rendered phones stacked on top of each other, and it shipped because nobody
// looked at pixels. The DOM is measured (transform + offsetWidth/Height on
// `.react-flow__node`) because a node's rendered size depends on the frame the
// current toggle draws, which no static number in the HTML knows.
//
// Run automatically at the end of every `bun run capture:flow`; exits non-zero
// on any intersection, failing the capture rather than shipping an unreadable
// canvas.
//
//   node scripts/flow-capture/verify-canvas.mjs --canvas <path> [--shots <dir>]

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
}

const canvasPath = arg('--canvas');
if (!canvasPath || !fs.existsSync(canvasPath)) {
  console.error(`verify-canvas: no canvas at ${canvasPath}`);
  process.exit(2);
}
const shotsDir = arg('--shots', path.join(process.cwd(), '.flow-shots', 'canvas-verify'));
fs.mkdirSync(shotsDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
// Plain library Playwright loads file:// fine; only the MCP wrapper blocks it.
await page.goto(`file://${path.resolve(canvasPath)}`);
await page.waitForSelector('.react-flow__node', { timeout: 30_000 });

const failures = [];
const flowValues = await page.$$eval('select option', (os) => os.map((o) => o.value));

for (const flowValue of flowValues) {
  await page.selectOption('select', flowValue);
  await page.waitForTimeout(400);
  const flowLabel = await page.$eval('select', (s) => s.selectedOptions[0].textContent.trim());

  // Admin and entity flows are browser-only: the platform segment is hidden
  // entirely, so there is exactly one rendering to measure. Detect the buttons
  // rather than assuming them.
  const platforms = [];
  for (const label of ['iOS', 'Android', 'Both', 'Web']) {
    if ((await page.$(`button:text-is("${label}")`)) !== null) platforms.push(label);
  }
  if (platforms.length === 0) platforms.push(null);

  for (const platform of platforms) {
    if (platform !== null) {
      await page.click(`button:text-is("${platform}")`);
    }
    await page.waitForTimeout(350);

    const overlaps = await page.$$eval('.react-flow__node', (els) => {
      const nodes = els.map((n) => {
        const t = n.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
        return {
          id: n.getAttribute('data-id'),
          x: t ? +t[1] : 0,
          y: t ? +t[2] : 0,
          w: n.offsetWidth,
          h: n.offsetHeight,
        };
      });
      const bad = [];
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i];
          const b = nodes[j];
          const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          if (ox > 0 && oy > 0)
            bad.push(`${a.id} ~ ${b.id} (${Math.round(ox)}x${Math.round(oy)}px)`);
        }
      }
      return bad;
    });

    if (overlaps.length > 0) {
      failures.push({ flow: flowLabel, platform: platform ?? 'browser', overlaps });
    }
  }

  // One corroborating screenshot per flow view, fitted, on the default toggle.
  if (platforms[0] !== null) await page.click('button:text-is("iOS")');
  const fit = await page.$('.react-flow__controls-fitview');
  if (fit) await fit.click();
  await page.waitForTimeout(500);
  const safe = flowLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  await page.screenshot({ path: path.join(shotsDir, `${safe}.png`) });
}

await browser.close();

if (failures.length > 0) {
  console.error('✗ canvas verification FAILED - nodes overlap when rendered:');
  for (const f of failures) {
    console.error(`  ${f.flow} · ${f.platform}: ${f.overlaps.join('; ')}`);
  }
  process.exit(1);
}
console.log(
  `✓ canvas verified: no overlapping nodes in any flow view or platform toggle ` +
    `(screenshots in ${path.relative(process.cwd(), shotsDir)})`,
);
