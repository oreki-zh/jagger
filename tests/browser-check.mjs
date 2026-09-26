import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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
assert.equal(await page.locator('.style-card').count(), 18);
const styleIds = await page.evaluate(() => window.MOTION_COLLECTION.styles.map(s => s.id));
assert.equal(await page.locator('.series-heading').count(), 2);
assert.equal(await page.locator('.card-badge').count(), 9);
const assets = await page.evaluate(() => window.MOTION_COLLECTION.styles.flatMap(s => [s.video, s.gif, s.compatibleGif, s.poster]));
const source = await page.evaluate(() => ({ version: window.MOTION_COLLECTION.assetVersion, sha: window.MOTION_COLLECTION.sha256 }));
assert.equal(source.version, `${source.sha.slice(0, 12)}-smooth-v2`);
const svgResponse = await page.request.get(new URL(`assets/logo.svg?v=${source.version}`, baseURL).href);
assert.equal(createHash('sha256').update(await svgResponse.body()).digest('hex'), source.sha, 'Downloaded SVG matches the rendered source');
for (const asset of assets) {
  const response = await page.request.head(new URL(`${asset}?v=${source.version}`, baseURL).href);
  assert.equal(response.status(), 200, asset);
}
for (const id of styleIds) {
  await page.locator(`[data-id="${id}"]`).click();
  await page.waitForFunction(id => {
    const v = document.querySelector('#main-video');
    return v.currentSrc.includes(`/${id}.mp4`) && v.readyState >= 2;
  }, id);
  assert.equal(await page.locator(`[data-id="${id}"]`).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#main-video').evaluate(v => v.duration), 4.5);
  assert.equal(await page.locator('#main-video').evaluate(v => new URL(v.currentSrc).searchParams.get('v')), source.version);
}
await page.locator('[data-id="ribbon"]').click();
await page.waitForFunction(() => document.querySelector('#main-video').readyState >= 2);
await page.locator('#main-video').evaluate(v => { v.pause(); v.currentTime = 2.3; });
await page.waitForFunction(() => !document.querySelector('#main-video').seeking);
await page.evaluate(() => scrollTo(0, 0));
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
assert.match(await page.locator('#gif-preview').getAttribute('src'), /ribbon\.gif\?v=.*smooth-v2$/);
const firstGif = await page.locator('#gif-preview').getAttribute('src');
await page.locator('#export-format').selectOption('video');
assert.equal(await page.locator('#gif-preview').getAttribute('src'), firstGif, 'Changing download format does not reload the GIF');
await page.locator('#gif-replay').click();
assert.notEqual(await page.locator('#gif-preview').getAttribute('src'), firstGif);
for (const format of ['gif', 'video']) {
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
await page.locator('[data-id="focus"]').click();
await page.locator('[data-id="focus"]').press('ArrowRight');
assert.equal(await page.locator('#style-name').textContent(), '光束扫描');
assert.equal(await page.locator('#style-credit').textContent(), '由 Claude Opus 5.5 设计');
const reduced = await browser.newPage({ reducedMotion: 'reduce' });
await reduced.goto(`${baseURL.replace(/\/$/, '')}/#orbit`);
await reduced.waitForFunction(() => document.querySelector('#main-video').readyState >= 2);
assert.equal(await reduced.locator('#main-video').evaluate(v => v.paused), true);
assert.equal(await reduced.locator('#style-name').textContent(), '圆心扩展');
// Regression: reduced-motion users can explicitly play from the beginning and
// switch every style without loadedmetadata forcing a pause at 2.20 seconds.
await reduced.locator('#play-toggle').click();
await reduced.waitForFunction(() => {
  const v = document.querySelector('#main-video');
  return !v.paused && v.currentTime > 0 && v.currentTime < 1;
});
for (const id of styleIds) {
  await reduced.locator(`[data-id="${id}"]`).click();
  await reduced.waitForFunction(id => {
    const v = document.querySelector('#main-video');
    return v.currentSrc.includes(`/${id}.mp4`) && !v.paused && v.currentTime > 2.4;
  }, id);
}
// A full loop must continue, even though the logo intentionally holds still mid-clip.
await reduced.waitForFunction(() => document.querySelector('#main-video').currentTime > 4);
await reduced.waitForFunction(() => {
  const v = document.querySelector('#main-video');
  return !v.paused && v.currentTime > .1 && v.currentTime < 1;
});
await reduced.getByRole('button', { name: 'GIF 实际效果', exact: true }).click();
await reduced.getByRole('button', { name: '视频 60 FPS', exact: true }).click();
await reduced.waitForFunction(() => !document.querySelector('#main-video').paused);
await reduced.locator('#replay').click();
await reduced.waitForFunction(() => {
  const v = document.querySelector('#main-video');
  return !v.paused && v.currentTime < 1;
});
await reduced.getByRole('button', { name: '暂停', exact: true }).click();
assert.equal(await reduced.locator('#main-video').evaluate(v => v.paused), true);
// Explicit play before delayed metadata arrives must also override initial still mode.
const slow = await browser.newPage({ reducedMotion: 'reduce' });
await slow.route('**/*.mp4?*', async route => {
  await new Promise(resolve => setTimeout(resolve, 800));
  await route.continue();
});
await slow.goto(baseURL, { waitUntil: 'domcontentloaded' });
await slow.locator('#play-toggle').click();
await slow.waitForFunction(() => {
  const v = document.querySelector('#main-video');
  return !v.paused && v.currentTime > .1 && v.currentTime < 1;
});
await slow.waitForFunction(() => {
  const v = document.querySelector('#main-video');
  return !v.paused && v.currentTime > 2.4;
});
assert.deepEqual(errors, []);
console.log('Passed: eighteen styles in two volumes, metadata, playback, seek, speed, loop, 50 fps GIF, all downloads, mobile layout, keyboard selection, reduced-motion explicit playback past 2.20 s, full loop, delayed metadata, no page/network errors.');
await browser.close();
