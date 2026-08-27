/**
 * TheRottenCine / MovieCine - Main coordinator for fetching TMDB movies,
 * ranking torrents from The Cine Bay, and downloading the highest quality release.
 */

import { TMDB } from './tmdb.js';
import { CineBay } from './cineBay.js';
import { Downloader } from './downloader.js';
import { Storage } from './storage.js';
import { NameCleaner } from './nameCleaner.js';

export class TheRottenCine {
  constructor(config = {}) {
    const saved = Storage.getSettings();
    this.config = {
      ...saved,
      ...config
    };
    this.movies = [];
    this.logs = [];
  }

  log(msg, type = 'info') {
    const entry = { time: new Date().toLocaleTimeString(), message: msg, type };
    this.logs.push(entry);
    if (this.onLog) {
      this.onLog(entry);
    }
  }

  /**
   * Fetch and filter movies from TMDB according to criteria
   */
  async gatherAndFilterMovies(options = {}) {
    const minRating = options.minRating ?? this.config.minRating ?? 7.5;
    const skipDownloaded = options.skipDownloaded ?? true;

    this.log(`Fetching movies from TMDB (Min Rating: ★ ${minRating}/10, Category: ${options.category || 'all'})...`);

    const allMovies = await TMDB.getMovies({
      minRating,
      category: options.category,
      search: options.search
    });

    this.log(`Found ${allMovies.length} matching movies from TMDB.`);

    let filtered = allMovies;
    if (skipDownloaded) {
      filtered = allMovies.filter(m => !Storage.hasDownloaded(m.title));
      const skippedCount = allMovies.length - filtered.length;
      if (skippedCount > 0) {
        this.log(`Filtered out ${skippedCount} movies already downloaded.`);
      }
    }

    this.movies = filtered;
    return filtered;
  }

  /**
   * Search The Cine Bay for a specific movie title and return ranked torrents
   */
  async searchMovieTorrents(title, options = {}) {
    const minSeeds = options.minSeeds ?? this.config.minSeeds;
    const cleanTitle = NameCleaner.clean(title);

    this.log(`Searching The Cine Bay for: "${title}" (cleaned: "${cleanTitle}")...`);
    const results = await CineBay.search(cleanTitle, { minSeeds });

    this.log(`Found ${results.length} torrents for "${title}".`);
    return results;
  }

  /**
   * Search for a single movie and immediately download/queue the top-ranked torrent
   */
  async downloadSingleMovie(title, options = {}) {
    this.log(`Initiating search and download for: "${title}"`);
    const results = await this.searchMovieTorrents(title, options);

    if (!results || results.length === 0) {
      this.log(`No matching torrents found with >= ${options.minSeeds || this.config.minSeeds} seeds.`, 'warn');
      return { success: false, reason: 'No torrents found' };
    }

    const bestTorrent = results[0];
    this.log(`Selected top torrent: "${bestTorrent.name}" (Score: ${bestTorrent.rankScore}/100, Quality: ${bestTorrent.qualityBadge}, Seeds: ${bestTorrent.seeders})`, 'success');

    const downloadResult = await Downloader.startDownload(title, bestTorrent, options);
    this.log(`Recorded download transfer: "${bestTorrent.name}"`, 'success');

    return {
      success: true,
      torrent: bestTorrent,
      record: downloadResult.record
    };
  }

  /**
   * Main automatic execution run:
   * 1. Gather & filter TMDB high-rated releases
   * 2. Search & rank Cine Bay torrents
   * 3. Download the highest scoring torrent for each movie
   */
  async execute(options = {}) {
    this.log('====================================================');
    this.log('🚀 Starting The Cine Bay automated cycle with TMDB');
    this.log('====================================================');

    const moviesToProcess = await this.gatherAndFilterMovies(options);
    const downloads = [];
    const skipped = [];

    for (const movie of moviesToProcess) {
      this.log(`Processing: "${movie.title}" (${movie.year}) [TMDB: ★ ${movie.rating}/10, Votes: ${movie.voteCount}]`);
      const torrents = await this.searchMovieTorrents(movie.title, options);

      if (torrents.length === 0) {
        this.log(`⚠️ No torrents found for "${movie.title}". Skipping.`, 'warn');
        skipped.push({ title: movie.title, reason: 'No torrents' });
        continue;
      }

      const best = torrents[0];
      this.log(`✓ Best match: "${best.name}" [Score: ${best.rankScore}, Quality: ${best.qualityBadge}, Seeds: ${best.seeders}]`, 'success');

      const res = await Downloader.startDownload(movie.title, best, options);
      downloads.push({
        movieTitle: movie.title,
        torrent: best,
        record: res.record
      });
    }

    this.log('====================================================');
    this.log(`🎉 Cycle complete! Downloaded ${downloads.length} movies. Skipped ${skipped.length}.`, 'success');
    this.log('====================================================');

    return {
      totalMoviesFound: moviesToProcess.length,
      downloaded: downloads,
      skipped
    };
  }

  async run(options = {}) {
    return this.execute(options);
  }
}
