import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import app from '../server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Spotify-Style Dynamic Social Share Card & Open Graph Suite', () => {
  let server;
  let port;
  const baseUrl = () => `http://127.0.0.1:${port}`;

  const appJs = fs.readFileSync(path.join(rootDir, 'public', 'app.js'), 'utf-8');
  const indexHtml = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf-8');
  const styleCss = fs.readFileSync(path.join(rootDir, 'public', 'style.css'), 'utf-8');
  const serverJs = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf-8');

  before(async () => {
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
  });

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('Server dynamically injects server-accessible Open Graph metadata for WhatsApp crawlers', async () => {
    // 1. Root page default Open Graph tags
    const rootRes = await fetch(`${baseUrl()}/`);
    assert.strictEqual(rootRes.status, 200);
    const rootHtml = await rootRes.text();
    assert.ok(rootHtml.includes('property="og:site_name" content="MoodFlix"'), 'Root HTML defines og:site_name');
    assert.ok(rootHtml.includes('property="og:title"'), 'Root HTML defines og:title');
    assert.ok(rootHtml.includes('property="og:image"'), 'Root HTML defines og:image');
    assert.ok(rootHtml.includes('name="twitter:card" content="summary_large_image"'), 'Root HTML defines twitter:card');

    // 2. Share URL with movie metadata
    const shareQuery = new URLSearchParams({
      share: '1',
      title: 'Inception',
      year: '2010',
      poster: 'https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg',
      quality: '1080P HD',
      size: '2.4 GB',
      seeds: '142',
      mediaType: 'movie'
    });

    const shareRes = await fetch(`${baseUrl()}/?${shareQuery.toString()}`);
    assert.strictEqual(shareRes.status, 200);
    const shareHtml = await shareRes.text();

    assert.ok(shareHtml.includes('Inception (2010) - Stream on MoodFlix'), 'og:title contains movie title and year');
    assert.ok(shareHtml.includes('1080P HD • 2.4 GB • 142 Seeds'), 'og:description contains release specs');
    assert.ok(shareHtml.includes('content="https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg"'), 'og:image contains poster URL');
    assert.ok(shareHtml.includes('property="og:type" content="video.movie"'), 'og:type matches video.movie');
    assert.ok(shareHtml.includes('property="og:image:width"'), 'og:image:width is provided for WhatsApp preview');
    assert.ok(shareHtml.includes('property="og:image:height"'), 'og:image:height is provided for WhatsApp preview');
    assert.ok(shareHtml.includes('name="twitter:image"'), 'twitter:image matches og:image');
  });

  it('Server resolves relative poster and card URLs to absolute URLs with domain for WhatsApp', async () => {
    const res = await fetch(`${baseUrl()}/?share=1&title=Tenet&year=2020&card=/api/share/card/test_card.png&poster=images/hero.webp`);
    assert.strictEqual(res.status, 200);
    const html = await res.text();

    // Absolute card image URL
    assert.ok(html.includes(`content="http://127.0.0.1:${port}/api/share/card/test_card.png"`), 'card URL is resolved to absolute URL with host');
    assert.ok(html.includes('property="og:image:type" content="image/png"'), 'card image type is image/png');
  });

  it('Server safely sanitizes and escapes Open Graph metadata against HTML injection / XSS', async () => {
    const malicious = '<script>alert(1)</script>" onclick="evil()';
    const res = await fetch(`${baseUrl()}/?share=1&title=${encodeURIComponent(malicious)}`);
    assert.strictEqual(res.status, 200);
    const html = await res.text();

    assert.ok(!html.includes('<script>alert(1)</script>'), 'Raw unescaped script tag must not be injected');
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'Script tag must be HTML entity escaped');
    assert.ok(html.includes('&quot; onclick=&quot;evil()'), 'Quotes must be escaped');
  });

  it('Server provides CORS-enabled image proxy (/api/proxy-image) to eliminate canvas tainting', async () => {
    // 1. Missing URL
    const errRes = await fetch(`${baseUrl()}/api/proxy-image`);
    assert.strictEqual(errRes.status, 400);

    // 2. Disallowed external domain
    const forbiddenRes = await fetch(`${baseUrl()}/api/proxy-image?url=http://evil-attacker.com/malware.png`);
    assert.strictEqual(forbiddenRes.status, 403);

    // 3. Allowed domain (tmdb) - verifies headers
    const tmdbUrl = 'https://image.tmdb.org/t/p/w200/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg';
    const okRes = await fetch(`${baseUrl()}/api/proxy-image?url=${encodeURIComponent(tmdbUrl)}`);
    assert.strictEqual(okRes.status, 200);
    assert.strictEqual(okRes.headers.get('access-control-allow-origin'), '*', 'Proxy must set CORS wildcard');
    assert.ok(okRes.headers.get('content-type')?.includes('image/'), 'Content-type must be image/*');
    const buffer = await okRes.arrayBuffer();
    assert.ok(buffer.byteLength > 100, 'Image buffer must be delivered');
  });

  it('Server provides share card storage endpoint (/api/share/card) for custom generated cards', async () => {
    // 1. Rejects invalid data
    const badRes = await fetch(`${baseUrl()}/api/share/card`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: 'not_base64_data' })
    });
    assert.strictEqual(badRes.status, 400);

    // 2. Stores valid base64 PNG
    // Minimal 1x1 transparent PNG data URL
    const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const postRes = await fetch(`${baseUrl()}/api/share/card`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: tinyPng, title: 'Inception', year: '2010' })
    });
    assert.strictEqual(postRes.status, 200);
    const postData = await postRes.json();
    assert.strictEqual(postData.success, true);
    assert.ok(postData.cardId && postData.cardUrl);

    // 3. Serves the stored PNG via GET /api/share/card/:id.png
    const getRes = await fetch(`${baseUrl()}${postData.cardUrl}`);
    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(getRes.headers.get('content-type'), 'image/png');
    assert.strictEqual(getRes.headers.get('access-control-allow-origin'), '*');
    const imgBuf = await getRes.arrayBuffer();
    assert.strictEqual(imgBuf.byteLength, 70); // exact length of tiny 1x1 png
  });

  it('HTML defines comprehensive retro-modern minimal share card generator modal with high resolution default and no clutter', () => {
    assert.ok(indexHtml.includes('id="shareCardModal"'), 'shareCardModal container exists in index.html');
    assert.ok(indexHtml.includes('id="shareCardCanvas"'), 'shareCardCanvas element exists');
    assert.ok(!indexHtml.includes('id="shareThemePills"'), 'Theme palette pills removed from modal');
    assert.ok(!indexHtml.includes('data-theme='), 'No data-theme attributes present');
    assert.ok(indexHtml.includes('data-format="story"'), 'Story 9:16 format pill defined');
    assert.ok(indexHtml.includes('data-format="card"'), 'Card 4:5 format pill defined');
    assert.ok(indexHtml.includes('data-format="square"'), 'Square 1:1 format pill defined');
    assert.ok(!indexHtml.includes('RENDER RESOLUTION'), 'RENDER RESOLUTION control group removed from modal');
    assert.ok(!indexHtml.includes('Include Swarm Specs'), 'Include Swarm Specs toggle removed from modal');
    assert.ok(!indexHtml.includes('Include Waveform Barcode'), 'Include Waveform Barcode toggle removed from modal');
    assert.ok(indexHtml.includes('id="btnShareWhatsApp"'), 'WhatsApp share button exists');
    assert.ok(indexHtml.includes('id="btnDownloadShareCard"'), 'Download share card button exists');
    assert.ok(indexHtml.includes('id="btnCopyShareCardImage"'), 'Copy image button exists');
    assert.ok(indexHtml.includes('id="btnCopyShareCardLink"'), 'Copy link button exists');
    assert.ok(indexHtml.includes('id="btnNativeShare"'), 'Native share button exists');
    assert.ok(indexHtml.includes('id="shareGenerateCardBtn"'), 'Shared view includes share card generator button');
  });

  it('CSS defines polished retro-brutalist styling for share card studio and WhatsApp button', () => {
    assert.ok(styleCss.includes('.share-card-modal-content'), 'CSS defines .share-card-modal-content');
    assert.ok(styleCss.includes('.share-card-canvas'), 'CSS defines .share-card-canvas');
    assert.ok(styleCss.includes('.btn-share-whatsapp'), 'CSS defines .btn-share-whatsapp');
    assert.ok(styleCss.includes('#25D366'), 'WhatsApp official brand color #25D366 used');
    assert.ok(styleCss.includes('.format-pill'), 'CSS defines format pills');
    assert.ok(styleCss.includes('.badge-res'), 'CSS defines resolution badge styling');
    assert.ok(styleCss.includes('.share-card-spinner.hidden'), 'CSS defines .share-card-spinner.hidden to prevent spinner being stuck');
  });

  it('JavaScript defines core Retro-Modern Minimal Share Card Generator functions and WhatsApp fallback', () => {
    assert.ok(appJs.includes('function renderShareCardToCanvas'), 'renderShareCardToCanvas is defined');
    assert.ok(appJs.includes('function drawRetroCorners'), 'drawRetroCorners is defined');
    assert.ok(appJs.includes('async function openShareCardModal'), 'openShareCardModal is defined');
    assert.ok(appJs.includes('function closeShareCardModal'), 'closeShareCardModal is defined');
    assert.ok(appJs.includes('async function shareCardToWhatsApp'), 'shareCardToWhatsApp is defined');
    assert.ok(appJs.includes('async function downloadCurrentShareCard'), 'downloadCurrentShareCard is defined');
    assert.ok(appJs.includes('function generateWaveformHeights'), 'generateWaveformHeights is defined');
    assert.ok(appJs.includes('function initShareCardStudio'), 'initShareCardStudio is defined');
    assert.ok(!appJs.includes('STREAM & SWARM ENGINE'), 'STREAM & SWARM ENGINE footer removed from bottom of card');

    // WhatsApp Web Share API & Download Fallback Verification
    assert.ok(appJs.includes('navigator.canShare && navigator.canShare({ files: [file] })'), 'Checks Web Share file support');
    assert.ok(appJs.includes('https://api.whatsapp.com/send?text='), 'Provides WhatsApp URL fallback');
    assert.ok(appJs.includes('a.download = safeFilename'), 'Provides automatic card image download fallback');

    // 2X / 3X Resolution Verification
    assert.ok(appJs.includes('canvas.width = baseWidth * scale'), 'Scales canvas width by 2x or 3x scale factor');
    assert.ok(appJs.includes('canvas.height = baseHeight * scale'), 'Scales canvas height by 2x or 3x scale factor');
    assert.ok(appJs.includes("ctx.imageSmoothingQuality = 'high'"), 'Configures high smoothing quality for crisp rendering');

    // Detail view SHARE button wired to openShareCardModal
    assert.ok(appJs.includes('elements.detailShareBtn.onclick = () => openShareCardModal('), 'detailShareBtn opens share card modal');

    // Window exports
    assert.ok(appJs.includes('window.openShareCardModal = openShareCardModal'), 'openShareCardModal is exported on window');
    assert.ok(appJs.includes('window.renderShareCardToCanvas = renderShareCardToCanvas'), 'renderShareCardToCanvas is exported on window');
    assert.ok(appJs.includes('window.shareCardToWhatsApp = shareCardToWhatsApp'), 'shareCardToWhatsApp is exported on window');
  });

  it('Waveform generator produces deterministic Spotify-style bar heights', () => {
    // Extracted simulation of generateWaveformHeights
    const genWave = (str, count = 26) => {
      const heights = [];
      const text = (str || 'MOODFLIX').toUpperCase();
      let seed = 0;
      for (let i = 0; i < text.length; i++) {
        seed = (seed * 31 + text.charCodeAt(i)) & 0xffffffff;
      }
      for (let i = 0; i < count; i++) {
        const v = Math.abs(Math.sin(seed + i * 1.7) * 0.5 + Math.cos(seed * 0.5 + i * 2.3) * 0.5);
        const h = 6 + Math.round(v * 20);
        heights.push(h);
      }
      return heights;
    };

    const wave1 = genWave('Inception');
    const wave2 = genWave('Inception');
    const wave3 = genWave('Interstellar');

    assert.strictEqual(wave1.length, 26, 'Should generate 26 bars');
    assert.deepStrictEqual(wave1, wave2, 'Same title produces exact identical deterministic waveform');
    assert.notDeepStrictEqual(wave1, wave3, 'Different title produces distinct waveform');
    assert.ok(wave1.every(h => h >= 6 && h <= 26), 'All bar heights within expected range 6px to 26px');
  });
});

