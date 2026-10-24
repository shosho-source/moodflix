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
    const details = await TMDB.getDetails(220542, 'tv', {
      fallbackTitle: 'The Apothecary Diaries',
      fallbackYear: '2023'
    });

    assert.ok(details);
    assert.ok(typeof details.trailerKey === 'string' && details.trailerKey.length === 11);
    assert.ok(Array.isArray(details.trailerKeys) && details.trailerKeys.length > 0);
  });
});
