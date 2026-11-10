import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import app from '../server.js';
import { TMDB } from '../src/tmdb.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Movie, TV Show & Anime Scene Frames Gallery Suite', () => {
  let server;
  let baseUrl;

  const appJs = fs.readFileSync(path.join(rootDir, 'public', 'app.js'), 'utf-8');
  const styleCss = fs.readFileSync(path.join(rootDir, 'public', 'style.css'), 'utf-8');
  const indexHtml = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf-8');

  before(async () => {
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  describe('Backend TMDB Scene Frames Provider', () => {
    it('TMDB.getDetails includes scene frames for a movie (The Dark Knight)', async () => {
      const movie = await TMDB.getDetails(155, 'movie');
      assert.ok(movie, 'Movie details returned');
      assert.ok(Array.isArray(movie.frames), 'movie.frames is an array');
      assert.ok(movie.frames.length >= 10, 'Expected at least 10 scene frames for The Dark Knight');

      const first = movie.frames[0];
      assert.ok(first.thumbnail.includes('image.tmdb.org'), 'Thumbnail URL points to TMDB');
      assert.ok(first.full.includes('image.tmdb.org/t/p/original'), 'Full image URL points to TMDB original');
      assert.ok(first.width >= 1280, 'Frame width should be HD or higher');
      assert.ok(first.height >= 720, 'Frame height should be HD or higher');
      assert.ok(first.aspectRatio > 1.3, 'Frame has widescreen aspect ratio');
    });

    it('TMDB.getDetails includes scene frames for a TV series (Breaking Bad)', async () => {
      const tv = await TMDB.getDetails(1396, 'tv');
      assert.ok(tv, 'TV details returned');
      assert.ok(Array.isArray(tv.frames), 'tv.frames is an array');
      assert.ok(tv.frames.length >= 10, 'Expected at least 10 scene frames for Breaking Bad');

      const frame = tv.frames[0];
      assert.ok(frame.thumbnail.includes('image.tmdb.org'), 'Thumbnail URL points to TMDB');
      assert.ok(frame.full.includes('original'), 'Full image URL points to TMDB original');
    });

    it('TMDB.getDetails includes scene frames for an Anime series (Attack on Titan)', async () => {
      const anime = await TMDB.getDetails(1429, 'tv');
      assert.ok(anime, 'Anime details returned');
      assert.ok(Array.isArray(anime.frames), 'anime.frames is an array');
      assert.ok(anime.frames.length >= 10, 'Expected at least 10 scene frames for Attack on Titan');

      const frame = anime.frames[0];
      assert.ok(frame.thumbnail.includes('image.tmdb.org'), 'Anime frame points to TMDB');
    });

    it('TMDB.getFrames fetches scene frames directly', async () => {
      const frames = await TMDB.getFrames(155, 'movie');
      assert.ok(Array.isArray(frames));
      assert.ok(frames.length > 0);
      assert.ok(frames[0].thumbnail);
      assert.ok(frames[0].full);
    });

    it('GET /api/media/:id/frames returns scene frames with caching', async () => {
      const res = await fetch(`${baseUrl}/api/media/155/frames?type=movie`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.frames));
      assert.ok(data.frames.length >= 10);
      assert.ok(data.count >= 10);

      // Verify cached second hit
      const cachedRes = await fetch(`${baseUrl}/api/media/155/frames?type=movie`);
      const cachedData = await cachedRes.json();
      assert.strictEqual(cachedData.success, true);
      assert.strictEqual(cachedData.cached, true);
    });
  });

  describe('Frontend Markup & DOM Structure', () => {
    it('index.html provides direct gallery button opening frameLightboxModal without in-page section', () => {
      assert.ok(indexHtml.includes('id="detailGalleryBtn"'), 'detailGalleryBtn exists in detail actions');
      assert.ok(indexHtml.includes('id="shareGalleryBtn"'), 'shareGalleryBtn exists in share-cta-grid above explore');
      assert.ok(indexHtml.includes('id="frameLightboxModal"'), 'frameLightboxModal exists in HTML');
      assert.ok(!indexHtml.includes('id="detailGallerySection"'), 'In-page detailGallerySection removed per user preference');
    });

    it('index.html contains frameLightboxModal with interactive controls', () => {
      assert.ok(indexHtml.includes('id="frameLightboxModal"'), 'frameLightboxModal exists in HTML');
      assert.ok(indexHtml.includes('id="lightboxImage"'), 'lightboxImage exists in HTML');
      assert.ok(indexHtml.includes('id="lightboxCounter"'), 'lightboxCounter exists in HTML');
      assert.ok(indexHtml.includes('id="lightboxDownloadBtn"'), 'lightboxDownloadBtn exists in HTML');
      assert.ok(indexHtml.includes('id="btnCloseLightbox"'), 'btnCloseLightbox exists in HTML');
      assert.ok(indexHtml.includes('id="btnLightboxPrev"'), 'btnLightboxPrev exists in HTML');
      assert.ok(indexHtml.includes('id="btnLightboxNext"'), 'btnLightboxNext exists in HTML');
      assert.ok(indexHtml.includes('id="lightboxMediaTitle"'), 'lightboxMediaTitle exists in HTML');
      assert.ok(indexHtml.includes('id="lightboxResolution"'), 'lightboxResolution exists in HTML');
    });
  });

  describe('CSS Stylesheet Verification', () => {
    it('style.css defines retro styles for gallery section and frame cards', () => {
      assert.ok(styleCss.includes('.detail-gallery-section'), 'CSS styles .detail-gallery-section');
      assert.ok(styleCss.includes('.gallery-frames-strip'), 'CSS styles .gallery-frames-strip');
      assert.ok(styleCss.includes('.gallery-frame-card'), 'CSS styles .gallery-frame-card');
      assert.ok(styleCss.includes('aspect-ratio: 16 / 9'), 'CSS sets 16:9 widescreen aspect ratio for frame cards');
      assert.ok(styleCss.includes('.frame-thumb-img'), 'CSS styles .frame-thumb-img');
      assert.ok(styleCss.includes('.frame-badge'), 'CSS styles .frame-badge');
      assert.ok(styleCss.includes('.frame-hover-overlay'), 'CSS styles .frame-hover-overlay');
    });

    it('style.css defines retro modal styles for frame lightbox', () => {
      assert.ok(styleCss.includes('#frameLightboxModal'), 'CSS styles #frameLightboxModal');
      assert.ok(styleCss.includes('.lightbox-modal-card'), 'CSS styles .lightbox-modal-card');
      assert.ok(styleCss.includes('.lightbox-stage'), 'CSS styles .lightbox-stage');
      assert.ok(styleCss.includes('.lightbox-image'), 'CSS styles .lightbox-image');
      assert.ok(styleCss.includes('.lightbox-nav-btn'), 'CSS styles .lightbox-nav-btn');
    });
  });

  describe('JavaScript Controller & Lifecycle Wiring', () => {
    it('app.js defines loadDetailGallery, openFrameLightbox, and closeFrameLightbox', () => {
      assert.ok(appJs.includes('async function loadDetailGallery('), 'loadDetailGallery is defined in JS');
      assert.ok(appJs.includes('function openFrameLightbox('), 'openFrameLightbox is defined in JS');
      assert.ok(appJs.includes('function closeFrameLightbox('), 'closeFrameLightbox is defined in JS');
    });

    it('app.js invokes loadDetailGallery inside openDetailView', () => {
      assert.ok(appJs.includes('loadDetailGallery(m, effectiveType);'), 'openDetailView calls loadDetailGallery');
    });

    it('app.js supports horizontal mouse wheel scrolling and keyboard navigation', () => {
      assert.ok(appJs.includes('strip.onwheel = (e) => {'), 'strip.onwheel handler enabled for mouse wheel');
      assert.ok(appJs.includes("e.key === 'ArrowLeft'"), 'ArrowLeft keyboard nav supported');
      assert.ok(appJs.includes("e.key === 'ArrowRight'"), 'ArrowRight keyboard nav supported');
      assert.ok(appJs.includes("e.key === 'Escape'"), 'Escape key closes lightbox');
    });

    it('app.js wires lightbox close buttons and backdrop clicks', () => {
      assert.ok(appJs.includes("document.getElementById('btnCloseLightbox')"), 'Close button wired in JS');
      assert.ok(appJs.includes("e.target.id === 'frameLightboxModal'"), 'Backdrop click closes lightbox');
      assert.ok(appJs.includes("document.getElementById('detailGalleryBtn')"), 'detailGalleryBtn is wired in JS');
      assert.ok(appJs.includes("document.getElementById('shareGalleryBtn')"), 'shareGalleryBtn is wired in JS');
    });
  });
});

