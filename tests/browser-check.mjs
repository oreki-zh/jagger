import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdir, stat } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
await mkdir('tests/artifacts', { recursive: true });
const baseURL = process.env.BASE_URL || 'http://localhost:4173/';
await page.goto(baseURL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.querySelector('#main-video').readyState >= 2);
assert.equal(await page.locator('.style-card').count(), 9);
const assets = await page.evaluate(() => window.MOTION_COLLECTION.styles.flatMap(s => [s.video, s.gif, s.compatibleGif, s.poster]));
for (const asset of assets) {
  const response = await page.request.head(new URL(asset, baseURL).href);
  assert.equal(response.status(), 200, asset);
}
for (const id of ['ribbon', 'pages', 'cascade', 'orbit', 'slices', 'ink', 'mosaic', 'shutter', 'focus']) {
  await page.locator(`[data-id="${id}"]`).click();
  await page.waitForFunction(id => {
    const v = document.querySelector('#main-video');
    return v.currentSrc.includes(`/${id}.mp4`) && v.readyState >= 2;
  }, id);
  assert.equal(await page.locator(`[data-id="${id}"]`).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#main-video').evaluate(v => v.duration), 4.5);
}
await page.locator('[data-id="ribbon"]').click();
await page.waitForFunction(() => document.querySelector('#main-video').readyState >= 2);
await page.locator('#main-video').evaluate(v => { v.pause(); v.currentTime = 2.3; });
await page.waitForFunction(() => !document.querySelector('#main-video').seeking);
await page.screenshot({ path: 'tests/artifacts/desktop.png', fullPage: true });

await page.locator('#speed').selectOption('0.5');
assert.equal(await page.locator('#main-video').evaluate(v => v.playbackRate), 0.5);
await page.locator('#loop').uncheck();
assert.equal(await page.locator('#main-video').evaluate(v => v.loop), false);
await page.locator('#timeline').focus();
await page.locator('#timeline').press('Home');
await page.locator('#timeline').press('ArrowRight');
await page.waitForFunction(() => Math.abs(document.querySelector('#main-video').currentTime - 1 / 60) < .005);
await page.locator('#replay').click();
await page.waitForFunction(() => !document.querySelector('#main-video').paused);
await page.getByRole('button', { name: '暂停', exact: true }).click();
assert.equal(await page.locator('#main-video').evaluate(v => v.paused), true);

await page.getByRole('button', { name: 'GIF 实际效果', exact: true }).click();
await page.waitForFunction(() => document.querySelector('#gif-preview').naturalWidth === 1080);
assert.equal(await page.locator('#video-controls').isVisible(), false);
await page.locator('#export-format').selectOption('compatibleGif');
assert.match(await page.locator('#gif-preview').getAttribute('src'), /compatible.gif/);
assert.match(await page.locator('#download-current').getAttribute('href'), /compatible.gif/);
for (const format of ['gif', 'compatibleGif', 'video']) {
  await page.locator('#export-format').selectOption(format);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download-current').click()]);
  await download.saveAs(`tests/artifacts/${download.suggestedFilename()}`);
  assert.ok((await stat(`tests/artifacts/${download.suggestedFilename()}`)).size > 1000);
}
const [zip] = await Promise.all([page.waitForEvent('download'), page.locator('.archive-link').click()]);
assert.equal(zip.suggestedFilename(), 'motion-collection.zip');
assert.equal(await zip.failure(), null);
await page.getByRole('button', { name: '视频 60 FPS', exact: true }).click();
await page.locator('#main-video').evaluate(v => { v.pause(); v.currentTime = 2.3; });
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: 'tests/artifacts/mobile.png', fullPage: true });
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow on mobile');
await page.locator('[data-id="pages"]').click();
assert.equal(await page.locator('#style-name').textContent(), '书页翻转');
await page.locator('[data-id="pages"]').press('ArrowRight');
assert.equal(await page.locator('#style-name').textContent(), '逐字跃入');
const reduced = await browser.newPage({ reducedMotion: 'reduce' });
await reduced.goto(`${baseURL.replace(/\/$/, '')}/#orbit`);
await reduced.waitForFunction(() => document.querySelector('#main-video').readyState >= 2);
assert.equal(await reduced.locator('#main-video').evaluate(v => v.paused), true);
assert.equal(await reduced.locator('#style-name').textContent(), '圆心扩展');
assert.deepEqual(errors, []);
console.log('Passed: nine styles, metadata, playback, seek, speed, loop, GIF variants, all downloads, mobile layout, keyboard selection, reduced motion, no page/network errors.');
await browser.close();
