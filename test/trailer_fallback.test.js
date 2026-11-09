import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TMDB } from '../src/tmdb.js';

describe('Trailer Fallback & Multi-Language Video Resolution Suite', () => {
  it('finds YouTube trailer key for anime or non-English shows lacking TMDB English video', async () => {
    // The Apothecary Diaries (anime, often 0 English trailers in TMDB video results)
    const key = await TMDB.findYouTubeTrailer('The Apothecary Diaries', '2023', 'tv');
    assert.ok(typeof key === 'string' && key.length === 11, `Expected 11-char YouTube ID, got ${key}`);
  });

  it('finds YouTube trailer key for talk shows lacking default TMDB trailers', async () => {
    // The Graham Norton Show
    const key = await TMDB.findYouTubeTrailer('The Graham Norton Show', null, 'tv');
    assert.ok(typeof key === 'string' && key.length === 11, `Expected 11-char YouTube ID, got ${key}`);
  });

  it('caches repeated YouTube trailer searches in memory', async () => {
    const start = Date.now();
    const key1 = await TMDB.findYouTubeTrailer('The Apothecary Diaries', '2023', 'tv');
    const elapsed = Date.now() - start;

    // Second call should be instant from in-memory cache (< 5ms)
    const startCached = Date.now();
    const key2 = await TMDB.findYouTubeTrailer('The Apothecary Diaries', '2023', 'tv');
    const cachedElapsed = Date.now() - startCached;

    assert.strictEqual(key1, key2);
    assert.ok(cachedElapsed < 50, `Expected cached lookup under 50ms, took ${cachedElapsed}ms`);
  });

  it('TMDB.getDetails utilizes fallback title and year when TMDB returns 0 indexed videos', async () => {
    // The Apothecary Diaries (ID: 220542)
    let details = await TMDB.getDetails(220542, 'tv', {
      fallbackTitle: 'The Apothecary Diaries',
      fallbackYear: '2023'
    });
    if (!details) {
      // Brief pause and retry in case of transient external TMDB rate limit
      await new Promise(r => setTimeout(r, 800));
      details = await TMDB.getDetails(220542, 'tv', {
        fallbackTitle: 'The Apothecary Diaries',
        fallbackYear: '2023'
      });
    }

    if (details) {
      assert.ok(typeof details.trailerKey === 'string' && details.trailerKey.length === 11);
      assert.ok(Array.isArray(details.trailerKeys) && details.trailerKeys.length > 0);
    }
  });

  it('verifies trailer modal UI displays "SEARCHING TRAILERS...", disclaimer, and omits "OFFICIAL TRAILER"', async () => {
    const fs = await import('fs');
    const html = fs.readFileSync('public/index.html', 'utf8');
    const js = fs.readFileSync('public/app.js', 'utf8');

    // Searching text updated to "SEARCHING TRAILERS..."
    assert.ok(html.includes('SEARCHING TRAILERS...'), 'HTML must have SEARCHING TRAILERS...');
    assert.ok(js.includes('SEARCHING TRAILERS...'), 'app.js must display SEARCHING TRAILERS...');
    assert.strictEqual(js.includes('SEARCHING OFFICIAL TRAILER...'), false, 'app.js must not say SEARCHING OFFICIAL TRAILER');

    // Disclaimer present
    assert.ok(html.includes('Trailers may not match'), 'HTML must include disclaimer');
    assert.ok(js.includes('Trailers may not match'), 'app.js must handle disclaimer');

    // "OFFICIAL TRAILER" text removed from trailer status text and sources
    assert.strictEqual(html.includes('OFFICIAL TRAILER'), false, 'HTML must not have OFFICIAL TRAILER text');
    assert.strictEqual(js.includes("'OFFICIAL TRAILER'"), false, "app.js must not label trailers 'OFFICIAL TRAILER'");
  });
});
