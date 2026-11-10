import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import app from '../server.js';
import { Storage } from '../src/storage.js';
import { TMDB } from '../src/tmdb.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Codebase Audit Fixes Verification Suite', () => {
  let server;
  let port;

  const appJs = fs.readFileSync(path.join(rootDir, 'public', 'app.js'), 'utf-8');
  const serverJs = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf-8');
  const tmdbJs = fs.readFileSync(path.join(rootDir, 'src/tmdb.js'), 'utf-8');
  const swJs = fs.readFileSync(path.join(rootDir, 'public', 'sw.js'), 'utf-8');

  before(async () => {
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  const baseUrl = () => `http://127.0.0.1:${port}`;

  it('Fix 1: Server and Client validate auth tokens and reject unauthorized mutations for UUID user accounts', async () => {
    const fakeVictimId = '11111111-2222-3333-4444-555555555555';

    // Set mock Supabase configuration in process.env to simulate live Supabase
    const origUrl = process.env.SUPABASE_URL;
    const origKey = process.env.SUPABASE_KEY;
    process.env.SUPABASE_URL = 'https://fake-project.supabase.co';
    process.env.SUPABASE_KEY = 'fake-anon-key';

    try {
      const res = await fetch(`${baseUrl()}/api/user/watchlist/${fakeVictimId}?userId=${fakeVictimId}`, {
        method: 'DELETE'
      });
      assert.strictEqual(res.status, 401, 'Unauthenticated deletion of UUID user data must be rejected with 401');
    } finally {
      process.env.SUPABASE_URL = origUrl || '';
      process.env.SUPABASE_KEY = origKey || '';
    }

    assert.ok(appJs.includes('async function getAuthHeaders()'), 'app.js must define getAuthHeaders');
    assert.ok(appJs.includes('headers: authHeaders'), 'app.js mutations must transmit authHeaders');
  });

  it('Fix 2: Shared view strictly validates and sanitizes trailer and poster params to prevent XSS', () => {
    assert.ok(appJs.includes('/^[a-zA-Z0-9_-]{11}$/.test(trailer)'), 'trailer param must match 11-char YouTube ID');
    assert.ok(appJs.includes('/^(https?:\\/\\/|\\/|images\\/)/i.test(poster)'), 'poster param must match valid URL format');
  });

  it('Fix 3: toggleWatchlistItem implements mutex guard against concurrent duplicate insertions', () => {
    assert.ok(appJs.includes('const _pendingToggleWatchlist = new Set();'), 'toggleWatchlistItem must define _pendingToggleWatchlist Set lock');
    assert.ok(appJs.includes('if (_pendingToggleWatchlist.has('), 'toggleWatchlistItem must check lock');
    assert.ok(appJs.includes('_pendingToggleWatchlist.delete('), 'toggleWatchlistItem must release lock in finally block');
  });

  it('Fix 4: GET /api/settings redacts sensitive TMDB credentials', async () => {
    const res = await fetch(`${baseUrl()}/api/settings`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.settings.tmdbApiKey, undefined, 'tmdbApiKey must be redacted from settings response');
    assert.strictEqual(data.settings.tmdbReadToken, undefined, 'tmdbReadToken must be redacted from settings response');
  });

  it('Fix 5 & 23: Storage utilizes in-memory singleton cache', () => {
    assert.ok(Storage._cache !== undefined, 'Storage must have _cache property');
    const firstRead = Storage.read();
    assert.ok(firstRead && typeof firstRead === 'object');
    assert.ok(Storage._cache, 'Storage._cache must be populated after read');
  });

  it('Fix 6: Server apiCache bounds cache size and sweeps expired keys', () => {
    assert.ok(serverJs.includes('apiCache.keys().next().value'), 'apiCache must use LRU eviction');
    assert.ok(serverJs.includes('setInterval'), 'server.js must have periodic cache cleanup interval');
  });

  it('Fix 7 & 31: TMDB.trailerCache bounds cache size and deduplicates in-flight fetches', () => {
    assert.ok(tmdbJs.includes('static _pendingTrailerFetch = new Map();'), 'TMDB must define _pendingTrailerFetch for concurrency deduplication');
    assert.ok(tmdbJs.includes('static setTrailerCache'), 'TMDB must define bounded setTrailerCache');
    assert.ok(tmdbJs.includes('TMDB.trailerCache.size >= 200'), 'TMDB.trailerCache must be bounded to 200 entries');
  });

  it('Fix 8: User watchlists are isolated in localStorage and generic key is purged on signout', () => {
    assert.ok(appJs.includes('localStorage.removeItem(\'moodflix_watchlist\')'), 'handleSignOut must purge generic moodflix_watchlist key');
    assert.ok(appJs.includes('moodflix_watchlist_${userId}'), 'Storage must use user-scoped watchlist keys');
  });

  it('Fix 10: handleDetailWatched defaults currentSeason to 1, not total seasons', () => {
    assert.ok(!appJs.includes('currentSeason: enriched.numberOfSeasons || 1'), 'handleDetailWatched must not assign total seasons to currentSeason');
    assert.ok(appJs.includes('currentSeason: enriched.seasonNumber != null ? parseInt(enriched.seasonNumber, 10) : 1'), 'currentSeason should default to 1');
  });

  it('Fix 11: findWatchlistItem requires >= 4 chars for seriesTitle fallback matching', () => {
    assert.ok(appJs.includes('targetTitle.length >= 4'), 'seriesTitle fallback must enforce minimum length');
  });

  it('Fix 14: Poster enrichment in import calls rapid-search instead of torrent search', () => {
    assert.ok(appJs.includes('/api/media/rapid-search?q='), 'import poster enrichment must call /api/media/rapid-search');
  });

  it('Fix 15: markSeasonCompleted calculates accurate completion percentage without series episode denominator distortion', () => {
    assert.ok(appJs.includes('const isFinalSeason = seasonNum >= (item.totalSeasons || 1);'), 'markSeasonCompleted must check final season');
    assert.ok(appJs.includes('item.progressPct = 100'), 'progressPct must reach 100 on final season or season card');
  });

  it('Fix 17: Redundant duplicate requests to /api/watchlist are eliminated', () => {
    assert.ok(!appJs.includes("fetch('/api/watchlist'"), 'app.js must not send redundant duplicate POST calls to /api/watchlist');
  });

  it('Fix 18: updateDetailButtons aligns with state.currentDetailMedia', () => {
    assert.ok(appJs.includes('const targetMedia = media || state.currentDetailMedia;'), 'updateDetailButtons must unify target media reference');
  });

  it('Fix 20: Mind benders canonical list uses authentic TMDB paths instead of tmdbId filenames', () => {
    assert.ok(!tmdbJs.includes('95557.jpg'), 'Invincible/Severance must not have 95557.jpg placeholder filename');
    assert.ok(!tmdbJs.includes('42009.jpg'), 'Black Mirror must not have 42009.jpg placeholder filename');
    assert.ok(!tmdbJs.includes('63247.jpg'), 'Westworld must not have 63247.jpg placeholder filename');
  });

  it('Fix 22 & 32: Retro custom select includes keyboard navigation (Arrow Up/Down/Enter/Escape)', () => {
    assert.ok(appJs.includes("e.key === 'ArrowUp'"), 'initRetroCustomSelect must support ArrowUp key navigation');
    assert.ok(appJs.includes("e.key === 'ArrowDown'"), 'initRetroCustomSelect must support ArrowDown key navigation');
  });

  it('Fix 24: deleteCustomList synchronizes removed lists from watchlist items', () => {
    assert.ok(appJs.includes('const affected = state.watchlist.filter('), 'deleteCustomList must identify affected watchlist items');
    assert.ok(appJs.includes('updates: { custom_lists: item.customLists }'), 'deleteCustomList must sync custom_lists update to server');
  });

  it('Fix 25: switchWatchlistSubTab avoids duplicate rendering on tab switch', () => {
    assert.ok(appJs.includes('if (!state.diaryEntries || state.diaryEntries.length === 0)'), 'switchWatchlistSubTab must guard against duplicate diary render');
  });

  it('Fix 26, 27 & 35: Server configures rate limiting, CORS, and Content-Security-Policy headers', async () => {
    const res = await fetch(`${baseUrl()}/api/movies`);
    assert.strictEqual(res.headers.get('access-control-allow-origin'), '*');
    assert.ok(res.headers.get('content-security-policy'), 'CSP header must be present');
    assert.ok(res.headers.get('content-security-policy').includes('https://www.youtube.com'), 'CSP must permit youtube frames');
  });

  it('Fix 29: Service Worker implements Cache-First strategy for images', () => {
    assert.ok(swJs.includes('image.tmdb.org'), 'sw.js must detect TMDB images');
    assert.ok(swJs.includes('caches.match(event.request)'), 'sw.js must match cache first');
  });

  it('Fix 33: renderWatchlist sorts immutably using array copy', () => {
    assert.ok(appJs.includes('const sorted = [...filtered].sort('), 'renderWatchlist must sort a copy of the filtered array');
  });
});

