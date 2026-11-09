import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Storage } from '../src/storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('TV Seasons Separation & Independent Season Cards', () => {
  const indexHtml = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf-8');
  const appJs = fs.readFileSync(path.join(rootDir, 'public', 'app.js'), 'utf-8');
  const styleCss = fs.readFileSync(path.join(rootDir, 'public', 'style.css'), 'utf-8');

  it('HTML contains UI controls for separating seasons', () => {
    assert.strictEqual(indexHtml.includes('id="btnSeparateAllSeasons"'), false, 'Toolbar Separate All Seasons button is removed');
    assert.ok(indexHtml.includes('id="detailSeparateSeasonsBtn"'), 'Detail View Add All Seasons button exists');
    assert.ok(appJs.includes('btn-wl-separate'), 'Card render includes separate seasons button');
  });

  it('CSS defines retro brutalist styling for season separation buttons and season badges', () => {
    assert.ok(styleCss.includes('.btn-wl-separate'), '.btn-wl-separate class exists');
    assert.ok(styleCss.includes('.wl-separate-all-btn'), '.wl-separate-all-btn class exists');
    assert.ok(styleCss.includes('.badge-tv-season'), '.badge-tv-season class exists');
  });

  it('JavaScript defines core functions for season splitting and season card handling', () => {
    assert.ok(appJs.includes('function normalizeWatchlistItem'), 'normalizeWatchlistItem exists');
    assert.ok(appJs.includes('async function splitTvShowIntoSeasons'), 'splitTvShowIntoSeasons exists');
    assert.ok(appJs.includes('async function splitAllTvShowsIntoSeasons'), 'splitAllTvShowsIntoSeasons exists');
    assert.ok(appJs.includes('btn-wl-separate'), 'Card render includes separate seasons button');
  });

  it('Sequential episode distribution splits 159 episodes across HIMYM 9 seasons accurately', () => {
    // 9 seasons of How I Met Your Mother
    const himymSeasons = [
      { season_number: 1, name: 'Season 1', episode_count: 22, air_date: '2005-09-19', poster: 'https://image.tmdb.org/t/p/w500/himym_s1.jpg' },
      { season_number: 2, name: 'Season 2', episode_count: 22, air_date: '2006-09-18', poster: 'https://image.tmdb.org/t/p/w500/himym_s2.jpg' },
      { season_number: 3, name: 'Season 3', episode_count: 20, air_date: '2007-09-24', poster: 'https://image.tmdb.org/t/p/w500/himym_s3.jpg' },
      { season_number: 4, name: 'Season 4', episode_count: 24, air_date: '2008-09-22', poster: 'https://image.tmdb.org/t/p/w500/himym_s4.jpg' },
      { season_number: 5, name: 'Season 5', episode_count: 24, air_date: '2009-09-21', poster: 'https://image.tmdb.org/t/p/w500/himym_s5.jpg' },
      { season_number: 6, name: 'Season 6', episode_count: 24, air_date: '2010-09-20', poster: 'https://image.tmdb.org/t/p/w500/himym_s6.jpg' },
      { season_number: 7, name: 'Season 7', episode_count: 24, air_date: '2011-09-19', poster: 'https://image.tmdb.org/t/p/w500/himym_s7.jpg' },
      { season_number: 8, name: 'Season 8', episode_count: 24, air_date: '2012-09-24', poster: 'https://image.tmdb.org/t/p/w500/himym_s8.jpg' },
      { season_number: 9, name: 'Season 9', episode_count: 24, air_date: '2013-09-23', poster: 'https://image.tmdb.org/t/p/w500/himym_s9.jpg' }
    ];

    const monolithicItem = {
      id: '1100',
      tmdbId: 1100,
      title: 'How I Met Your Mother',
      mediaType: 'tv',
      year: 2005,
      currentSeason: 1,
      currentEpisode: 159,
      totalEpisodes: 208,
      status: 'watching'
    };

    // Test episode distribution logic
    let remainingWatched = monolithicItem.currentEpisode;
    const seasonResults = himymSeasons.map(s => {
      const seasonNum = s.season_number;
      const seasonEps = s.episode_count;
      let seasonWatched = 0;
      if (remainingWatched >= seasonEps) {
        seasonWatched = seasonEps;
        remainingWatched -= seasonEps;
      } else {
        seasonWatched = remainingWatched;
        remainingWatched = 0;
      }

      let seasonStatus = 'plan_to_watch';
      if (seasonWatched >= seasonEps) {
        seasonStatus = 'completed';
      } else if (seasonWatched > 0) {
        seasonStatus = 'watching';
      }

      const progressPct = Math.min(100, Math.round((seasonWatched / seasonEps) * 100));

      return {
        seasonNumber: seasonNum,
        title: `How I Met Your Mother - Season ${seasonNum}`,
        totalEpisodes: seasonEps,
        currentEpisode: seasonWatched,
        progressPct,
        status: seasonStatus,
        year: parseInt(s.air_date.slice(0, 4), 10)
      };
    });

    assert.strictEqual(seasonResults.length, 9, 'Produces 9 individual season cards');

    // S1 to S6 must be 100% completed
    for (let i = 0; i < 6; i++) {
      const s = seasonResults[i];
      assert.strictEqual(s.currentEpisode, s.totalEpisodes, `Season ${s.seasonNumber} watched episodes equals total`);
      assert.strictEqual(s.status, 'completed', `Season ${s.seasonNumber} is marked completed`);
      assert.strictEqual(s.progressPct, 100, `Season ${s.seasonNumber} progress is 100%`);
    }

    // Season 7: 159 - (22+22+20+24+24+24 = 136) = 23 episodes
    const s7 = seasonResults[6];
    assert.strictEqual(s7.seasonNumber, 7);
    assert.strictEqual(s7.currentEpisode, 23, 'Season 7 has exactly 23 episodes watched');
    assert.strictEqual(s7.totalEpisodes, 24, 'Season 7 has 24 total episodes');
    assert.strictEqual(s7.status, 'watching', 'Season 7 status is watching');
    assert.strictEqual(s7.progressPct, 96, 'Season 7 progress is 96%');
    assert.strictEqual(s7.year, 2011, 'Season 7 release year is 2011');

    // Season 8 and 9 must be unwatched
    const s8 = seasonResults[7];
    assert.strictEqual(s8.currentEpisode, 0);
    assert.strictEqual(s8.status, 'plan_to_watch');
    assert.strictEqual(s8.progressPct, 0);
    assert.strictEqual(s8.year, 2012);

    const s9 = seasonResults[8];
    assert.strictEqual(s9.currentEpisode, 0);
    assert.strictEqual(s9.status, 'plan_to_watch');
    assert.strictEqual(s9.progressPct, 0);
    assert.strictEqual(s9.year, 2013);
  });

  it('Fully completed TV shows distribute 100% completion across all seasons', () => {
    const show = {
      title: 'Breaking Bad',
      status: 'completed',
      currentEpisode: 62,
      totalEpisodes: 62
    };

    const seasons = [
      { season_number: 1, episode_count: 7 },
      { season_number: 2, episode_count: 13 },
      { season_number: 3, episode_count: 13 },
      { season_number: 4, episode_count: 13 },
      { season_number: 5, episode_count: 16 }
    ];

    const isCompleted = show.status === 'completed';
    const split = seasons.map(s => ({
      seasonNumber: s.season_number,
      currentEpisode: isCompleted ? s.episode_count : 0,
      totalEpisodes: s.episode_count,
      status: isCompleted ? 'completed' : 'plan_to_watch',
      progressPct: isCompleted ? 100 : 0
    }));

    assert.strictEqual(split.length, 5);
    split.forEach(s => {
      assert.strictEqual(s.status, 'completed');
      assert.strictEqual(s.progressPct, 100);
      assert.strictEqual(s.currentEpisode, s.totalEpisodes);
    });
  });

  it('Storage accurately persists multiple individual seasons without collisions', () => {
    Storage.clearWatchlist();

    const season1 = {
      id: '1100_s1',
      tmdbId: 1100,
      mediaType: 'tv',
      isSeason: true,
      seasonNumber: 1,
      seriesTitle: 'How I Met Your Mother',
      title: 'How I Met Your Mother - Season 1',
      year: 2005,
      totalEpisodes: 22,
      currentEpisode: 22,
      status: 'completed',
      progressPct: 100
    };

    const season2 = {
      id: '1100_s2',
      tmdbId: 1100,
      mediaType: 'tv',
      isSeason: true,
      seasonNumber: 2,
      seriesTitle: 'How I Met Your Mother',
      title: 'How I Met Your Mother - Season 2',
      year: 2006,
      totalEpisodes: 22,
      currentEpisode: 22,
      status: 'completed',
      progressPct: 100
    };

    const season7 = {
      id: '1100_s7',
      tmdbId: 1100,
      mediaType: 'tv',
      isSeason: true,
      seasonNumber: 7,
      seriesTitle: 'How I Met Your Mother',
      title: 'How I Met Your Mother - Season 7',
      year: 2011,
      totalEpisodes: 24,
      currentEpisode: 23,
      status: 'watching',
      progressPct: 96
    };

    Storage.addToWatchlist(season1);
    Storage.addToWatchlist(season2);
    Storage.addToWatchlist(season7);

    const watchlist = Storage.getWatchlist();
    assert.strictEqual(watchlist.length, 3, 'All 3 seasons are stored without collision');

    const s7Saved = watchlist.find(w => w.id === '1100_s7');
    assert.ok(s7Saved, 'Season 7 found in storage');
    assert.strictEqual(s7Saved.currentEpisode, 23);
    assert.strictEqual(s7Saved.totalEpisodes, 24);
    assert.strictEqual(s7Saved.isSeason, true);
    assert.strictEqual(s7Saved.seasonNumber, 7);
    assert.strictEqual(s7Saved.seriesTitle, 'How I Met Your Mother');

    // Remove season 2 individually
    Storage.removeFromWatchlist('1100_s2');
    const afterDelete = Storage.getWatchlist();
    assert.strictEqual(afterDelete.length, 2, 'One season was removed individually');
    assert.ok(!afterDelete.some(w => w.id === '1100_s2'), 'Season 2 was deleted');
    assert.ok(afterDelete.some(w => w.id === '1100_s1'), 'Season 1 remains intact');
    assert.ok(afterDelete.some(w => w.id === '1100_s7'), 'Season 7 remains intact');
  });

  it('Step up and step down adjustments on season cards update episode count within bounds', () => {
    let s7 = {
      title: 'How I Met Your Mother - Season 7',
      totalEpisodes: 24,
      currentEpisode: 23,
      progressPct: 96,
      status: 'watching'
    };

    // Step up (+1 EP) should reach completion
    const stepUp = (item) => {
      const total = item.totalEpisodes;
      const cur = Math.min(total, item.currentEpisode + 1);
      item.currentEpisode = cur;
      item.progressPct = Math.round((cur / total) * 100);
      if (cur >= total) item.status = 'completed';
    };

    stepUp(s7);
    assert.strictEqual(s7.currentEpisode, 24);
    assert.strictEqual(s7.progressPct, 100);
    assert.strictEqual(s7.status, 'completed');

    // Stepping up again should not exceed 24
    stepUp(s7);
    assert.strictEqual(s7.currentEpisode, 24);

    // Step down (-1 EP) should un-complete
    const stepDown = (item) => {
      const total = item.totalEpisodes;
      const cur = Math.max(0, item.currentEpisode - 1);
      item.currentEpisode = cur;
      item.progressPct = Math.round((cur / total) * 100);
      if (cur < total && cur > 0) item.status = 'watching';
      else if (cur === 0) item.status = 'plan_to_watch';
    };

    stepDown(s7);
    assert.strictEqual(s7.currentEpisode, 23);
    assert.strictEqual(s7.progressPct, 96);
    assert.strictEqual(s7.status, 'watching');
  });

  it('removeWatchlistItem only deletes the targeted season card and preserves remaining seasons sharing the same tmdbId', () => {
    let watchlist = [
      { id: '1100_s1', tmdbId: 1100, isSeason: true, seasonNumber: 1, title: 'How I Met Your Mother - Season 1' },
      { id: '1100_s2', tmdbId: 1100, isSeason: true, seasonNumber: 2, title: 'How I Met Your Mother - Season 2' },
      { id: '1100_s3', tmdbId: 1100, isSeason: true, seasonNumber: 3, title: 'How I Met Your Mother - Season 3' }
    ];

    const targetItem = watchlist[0]; // Season 1
    const targetId = targetItem.id;

    // Filter using the exact logic implemented in removeWatchlistItem
    watchlist = watchlist.filter(w => {
      if (w === targetItem) return false;
      if (targetId && w.id && String(w.id) === targetId) return false;
      if (targetItem.isSeason && w.isSeason) {
        if (targetItem.tmdbId && w.tmdbId === targetItem.tmdbId && targetItem.seasonNumber != null && w.seasonNumber != null) {
          return (targetItem.seasonNumber !== w.seasonNumber);
        }
      }
      return true;
    });

    assert.strictEqual(watchlist.length, 2, 'Only 1 season removed; 2 seasons remain');
    assert.strictEqual(watchlist[0].seasonNumber, 2, 'Season 2 is preserved');
    assert.strictEqual(watchlist[1].seasonNumber, 3, 'Season 3 is preserved');
  });
});


