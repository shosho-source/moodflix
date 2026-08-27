/**
 * CineBay - Search interface for The Cine Bay and torrent sources.
 * Integrates apibay.org JSON API, magnet link generators, and multi-source fallbacks.
 */

import { Ranker } from './ranker.js';
import { NameCleaner } from './nameCleaner.js';

export class CineBay {
  static API_URL = 'https://apibay.org/q.php';
  static DEFAULT_TRACKERS = [
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://open.stealth.si:80/announce',
    'udp://tracker.torrent.eu.org:451/announce',
    'udp://tracker.bittor.pw:1337/announce',
    'udp://public.popcorn-tracker.org:6969/announce',
    'udp://tracker.dler.org:6969/announce',
    'udp://exodus.desync.com:6969',
    'udp://open.demonii.com:1337/announce'
  ];

  /**
   * Build standard BitTorrent magnet link from info_hash and title
   */
  static buildMagnet(infoHash, name, customTrackers = []) {
    const trackers = [...CineBay.DEFAULT_TRACKERS, ...customTrackers];
    const trackerParams = trackers.map(tr => `&tr=${encodeURIComponent(tr)}`).join('');
    return `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(name)}${trackerParams}`;
  }

  /**
   * Search The Cine Bay for a movie title with fallbacks and quality ranking
   * @param {string} query Search terms (e.g. "Inception 2010", "Gladiator")
   * @param {object} options Filter options (category, minSeeds)
   */
  static async search(query, options = {}) {
    const rawQuery = (query || '').trim();
    if (!rawQuery) return [];

    const category = options.category || '200'; // 200 = Video / Movies
    const minSeeds = options.minSeeds || 0;

    let torrents = [];

    // 1. Direct search on TPB
    torrents = await CineBay.queryApibay(rawQuery, category);

    // 2. If no results, try clean title (without year or punctuation)
    if (torrents.length === 0) {
      const cleanTitle = NameCleaner.clean(rawQuery);
      if (cleanTitle && cleanTitle !== rawQuery) {
        torrents = await CineBay.queryApibay(cleanTitle, category);
      }
    }

    // 3. Fallback: YTS API if TPB returned no results
    if (torrents.length === 0) {
      try {
        const ytsTorrents = await CineBay.searchYtsFallback(rawQuery);
        if (ytsTorrents.length > 0) {
          torrents = ytsTorrents;
        }
      } catch (err) {
        // Fallback error ignored
      }
    }

    // Filter by minimum seeds
    if (minSeeds > 0) {
      torrents = torrents.filter(t => t.seeders >= minSeeds);
    }

    // Rank and sort with relevance to the user's search query on top!
    return Ranker.rankTorrents(torrents, rawQuery);
  }

  /**
   * Queries apibay.org API for a single term
   */
  static async queryApibay(term, category = '200') {
    try {
      const url = `${CineBay.API_URL}?q=${encodeURIComponent(term)}&cat=${category}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'TheMovieCine/2.0 (Node.js)'
        }
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0 && data[0].id !== '0' && data[0].name !== 'No results returned') {
          return data.map(item => {
            const magnet = CineBay.buildMagnet(item.info_hash, item.name);
            return {
              id: item.id,
              name: item.name,
              infoHash: item.info_hash,
              seeders: parseInt(item.seeders || 0, 10),
              leechers: parseInt(item.leechers || 0, 10),
              size: parseInt(item.size || 0, 10),
              added: item.added ? new Date(parseInt(item.added, 10) * 1000).toISOString() : null,
              status: item.status || 'member',
              username: item.username || 'Anonymous',
              category: item.category,
              imdb: item.imdb || null,
              magnet,
              source: 'TheCineBay'
            };
          });
        }
      }
    } catch (err) {
      // Ignored
    }
    return [];
  }

  /**
   * Fallback search querying YTS movie index
   */
  static async searchYtsFallback(query) {
    const url = `https://yts.mx/api/v2/list_movies.json?query_term=${encodeURIComponent(query)}&limit=10`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) return [];
      const json = await res.json();
      const movies = json?.data?.movies || [];
      const results = [];

      for (const movie of movies) {
        const movieTorrents = movie.torrents || [];
        for (const tor of movieTorrents) {
          const name = `${movie.title} (${movie.year}) [${tor.quality}] [${tor.type || 'WEB'}] [YTS]`;
          const magnet = `magnet:?xt=urn:btih:${tor.hash}&dn=${encodeURIComponent(name)}&tr=${CineBay.DEFAULT_TRACKERS.map(encodeURIComponent).join('&tr=')}`;
          results.push({
            id: tor.hash,
            name,
            infoHash: tor.hash,
            seeders: parseInt(tor.seeds || 0, 10),
            leechers: parseInt(tor.peers || 0, 10),
            size: parseInt(tor.size_bytes || 0, 10),
            added: tor.date_uploaded,
            status: 'trusted',
            username: 'YTS',
            magnet,
            source: 'YTS'
          });
        }
      }
      return results;
    } catch (e) {
      return [];
    }
  }
}
