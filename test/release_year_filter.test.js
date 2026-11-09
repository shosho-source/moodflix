import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { TMDB } from '../src/tmdb.js';

describe('Release Year Filtering Suite', () => {

  describe('TMDB.matchesYearFilter Helper', () => {
    it('returns true when filter is "all" or empty', () => {
      assert.strictEqual(TMDB.matchesYearFilter(2024, 'all'), true);
      assert.strictEqual(TMDB.matchesYearFilter(1994, ''), true);
      assert.strictEqual(TMDB.matchesYearFilter(2020, null), true);
    });

    it('accurately matches exact 4-digit years', () => {
      assert.strictEqual(TMDB.matchesYearFilter(2024, '2024'), true);
      assert.strictEqual(TMDB.matchesYearFilter('2024', '2024'), true);
      assert.strictEqual(TMDB.matchesYearFilter(2023, '2024'), false);
      assert.strictEqual(TMDB.matchesYearFilter(1999, '1999'), true);
      assert.strictEqual(TMDB.matchesYearFilter(2000, '1999'), false);
    });

    it('accurately matches decades (2020s, 2010s, 2000s, 1990s, 1980s, 1970s)', () => {
      assert.strictEqual(TMDB.matchesYearFilter(2024, '2020s'), true);
      assert.strictEqual(TMDB.matchesYearFilter(2020, '2020s'), true);
      assert.strictEqual(TMDB.matchesYearFilter(2029, '2020s'), true);
      assert.strictEqual(TMDB.matchesYearFilter(2019, '2020s'), false);

      assert.strictEqual(TMDB.matchesYearFilter(2015, '2010s'), true);
      assert.strictEqual(TMDB.matchesYearFilter(2008, '2000s'), true);
      assert.strictEqual(TMDB.matchesYearFilter(1994, '1990s'), true);
      assert.strictEqual(TMDB.matchesYearFilter(1982, '1980s'), true);
      assert.strictEqual(TMDB.matchesYearFilter(1977, '1970s'), true);
      assert.strictEqual(TMDB.matchesYearFilter(1969, '1970s'), false);
    });

    it('accurately matches classics and historical cutoffs', () => {
      assert.strictEqual(TMDB.matchesYearFilter(1968, 'classic'), true);
      assert.strictEqual(TMDB.matchesYearFilter(1954, 'pre_1970'), true);
      assert.strictEqual(TMDB.matchesYearFilter(1972, 'pre_1970'), false);
      assert.strictEqual(TMDB.matchesYearFilter(1975, 'pre_1980'), true);
      assert.strictEqual(TMDB.matchesYearFilter(1985, 'pre_1980'), false);
    });

    it('rejects items with invalid or missing years when filtering', () => {
      assert.strictEqual(TMDB.matchesYearFilter(null, '2024'), false);
      assert.strictEqual(TMDB.matchesYearFilter(undefined, '2024'), false);
      assert.strictEqual(TMDB.matchesYearFilter('TBA', '2024'), false);
    });
  });

  describe('TMDB.applyYearParamsToQuery Helper', () => {
    it('sets primary_release_year for movies with exact year', () => {
      const params = {};
      TMDB.applyYearParamsToQuery(params, 'movie', '2024');
      assert.strictEqual(String(params.primary_release_year), '2024');
      assert.strictEqual(params['primary_release_date.gte'], undefined);
    });

    it('sets first_air_date_year for tv with exact year', () => {
      const params = {};
      TMDB.applyYearParamsToQuery(params, 'tv', '2023');
      assert.strictEqual(String(params.first_air_date_year), '2023');
      assert.strictEqual(params['first_air_date.gte'], undefined);
    });

    it('sets date boundaries for decade filters on movies', () => {
      const params = {};
      TMDB.applyYearParamsToQuery(params, 'movie', '2010s');
      assert.strictEqual(params['primary_release_date.gte'], '2010-01-01');
      assert.strictEqual(params['primary_release_date.lte'], '2019-12-31');
    });

    it('sets upper boundary for classic / pre_1970 filters on tv', () => {
      const params = {};
      TMDB.applyYearParamsToQuery(params, 'tv', 'pre_1970');
      assert.strictEqual(params['first_air_date.lte'], '1969-12-31');
    });
  });

  describe('Live TMDB Year Filter Integration', () => {
    it('TMDB.getMedia with movie and year 2024 returns matching releases', async () => {
      const items = await TMDB.getMedia({ type: 'movie', category: 'all', year: '2024' });
      assert.ok(Array.isArray(items), 'Expected array of results');
      assert.ok(items.length > 0, 'Expected results for 2024 movies');
      for (const item of items.slice(0, 5)) {
        assert.ok(item.year, `Item ${item.title} should have a year`);
        assert.strictEqual(parseInt(item.year, 10), 2024, `Item ${item.title} (${item.year}) should be 2024`);
      }
    });

    it('TMDB.getAnime with year 2024 returns anime matching 2024', async () => {
      const anime = await TMDB.getAnime({ category: 'all', year: '2024' });
      assert.ok(Array.isArray(anime), 'Expected array of anime results');
      assert.ok(anime.length > 0, 'Expected anime results for 2024');
      for (const item of anime.slice(0, 5)) {
        assert.ok(item.year, `Anime item ${item.title} should have a year`);
        assert.strictEqual(parseInt(item.year, 10), 2024, `Anime ${item.title} (${item.year}) should be 2024`);
      }
    });
  });

  describe('Frontend Markup & Wiring Verification', () => {
    const html = fs.readFileSync(path.resolve('public/index.html'), 'utf8');
    const appJs = fs.readFileSync(path.resolve('public/app.js'), 'utf8');

    it('index.html contains movieYearSelect, animeYearSelect, and wlYearSelect with options', () => {
      assert.ok(html.includes('id="movieYearSelect"'), 'movieYearSelect must be in index.html');
      assert.ok(html.includes('id="animeYearSelect"'), 'animeYearSelect must be in index.html');
      assert.ok(html.includes('id="wlYearSelect"'), 'wlYearSelect must be in index.html');

      assert.ok(html.includes('<option value="2026">2026</option>'));
      assert.ok(html.includes('<option value="2010s">2010s</option>'));
      assert.ok(html.includes('<option value="1990s">1990s</option>'));
      assert.ok(html.includes('value="classic"'));
    });

    it('app.js declares year select elements and binds change listeners', () => {
      assert.ok(appJs.includes("movieYearSelect: document.getElementById('movieYearSelect')"));
      assert.ok(appJs.includes("animeYearSelect: document.getElementById('animeYearSelect')"));
      assert.ok(appJs.includes("wlYearSelect: document.getElementById('wlYearSelect')"));

      assert.ok(appJs.includes("elements.movieYearSelect?.addEventListener('change', () => loadMovies())"));
      assert.ok(appJs.includes("elements.animeYearSelect?.addEventListener('change', () => loadAnime())"));
      assert.ok(appJs.includes("document.getElementById('wlYearSelect')?.addEventListener('change'"));
    });

    it('app.js transmits year param in loadMovies and loadAnime', () => {
      assert.ok(appJs.includes('&year=${encodeURIComponent(year)}'));
    });

    it('app.js includes matchesYearFilter and filters watchlist by year in renderWatchlist', () => {
      assert.ok(appJs.includes('function matchesYearFilter(itemYear, filterValue)'));
      assert.ok(appJs.includes('matchesYearFilter(item.year, year)'));
      assert.ok(appJs.includes("year: 'all'"));
    });

    it('resetWatchlistFilters resets year and retro select properly', () => {
      assert.ok(appJs.includes("syncRetroCustomSelect(elYear)"));
    });
  });

});
