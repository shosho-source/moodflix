import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TMDB } from '../src/tmdb.js';

describe('TMDB Movie & TV Provider', () => {
  it('returns TMDB movie feed with valid scores and vote counts', async () => {
    const movies = await TMDB.getMovies();
    assert.ok(movies.length > 0);
    assert.ok(movies.every(m => m.mediaType === 'movie'));
    assert.ok(movies.every(m => m.rating >= 0 && m.rating <= 10));
    assert.ok(movies.every(m => typeof m.voteCount === 'number'));
  });

  it('returns TMDB TV series feed with valid fields and mediaType', async () => {
    const tvShows = await TMDB.getTVShows();
    assert.ok(tvShows.length > 0);
    assert.ok(tvShows.every(s => s.mediaType === 'tv'));
    assert.ok(tvShows.every(s => typeof s.title === 'string' && s.title.length > 0));
    assert.ok(tvShows.every(s => typeof s.rating === 'number'));
  });

  it('filters movies by title search', async () => {
    const results = await TMDB.getMovies({ search: 'oppenheimer' });
    assert.ok(results.some(m => m.title.toLowerCase().includes('oppenheimer')));
  });

  it('searches and finds live TV series by title', async () => {
    const results = await TMDB.getTVShows({ search: 'Breaking Bad' });
    assert.ok(results.length > 0);
    assert.strictEqual(results[0].title, 'Breaking Bad');
    assert.strictEqual(results[0].mediaType, 'tv');
  });

  it('filters TV shows by category (popular, top_rated)', async () => {
    const topRated = await TMDB.getTVShows({ category: 'top_rated' });
    assert.ok(topRated.length > 0);
    assert.ok(topRated.every(s => s.category === 'top_rated'));
  });
});
