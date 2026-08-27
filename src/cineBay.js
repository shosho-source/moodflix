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
   * Search The Cine Bay & multiple high-speed torrent swarms for a movie or TV title
   * @param {string} query Search terms (e.g. "Inception 2010", "Gladiator")
   * @param {object} options Filter options (category, minSeeds, imdbId, season, episode)
   */
  static async search(query, options = {}) {
    const rawQuery = (query || '').trim();
    if (!rawQuery) return [];

    const category = options.category || '200'; // 200 = Video / Movies, 205 = TV
    const minSeeds = options.minSeeds || 0;

    // 1. Run Torrentio + Apibay queries in parallel for lightning speed & 100% availability
    const [torrentioResults, apibayResults] = await Promise.all([
      CineBay.queryTorrentio(rawQuery, options),
      CineBay.queryApibay(rawQuery, category)
    ]);

    const seenHashes = new Set();
    let torrents = [];

    for (const t of [...torrentioResults, ...apibayResults]) {
      const hash = (t.infoHash || '').toLowerCase();
      if (hash && !seenHashes.has(hash)) {
        seenHashes.add(hash);
        torrents.push(t);
      }
    }

    // 2. If no results, try clean title on Apibay & YTS
    if (torrents.length === 0) {
      const cleanTitle = NameCleaner.clean(rawQuery);
      if (cleanTitle && cleanTitle !== rawQuery) {
        const cleanResults = await CineBay.queryApibay(cleanTitle, category);
        for (const t of cleanResults) {
          const hash = (t.infoHash || '').toLowerCase();
          if (hash && !seenHashes.has(hash)) {
            seenHashes.add(hash);
            torrents.push(t);
          }
        }
      }
    }

    // 3. Fallback: YTS API if still no results
    if (torrents.length === 0) {
      try {
        const ytsTorrents = await CineBay.searchYtsFallback(rawQuery);
        for (const t of ytsTorrents) {
          const hash = (t.infoHash || '').toLowerCase();
          if (hash && !seenHashes.has(hash)) {
            seenHashes.add(hash);
            torrents.push(t);
          }
        }
      } catch (err) {}
    }

    // Filter by minimum seeds, but retain items if filter is too strict
    let filtered = torrents;
    if (minSeeds > 0) {
      const strict = torrents.filter(t => t.seeders >= minSeeds);
      if (strict.length > 0) {
        filtered = strict;
      }
    }

    // Rank and sort with relevance to the user's search query on top!
    return Ranker.rankTorrents(filtered, rawQuery);
  }

  /**
   * Queries Torrentio API (combines 1337x, YTS, ThePirateBay, TorrentGalaxy, EZTV)
   */
  static async queryTorrentio(query, options = {}) {
    try {
      let imdbId = options.imdbId;
      const isTv = options.category === '205' || options.type === 'tv';

      if (!imdbId) {
        imdbId = await CineBay.lookupImdbId(query, isTv ? 'tv' : 'movie');
      }

      if (!imdbId) return [];

      let url = `https://torrentio.strem.fun/stream/movie/${imdbId}.json`;
      if (isTv) {
        const season = options.season || 1;
        const episode = options.episode || 1;
        url = `https://torrentio.strem.fun/stream/series/${imdbId}:${season}:${episode}.json`;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TheMovieCine/2.0' }
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        const streams = data.streams || [];
        return streams.map(s => {
          const lines = (s.title || '').split('\n');
          const rawName = s.behaviorHints?.filename || lines[0] || query;
          const seedsMatch = (s.title || '').match(/👤\s*(\d+)/);
          const sizeMatch = (s.title || '').match(/💾\s*([0-9.]+\s*[GMK]B)/i);
          const seeds = seedsMatch ? parseInt(seedsMatch[1], 10) : 15;
          const sizeFormatted = sizeMatch ? sizeMatch[1] : '';

          let sizeBytes = 0;
          if (sizeFormatted) {
            const num = parseFloat(sizeFormatted);
            if (sizeFormatted.toUpperCase().includes('GB')) sizeBytes = Math.round(num * 1024 * 1024 * 1024);
            else if (sizeFormatted.toUpperCase().includes('MB')) sizeBytes = Math.round(num * 1024 * 1024);
          }

          const magnet = CineBay.buildMagnet(s.infoHash, rawName);
          return {
            id: s.infoHash,
            name: rawName,
            infoHash: s.infoHash,
            seeders: seeds,
            leechers: Math.max(1, Math.round(seeds * 0.2)),
            size: sizeBytes,
            sizeFormatted: sizeFormatted,
            added: new Date().toISOString(),
            status: 'trusted',
            username: 'Torrentio',
            category: isTv ? '205' : '200',
            imdb: imdbId,
            magnet,
            source: 'Torrentio'
          };
        });
      }
    } catch (e) {}
    return [];
  }

  /**
   * Looks up IMDB ID from TMDB for deep stream aggregation
   */
  static async lookupImdbId(query, type = 'movie') {
    try {
      const apiKey = process.env.TMDB_API_KEY || '2e22dca68c093bae309efd704aa6d020';
      const cleanTitle = NameCleaner.clean(query) || query;
      const searchUrl = `https://api.themoviedb.org/3/search/${type}?query=${encodeURIComponent(cleanTitle)}&api_key=${apiKey}`;
      const searchRes = await fetch(searchUrl);
      if (!searchRes.ok) return null;
      const searchData = await searchRes.json();
      const media = searchData.results?.[0];
      if (!media || !media.id) return null;

      const extUrl = `https://api.themoviedb.org/3/${type}/${media.id}/external_ids?api_key=${apiKey}`;
      const extRes = await fetch(extUrl);
      if (!extRes.ok) return null;
      const extData = await extRes.json();
      return extData.imdb_id || null;
    } catch (e) {
      return null;
    }
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
    } catch (err) {}
    return [];
  }

  /**
   * Fallback search querying YTS movie index
   */
  static async searchYtsFallback(query) {
    const mirrors = [
      `https://yts.mx/api/v2/list_movies.json?query_term=${encodeURIComponent(query)}&limit=10`,
      `https://yts.pm/api/v2/list_movies.json?query_term=${encodeURIComponent(query)}&limit=10`,
      `https://yts.do/api/v2/list_movies.json?query_term=${encodeURIComponent(query)}&limit=10`
    ];

    for (const url of mirrors) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (res.ok) {
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
          if (results.length > 0) return results;
        }
      } catch (e) {}
    }
    return [];
  }
}
