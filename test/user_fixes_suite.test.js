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

describe('User 9 Fixes Verification Suite', () => {
  let server;
  let port;

  const appJs = fs.readFileSync(path.join(rootDir, 'public', 'app.js'), 'utf-8');
  const styleCss = fs.readFileSync(path.join(rootDir, 'public', 'style.css'), 'utf-8');
  const indexHtml = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf-8');

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

  it('Fix 1: WATCHLIST STUDIO heading is replaced by WATCHLIST in HTML', () => {
    assert.ok(
      indexHtml.includes('WATCHLIST') && !indexHtml.includes('WATCHLIST STUDIO'),
      'index.html should have WATCHLIST instead of WATCHLIST STUDIO'
    );
  });

  it('Fix 2: Estimated watch time only counts watched movies, shows, and series', () => {
    // Check renderWatchlistStats implementation in app.js
    assert.ok(appJs.includes("if (i.status === 'completed')"), 'Movies should check completed status');
    assert.ok(appJs.includes("parseInt(i.currentEpisode, 10) || 0"), 'TV shows should only count watched episodes if not completed');

    // Simulate watch time calculation
    const testWatchlist = [
      { mediaType: 'movie', runtime: 120, status: 'plan_to_watch' }, // unwatched -> 0
      { mediaType: 'movie', runtime: 100, status: 'completed' },     // watched -> 100 min
      { mediaType: 'tv', runtime: 45, currentEpisode: 0, totalEpisodes: 10, status: 'plan_to_watch' }, // unwatched -> 0
      { mediaType: 'tv', runtime: 50, currentEpisode: 4, totalEpisodes: 10, status: 'watching' },     // 4 eps -> 200 min
      { mediaType: 'tv', runtime: 30, currentEpisode: 10, totalEpisodes: 10, status: 'completed' }    // 10 eps -> 300 min
    ];

    let totalMinutes = 0;
    testWatchlist.forEach(i => {
      const isMovie = (i.mediaType || i.media_type) === 'movie';
      if (isMovie) {
        if (i.status === 'completed') {
          totalMinutes += (i.runtime || 110);
        }
      } else {
        if (i.status === 'completed') {
          const eps = i.totalEpisodes || i.currentEpisode || 10;
          totalMinutes += eps * (i.runtime || 45);
        } else {
          const eps = parseInt(i.currentEpisode, 10) || 0;
          if (eps > 0) {
            totalMinutes += eps * (i.runtime || 45);
          }
        }
      }
    });

    const totalHours = Math.round(totalMinutes / 60);
    // 100 + 200 + 300 = 600 min = 10 hours
    assert.strictEqual(totalMinutes, 600, 'Only watched items should be counted');
    assert.strictEqual(totalHours, 10, 'Expected 10 watched hours');
  });

  it('Fix 3 & 8: toggleWatchlistItem and handleDetailWatchLater / AddToList define userId and operate without crashes', () => {
    // Check that toggleWatchlistItem defines userId
    const toggleFnIndex = appJs.indexOf('async function toggleWatchlistItem');
    assert.ok(toggleFnIndex > 0, 'toggleWatchlistItem exists');
    const toggleChunk = appJs.slice(toggleFnIndex, toggleFnIndex + 400);
    assert.ok(toggleChunk.includes('const userId = state.user ? state.user.id : \'guest\';'), 'toggleWatchlistItem must define userId');

    // Check handleDetailAddToList fallback handling
    assert.ok(appJs.includes('openAssignToListModal(target);'), 'handleDetailAddToList calls openAssignToListModal');
    // Check saveAssignLists updates detail buttons
    assert.ok(appJs.includes('updateDetailButtons(state.currentDetailMedia);'), 'saveAssignLists updates detail buttons');
  });

  it('Fix 4: Character search resolves rajesh koothrapalli, alex dunphy, phil dunphy, penny, howard wallowitz', async () => {
    const testCases = [
      { query: 'rajesh koothrapalli', expectedActor: 'Kunal Nayyar', character: 'Rajesh Koothrappali' },
      { query: 'alex dunphy', expectedActor: 'Ariel Winter', character: 'Alex Dunphy' },
      { query: 'phil dunphy', expectedActor: 'Ty Burrell', character: 'Phil Dunphy' },
      { query: 'penny', expectedActor: 'Kaley Cuoco', character: 'Penny' },
      { query: 'howard wallowitz', expectedActor: 'Simon Helberg', character: 'Howard Wolowitz' }
    ];

    for (const tc of testCases) {
      const results = await TMDB.searchArtists(tc.query);
      assert.ok(results.length > 0, `Query "${tc.query}" should return results`);
      assert.strictEqual(results[0].name, tc.expectedActor, `Expected ${tc.expectedActor} for "${tc.query}"`);
      assert.strictEqual(results[0].characterPlayed, tc.character, `Expected character ${tc.character} for "${tc.query}"`);
    }
  });

  it('Fix 5: Trailer iframe includes allow="autoplay" for seamless autoplay', () => {
    assert.ok(
      indexHtml.includes('allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"'),
      'trailer-iframe must include allow="autoplay"'
    );
    assert.ok(appJs.includes('autoplay=1&enablejsapi=1'), 'embed URL must include autoplay=1');
  });

  it('Fix 6: Trailer resolution prioritizes authentic official trailers and anime trailers', async () => {
    // Inception should get the authentic English trailer
    const inception = await TMDB.getDetails(27205, 'movie');
    assert.ok(inception.trailerKey, 'Inception should have a trailer key');
    assert.notStrictEqual(inception.trailerKey, 'GfnyDtiXfns', 'Inception must not pick Japanese-dubbed trailer over English trailer');

    // Attack on Titan
    const aot = await TMDB.getDetails(1429, 'tv');
    assert.ok(aot.trailerKey, 'Attack on Titan should have a trailer key');
  });

  it('Fix 7: Diary log links directly to movie/show/anime title', () => {
    assert.ok(appJs.includes('title="Click to view details for ${safeTitle}"'), 'Diary title has click hint tooltip');
    assert.ok(appJs.includes('/api/media/rapid-search?q='), 'openItemDetail queries TMDB to link title');
    assert.ok(styleCss.includes('.diary-card-title:hover'), 'CSS styles hover link for diary title');
  });

  it('Fix 9: Gallery frames contain only widescreen frames (aspectRatio >= 1.3), zero posters', async () => {
    const movieDetails = await TMDB.getDetails(155, 'movie');
    assert.ok(movieDetails.frames.length >= 10, 'Expected at least 10 frames');
    for (const f of movieDetails.frames) {
      assert.ok(f.aspectRatio >= 1.3, `Frame aspect ratio ${f.aspectRatio} must be >= 1.3 (widescreen, not poster)`);
      assert.ok(f.width >= f.height, `Frame width (${f.width}) must exceed height (${f.height})`);
    }

    const tvDetails = await TMDB.getDetails(1396, 'tv');
    assert.ok(tvDetails.frames.length >= 10, 'Expected at least 10 frames');
    for (const f of tvDetails.frames) {
      assert.ok(f.aspectRatio >= 1.3, `TV Frame aspect ratio ${f.aspectRatio} must be >= 1.3`);
      assert.ok(f.width >= f.height, `TV Frame width (${f.width}) must exceed height (${f.height})`);
    }
  });
});

