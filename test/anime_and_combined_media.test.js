import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TMDB } from '../src/tmdb.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Anime and Combined Movies & TV Suite', () => {
  const indexHtml = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf-8');
  const appJs = fs.readFileSync(path.join(rootDir, 'public', 'app.js'), 'utf-8');
  const serverJs = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf-8');

  it('HTML desktop navigation merges Movies & TV and includes dedicated Anime tab', () => {
    const navMatch = indexHtml.match(/<nav class="nav-tabs" id="mainNav">([\s\S]*?)<\/nav>/);
    assert.ok(navMatch, 'mainNav found');
    const navContent = navMatch[1];
    assert.ok(navContent.includes('data-tab="movies-view"'), 'movies-view is present in mainNav');
    assert.ok(navContent.includes('Movies & TV'), 'Movies & TV label is present');
    assert.ok(navContent.includes('data-tab="anime-view"'), 'anime-view is present in mainNav');
    assert.ok(navContent.includes('Anime'), 'Anime label is present in mainNav');
    // tv-view tab button should no longer exist in mainNav
    assert.ok(!navContent.includes('data-tab="tv-view"'), 'separate tv-view tab button removed from mainNav');
  });

  it('Mobile bottom navigation contains combined Movies & TV and Anime tab', () => {
    const mobileNavMatch = indexHtml.match(/<nav class="mobile-bottom-nav[^"]*" id="mobileBottomNav"[\s\S]*?<\/nav>/);
    assert.ok(mobileNavMatch, 'mobileBottomNav found');
    const mobileContent = mobileNavMatch[0];
    assert.ok(mobileContent.includes('data-tab="movies-view"'), 'movies-view in mobile nav');
    assert.ok(mobileContent.includes('data-tab="anime-view"'), 'anime-view in mobile nav');
    assert.ok(!mobileContent.includes('data-tab="tv-view"'), 'tv-view removed from mobile bottom nav');
  });

  it('HTML includes anime-view section and movieTypeSelect inside movies-view', () => {
    assert.ok(indexHtml.includes('id="anime-view"'), 'anime-view section exists');
    assert.ok(indexHtml.includes('id="animeGrid"'), 'animeGrid container exists');
    assert.ok(indexHtml.includes('id="animeSearchInput"'), 'animeSearchInput exists');
    assert.ok(indexHtml.includes('id="animeTypeSelect"'), 'animeTypeSelect exists');
    assert.ok(indexHtml.includes('id="animeCategorySelect"'), 'animeCategorySelect exists');
    assert.ok(indexHtml.includes('id="movieTypeSelect"'), 'movieTypeSelect exists');
  });

  it('JavaScript defines loadAnime and binds anime UI elements', () => {
    assert.ok(appJs.includes('async function loadAnime'), 'loadAnime function is defined');
    assert.ok(appJs.includes('animeGrid:'), 'animeGrid element is mapped in elements');
    assert.ok(appJs.includes('animeSearchInput:'), 'animeSearchInput element is mapped in elements');
    assert.ok(appJs.includes('media-type-badge'), 'media-type-badge is rendered in media grid');
  });

  it('Server defines /api/anime endpoint and supports type parameter on /api/movies', () => {
    assert.ok(serverJs.includes("app.get('/api/anime'"), '/api/anime route is defined');
    assert.ok(serverJs.includes("app.get('/api/movies'"), '/api/movies route is defined');
    assert.ok(serverJs.includes('TMDB.getCombinedMedia'), 'TMDB.getCombinedMedia is referenced in server');
    assert.ok(serverJs.includes('TMDB.getAnime'), 'TMDB.getAnime is referenced in server');
  });

  it('TMDB.getCombinedMedia returns mixed movies and TV shows', async () => {
    const media = await TMDB.getCombinedMedia();
    assert.ok(media.length > 0, 'combined media returned');
    const types = new Set(media.map(m => m.mediaType));
    assert.ok(types.has('movie'), 'contains movies');
    assert.ok(types.has('tv'), 'contains tv shows');
  });

  it('TMDB.getAnime returns Japanese animation items', async () => {
    const anime = await TMDB.getAnime();
    assert.ok(anime.length > 0, 'anime list returned');
    assert.ok(anime.every(a => a.isAnime === true), 'all items marked as isAnime');
    assert.ok(anime.every(a => typeof a.title === 'string' && a.title.length > 0), 'valid titles');
  });

  it('TMDB.getAnime searches and finds specific anime by title', async () => {
    const results = await TMDB.getAnime({ search: 'Attack on Titan' });
    assert.ok(results.length > 0, 'search results returned');
    assert.ok(results.some(a => a.title.toLowerCase().includes('attack on titan')), 'Attack on Titan found');
  });

  it('Detail View and Watchlist Studio define watched, watch later, and add to list actions', () => {
    assert.ok(indexHtml.includes('id="detailWatchedBtn"'), 'detailWatchedBtn exists');
    assert.ok(indexHtml.includes('id="detailWatchlistBtn"'), 'detailWatchlistBtn exists');
    assert.ok(indexHtml.includes('id="detailAddToListBtn"'), 'detailAddToListBtn exists');
    assert.ok(appJs.includes('handleDetailWatched'), 'handleDetailWatched defined in JS');
    assert.ok(appJs.includes('handleDetailWatchLater'), 'handleDetailWatchLater defined in JS');
    assert.ok(appJs.includes('handleDetailAddToList'), 'handleDetailAddToList defined in JS');
    assert.ok(indexHtml.includes('WATCH LATER'), 'WATCH LATER label exists in indexHtml');
    assert.ok(indexHtml.includes('NOT WATCHED'), 'NOT WATCHED exists in indexHtml');
  });
});

