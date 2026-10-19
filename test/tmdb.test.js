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

  it('falls back to default environment TMDB credentials when user has not entered one', () => {
    const auth = TMDB.getAuthHeadersAndParams({ apiKey: '', token: '' });
    assert.strictEqual(auth.hasAuth, true);
    assert.ok(auth.headers['Authorization'] || auth.queryParams.has('api_key'));
  });

  it('searches actors on TMDB and returns valid performer matches', async () => {
    const actors = await TMDB.searchActors('Keanu Reeves');
    assert.ok(actors.length > 0);
    assert.strictEqual(actors[0].name, 'Keanu Reeves');
    assert.ok(typeof actors[0].id === 'number');
  });

  it('fetches full actor details with filmography and Google Knowledge data', async () => {
    const actor = await TMDB.getActorDetails(6384); // Keanu Reeves TMDB ID
    assert.ok(actor);
    assert.strictEqual(actor.name, 'Keanu Reeves');
    assert.ok(actor.creditsCount > 0);
    assert.ok(Array.isArray(actor.credits));
    assert.ok(actor.credits.some(c => c.title && c.title.toLowerCase().includes('matrix')));
    assert.ok(actor.google);
    assert.ok(actor.google.searchUrl.includes('google.com'));
  });

  it('tolerates typos in movie searches (e.g. Inceptoin -> Inception)', async () => {
    const results = await TMDB.getMovies({ search: 'Inceptoin' });
    assert.ok(results.length > 0);
    assert.ok(results.some(m => m.title.toLowerCase().includes('inception')));
  });

  it('tolerates typos in actor searches (e.g. Keanu Reves -> Keanu Reeves)', async () => {
    const actors = await TMDB.searchActors('Keanu Reves');
    assert.ok(actors.length > 0);
    assert.strictEqual(actors[0].name, 'Keanu Reeves');
  });
});
