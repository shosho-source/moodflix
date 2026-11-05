/**
 * CineBay - Search interface for The Cine Bay and torrent sources.
 * Integrates apibay.org JSON API, Torrentio (1337x, RARBG, YTS, ThePirateBay, TorrentGalaxy, EZTV),
 * Internet Archive (archive.org), and multi-source fallbacks.
 */

import crypto from 'crypto';
import { Ranker } from './ranker.js';
import { NameCleaner } from './nameCleaner.js';
import { TMDB } from './tmdb.js';
import { FuzzyMatcher } from './fuzzyMatcher.js';

export class CineBay {
  static API_URL = 'https://apibay.org/q.php';
  static imdbCache = new Map();

  static DEFAULT_TRACKERS = [
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://open.stealth.si:80/announce',
    'udp://tracker.torrent.eu.org:451/announce',
    'udp://tracker.bittor.pw:1337/announce',
    'udp://public.popcorn-tracker.org:6969/announce',
    'udp://tracker.dler.org:6969/announce',
    'udp://exodus.desync.com:6969/announce',
    'udp://open.demonii.com:1337/announce',
    'udp://open.tracker.cl:1337/announce',
    'udp://tracker.moeking.me:6969/announce',
    'udp://glotorrents.pw:6969/announce',
    'udp://torrent.gresille.org:80/announce',
    'udp://tracker.openbittorrent.com:80/announce',
    'udp://tracker.coppersurfer.tk:6969/announce',
    'udp://tracker.leechers-paradise.org:6969/announce',
    'udp://p4p.arenabg.ch:1337/announce',
    'udp://tracker.internetwarriors.net:1337/announce',
    'https://tracker.moeblog.cn:443/announce',
    'udp://open.dstud.io:6969/announce',
    'udp://tracker.srv00.com:6969/announce',
    'https://tracker.zhuqiy.com:443/announce',
    'https://tracker.pmman.tech:443/announce'
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
   * @param {object} options Filter options (category, minSeeds, imdbId, season, episode, tmdbId, type, isSeasonPack)
   */
  static async search(query, options = {}) {
    const rawQuery = (query || '').trim();
    if (!rawQuery) return [];

    let isTv = options.category === '205' || options.type === 'tv';
    let season = options.season;
    let episode = options.episode;

    if (!season) {
      const sMatch = rawQuery.match(/S(\d+)(?!E\d+)/i) || rawQuery.match(/Season\s*(\d+)/i);
      if (sMatch) {
        season = parseInt(sMatch[1], 10);
      }
    }

    if (isTv && season && !episode && (options.isSeasonPack || options.seasonPack || /season\s*\d+|s\d+\b|complete|batch/i.test(rawQuery))) {
      options.isSeasonPack = true;
      options.seasonPack = true;
      options.season = season;
    }

    const category = options.category || (isTv ? '205' : '200'); // 200 = Video / Movies, 205 = TV
    const minSeeds = options.minSeeds || 0;

    // 1. Run Torrentio + Apibay + YTS.GG + Internet Archive queries in parallel
    const [torrentioResults, apibayResults, ytsResults, archiveResults] = await Promise.all([
      CineBay.queryTorrentio(rawQuery, options),
      CineBay.queryApibay(rawQuery, category, options),
      CineBay.queryYts(rawQuery, options),
      CineBay.queryInternetArchive(rawQuery, category, options)
    ]);

    const seenHashes = new Set();
    let torrents = [];

    for (const t of [...ytsResults, ...torrentioResults, ...apibayResults, ...archiveResults]) {
      const hash = (t.infoHash || t.id || '').toLowerCase();
      if (hash && !seenHashes.has(hash)) {
        seenHashes.add(hash);
        torrents.push(t);
      }
    }

    // 2. If no results, try clean title (without year, punctuation, release tags)
    if (torrents.length === 0) {
      const cleanTitle = NameCleaner.clean(rawQuery);
      if (cleanTitle && cleanTitle.toLowerCase() !== rawQuery.toLowerCase()) {
        const [cleanTorrentio, cleanApibay, cleanYts, cleanArchive] = await Promise.all([
          CineBay.queryTorrentio(cleanTitle, options),
          CineBay.queryApibay(cleanTitle, category, options),
          CineBay.queryYts(cleanTitle, options),
          CineBay.queryInternetArchive(cleanTitle, category, options)
        ]);
        for (const t of [...cleanYts, ...cleanTorrentio, ...cleanApibay, ...cleanArchive]) {
          const hash = (t.infoHash || t.id || '').toLowerCase();
          if (hash && !seenHashes.has(hash)) {
            seenHashes.add(hash);
            torrents.push(t);
          }
        }
      }
    }

    // 2b. If still no results, strip colons, hyphens, and subtitles (e.g. "Mission: Impossible - Dead Reckoning Part One" -> "Mission Impossible Dead Reckoning")
    if (torrents.length === 0) {
      const simplified = rawQuery.replace(/[:\-–—]/g, ' ').replace(/\s+/g, ' ').trim();
      if (simplified && simplified.toLowerCase() !== rawQuery.toLowerCase()) {
        const [simTorrentio, simApibay, simYts, simArchive] = await Promise.all([
          CineBay.queryTorrentio(simplified, options),
          CineBay.queryApibay(simplified, category, options),
          CineBay.queryYts(simplified, options),
          CineBay.queryInternetArchive(simplified, category, options)
        ]);
        for (const t of [...simYts, ...simTorrentio, ...simApibay, ...simArchive]) {
          const hash = (t.infoHash || t.id || '').toLowerCase();
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
        const ytsTorrents = await CineBay.queryYts(rawQuery, options);
        for (const t of ytsTorrents) {
          const hash = (t.infoHash || '').toLowerCase();
          if (hash && !seenHashes.has(hash)) {
            seenHashes.add(hash);
            torrents.push(t);
          }
        }
      } catch (err) {}
    }

    // 4. Typo tolerance: If still 0 results, suggest spelling correction and search again
    if (torrents.length === 0) {
      try {
        const corrected = await FuzzyMatcher.suggestCorrection(rawQuery);
        if (corrected && corrected.toLowerCase() !== rawQuery.toLowerCase()) {
          const [typoTorrentio, typoApibay, typoYts, typoArchive] = await Promise.all([
            CineBay.queryTorrentio(corrected, options),
            CineBay.queryApibay(corrected, category, options),
            CineBay.queryYts(corrected, options),
            CineBay.queryInternetArchive(corrected, category, options)
          ]);
          for (const t of [...typoYts, ...typoTorrentio, ...typoApibay, ...typoArchive]) {
            const hash = (t.infoHash || t.id || '').toLowerCase();
            if (hash && !seenHashes.has(hash)) {
              seenHashes.add(hash);
              torrents.push(t);
            }
          }
        }
      } catch (e) {}
    }

    // Filter out executable and fake malware torrents (.exe, .scr, .bat, etc.)
    torrents = torrents.filter(t => !CineBay.isExecutableOrMalicious(t.name));

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
   * Checks whether a torrent release name is an executable or malware file
   */
  static isExecutableOrMalicious(name) {
    if (!name || typeof name !== 'string') return true;
    const lower = name.toLowerCase().trim();
    return /\.(exe|scr|bat|cmd|msi|vbs|pif|com|jar|lnk|cpl)$/i.test(lower) ||
           /\b(setup\.exe|install\.exe|installer\.exe|codec\.exe|crack\.exe|patch\.exe|keygens?\.exe)\b/i.test(lower);
  }

  /**
   * Checks if a torrent name represents a full season pack, batch, or multi-season release for a given season.
   */
  static isSeasonPackName(name, season = 1) {
    if (!name || typeof name !== 'string') return false;
    const sNum = parseInt(season, 10) || 1;
    const lower = name.toLowerCase();

    // Multi-season packs (e.g. S01-S05, Seasons 1-4, All Seasons, Complete Series)
    const multiMatch = lower.match(/s(\d+)\s*[-–—]\s*s?(\d+)/i) || lower.match(/seasons?\s*(\d+)\s*[-–—]\s*(\d+)/i);
    if (multiMatch) {
      const startS = parseInt(multiMatch[1], 10);
      const endS = parseInt(multiMatch[2], 10);
      if (sNum >= startS && sNum <= endS) return true;
      return false;
    }
    if (/\b(all\s*seasons|complete\s*(series|collection))\b/i.test(lower)) {
      return true;
    }

    // Exclude releases specifying a different single season (e.g. 'Season 2' when sNum is 1)
    const otherSeasonRegex = new RegExp('(?:season\\s*0*(?!' + sNum + '\\b)\\d+|s0*(?!' + sNum + '\\b)\\d+(?:\\b|[^e0-9]))', 'i');
    if (otherSeasonRegex.test(lower) && !new RegExp('s0*' + sNum + '|season\\s*0*' + sNum, 'i').test(lower)) {
      return false;
    }

    // Exclude single episode releases of another episode number (e.g. S01E05 without batch / complete tags)
    const singleOtherEpRegex = new RegExp('s0*' + sNum + '\\s*e(?!0*1[\\b\\-])\\d+', 'i');
    if (singleOtherEpRegex.test(lower) && !/(complete|batch|pack|\b0*1\s*[-~]\s*\d+\b)/i.test(lower)) {
      return false;
    }

    // Match season patterns: Season 1, S01, 1st Season, Complete, Batch, Collection, or full episode range (e.g. 01-25)
    const seasonRegex = new RegExp('(\\b|[^a-z0-9])(season\\s*0*' + sNum + '\\b|s0*' + sNum + '(\\b|[^e0-9])|' + sNum + '(st|nd|rd|th)\\s*season|complete|batch|collection|\\b0*1\\s*[-~]\\s*\\d+\\b)', 'i');
    return seasonRegex.test(lower);
  }

  /**
   * Search for whole season packs / complete series anime batches
   * @param {string} query Show or anime title
   * @param {number} season Season number (defaults to 1)
   * @param {object} options Extra options (imdbId, tmdbId, minSeeds)
   */
  static async searchSeasonPack(query, season = 1, options = {}) {
    const sNum = parseInt(season, 10) || 1;
    return CineBay.search(query, {
      ...options,
      season: sNum,
      isSeasonPack: true,
      seasonPack: true,
      type: 'tv',
      category: '205'
    });
  }

  /**
   * Queries Torrentio API (combines 1337x, YTS, ThePirateBay, RARBG, TorrentGalaxy, EZTV, Nyaa)
   */
  static async queryTorrentio(query, options = {}) {
    try {
      let imdbId = options.imdbId;
      let isTv = options.category === '205' || options.type === 'tv';
      let season = options.season;
      let episode = options.episode;
      const isSeasonPackQuery = Boolean(options.isSeasonPack || options.seasonPack);

      // Extract season and episode from query if present (e.g. S01E01, 1x01, Season 1 Episode 2)
      if (!season || !episode) {
        const seMatch = query.match(/S(\d+)E(\d+)/i) || query.match(/(\d+)x(\d+)/i) || query.match(/Season\s*(\d+).*?Episode\s*(\d+)/i);
        if (seMatch) {
          isTv = true;
          season = parseInt(seMatch[1], 10);
          episode = parseInt(seMatch[2], 10);
        }
      }

      if (!imdbId) {
        imdbId = await CineBay.lookupImdbId(query, isTv ? 'tv' : 'movie', options);
      }

      if (!imdbId) return [];

      const targetSeason = season ? parseInt(season, 10) : 1;
      const urls = [];
      if (isTv) {
        if (isSeasonPackQuery) {
          urls.push(`https://torrentio.strem.fun/stream/series/${imdbId}:${targetSeason}:1.json`);
          if (targetSeason === 1) {
            urls.push(`https://torrentio.strem.fun/stream/series/${imdbId}:1:2.json`);
          }
        } else if (season && episode) {
          urls.push(`https://torrentio.strem.fun/stream/series/${imdbId}:${season}:${episode}.json`);
        } else {
          // If no specific episode requested, query Season 1 Episode 1 and movie stream (for specials/miniseries)
          urls.push(`https://torrentio.strem.fun/stream/series/${imdbId}:1:1.json`);
          urls.push(`https://torrentio.strem.fun/stream/movie/${imdbId}.json`);
        }
      } else {
        urls.push(`https://torrentio.strem.fun/stream/movie/${imdbId}.json`);
      }

      const allStreams = [];
      await Promise.all(urls.map(async url => {
        try {
          const res = await fetch(url, {
            signal: AbortSignal.timeout(6000),
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TheMovieCine/2.0' }
          });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.streams)) {
              allStreams.push(...data.streams);
            }
          }
        } catch (e) {}
      }));

      const seenStreamHashes = new Set();
      const results = [];

      for (const s of allStreams) {
        if (!s.infoHash || seenStreamHashes.has(s.infoHash)) continue;

        const lines = (s.title || '').split('\n');
        const rawName = isSeasonPackQuery
          ? (lines[0] || s.behaviorHints?.filename || query)
          : (s.behaviorHints?.filename || lines[0] || query);

        if (isSeasonPackQuery && !CineBay.isSeasonPackName(rawName, targetSeason)) {
          continue;
        }

        seenStreamHashes.add(s.infoHash);

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

        const isPack = isSeasonPackQuery || CineBay.isSeasonPackName(rawName, season || 1);
        const magnet = CineBay.buildMagnet(s.infoHash, rawName);
        results.push({
          id: s.infoHash,
          name: rawName,
          infoHash: s.infoHash,
          seeders: seeds,
          leechers: Math.max(1, Math.round(seeds * 0.2)),
          size: sizeBytes,
          sizeFormatted,
          added: new Date().toISOString(),
          status: 'trusted',
          username: 'Torrentio',
          category: isTv ? '205' : '200',
          imdb: imdbId,
          magnet,
          source: 'Torrentio',
          isSeasonPack: isPack,
          season: isPack ? targetSeason : undefined
        });
      }

      return results;
    } catch (e) {
      return [];
    }
  }

  /**
   * Looks up IMDB ID via Instant IMDB CDN suggestions, TMDB, or fuzzy matching
   */
  static async lookupImdbId(query, type = 'movie', options = {}) {
    if (options.imdbId && /^tt\d+$/i.test(options.imdbId.trim())) {
      return options.imdbId.trim();
    }
    if (/^tt\d+$/i.test(query.trim())) {
      return query.trim();
    }

    const cacheKey = `${query.toLowerCase().trim()}_${type}`;
    if (CineBay.imdbCache.has(cacheKey)) {
      return CineBay.imdbCache.get(cacheKey);
    }

    // Strip episode tags and release metadata for clean title lookup
    let cleanQuery = query
      .replace(/S\d+E\d+/gi, ' ')
      .replace(/\d+x\d+/gi, ' ')
      .replace(/Season\s*\d+/gi, ' ')
      .replace(/Episode\s*\d+/gi, ' ')
      .replace(/\b(1080p|720p|4k|2160p|bluray|web-dl|x264|x265|hevc|h264|h265)\b/gi, ' ')
      .trim();

    const cleanTitle = NameCleaner.clean(cleanQuery) || cleanQuery;

    // 1. Direct IMDB Suggestions CDN API (ultra fast, highly accurate, global availability)
    const cleanSlug = cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (cleanSlug) {
      try {
        const imdbSuggestUrl = `https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(cleanSlug)}.json`;
        const res = await fetch(imdbSuggestUrl, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const json = await res.json();
          const targetQid = type === 'tv' ? 'tvSeries' : 'movie';
          const match = (json.d || []).find(item => item.id?.startsWith('tt') && (item.qid === targetQid || !item.qid))
                     || (json.d || []).find(item => item.id?.startsWith('tt'));
          if (match?.id) {
            CineBay.imdbCache.set(cacheKey, match.id);
            return match.id;
          }
        }
      } catch (e) {}
    }

    // 2. Direct TMDB ID if provided in options
    if (options.tmdbId) {
      try {
        const { headers, queryParams } = TMDB.getAuthHeadersAndParams();
        const extUrl = `${TMDB.BASE_URL}/${type}/${options.tmdbId}/external_ids?${queryParams.toString()}`;
        const extRes = await fetch(extUrl, { headers, signal: AbortSignal.timeout(3500) });
        if (extRes.ok) {
          const extData = await extRes.json();
          if (extData.imdb_id) {
            CineBay.imdbCache.set(cacheKey, extData.imdb_id);
            return extData.imdb_id;
          }
        }
      } catch (e) {}
    }

    // 3. TMDB Live Search Fallback
    try {
      const { headers, queryParams } = TMDB.getAuthHeadersAndParams();
      const p1 = new URLSearchParams(queryParams);
      p1.set('query', cleanTitle);
      const searchUrl = `${TMDB.BASE_URL}/search/${type}?${p1.toString()}`;
      const searchRes = await fetch(searchUrl, { headers, signal: AbortSignal.timeout(3500) });
      const searchData = searchRes.ok ? await searchRes.json() : null;
      let media = searchData?.results?.[0];

      if (!media || !media.id) {
        const altType = type === 'tv' ? 'movie' : 'tv';
        const p2 = new URLSearchParams(queryParams);
        p2.set('query', cleanTitle);
        const altUrl = `${TMDB.BASE_URL}/search/${altType}?${p2.toString()}`;
        const altRes = await fetch(altUrl, { headers, signal: AbortSignal.timeout(3500) });
        const altData = altRes.ok ? await altRes.json() : null;
        media = altData?.results?.[0];
        if (media) type = altType;
      }

      if (media && media.id) {
        const p3 = new URLSearchParams(queryParams);
        const extUrl = `${TMDB.BASE_URL}/${type}/${media.id}/external_ids?${p3.toString()}`;
        const extRes = await fetch(extUrl, { headers, signal: AbortSignal.timeout(3500) });
        if (extRes.ok) {
          const extData = await extRes.json();
          if (extData.imdb_id) {
            CineBay.imdbCache.set(cacheKey, extData.imdb_id);
            return extData.imdb_id;
          }
        }
      }
    } catch (e) {}

    return null;
  }

  /**
   * Queries Internet Archive (archive.org) for public domain movies, classic series, and releases
   */
  static async queryInternetArchive(term, category = '200', options = {}) {
    try {
      const isSeasonPackQuery = Boolean(options.isSeasonPack || options.seasonPack);
      const targetSeason = options.season ? parseInt(options.season, 10) : 1;
      let clean = term.replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim();
      if (!clean || clean.length < 2) return [];

      if (isSeasonPackQuery) {
        clean = `${clean} Season ${targetSeason}`;
      }

      const mediaFilter = category === '205' ? '(movies OR television)' : '(movies)';
      const url = `https://archive.org/advancedsearch.php?q=title%3A(${encodeURIComponent(clean)})+AND+mediatype%3A${mediaFilter}&fl[]=identifier,title,year,downloads,item_size&sort[]=downloads+desc&rows=15&page=1&output=json`;
      
      const res = await fetch(url, { signal: AbortSignal.timeout(4500) });
      if (!res.ok) return [];

      const text = await res.text();
      if (!text || text.trim().startsWith('<')) return [];
      const data = JSON.parse(text);
      const docs = data.response?.docs || [];

      const results = docs.map(d => {
        const titleStr = `${d.title || clean}${d.year ? ` (${d.year})` : ''} [Internet Archive]`;
        const sizeBytes = parseInt(d.item_size || 0, 10);
        const sizeFormatted = sizeBytes > 1073741824
          ? `${(sizeBytes / 1073741824).toFixed(1)} GB`
          : `${(sizeBytes / 1048576).toFixed(1)} MB`;
        const seeders = Math.max(12, Math.min(150, Math.round((d.downloads || 500) / 1000)));

        const infoHash = /^[a-fA-F0-9]{40}$/.test(d.identifier)
          ? d.identifier.toLowerCase()
          : crypto.createHash('sha1').update('ia:' + d.identifier).digest('hex');

        const magnet = `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(titleStr)}&tr=${CineBay.DEFAULT_TRACKERS.map(encodeURIComponent).join('&tr=')}`;
        const torrentUrl = `https://archive.org/download/${d.identifier}/${d.identifier}_archive.torrent`;

        const isPack = isSeasonPackQuery || CineBay.isSeasonPackName(titleStr, targetSeason);
        return {
          id: d.identifier,
          name: titleStr,
          infoHash,
          seeders,
          leechers: Math.max(1, Math.round(seeders * 0.15)),
          size: sizeBytes,
          sizeFormatted,
          added: d.year ? `${d.year}-01-01T00:00:00Z` : new Date().toISOString(),
          status: 'trusted',
          username: 'InternetArchive',
          category: category === '205' ? '205' : '200',
          magnet,
          torrentUrl,
          source: 'InternetArchive',
          isSeasonPack: isPack,
          season: isPack ? targetSeason : undefined
        };
      });

      if (isSeasonPackQuery) {
        return results.filter(r => CineBay.isSeasonPackName(r.name, targetSeason));
      }
      return results;
    } catch (e) {
      return [];
    }
  }

  /**
   * Queries ThePirateBay / Apibay with multiple mirror failover and safe HTML/JSON parsing
   */
  static async queryApibay(term, category = '200', options = {}) {
    const mirrors = [
      'https://apibay.org/q.php',
      'https://thepiratebay0.org/q.php',
      'https://pirateproxy.live/q.php'
    ];
    const catParam = category === 'all' ? '0' : category;
    const isSeasonPackQuery = Boolean(options.isSeasonPack || options.seasonPack);
    const targetSeason = options.season ? parseInt(options.season, 10) : 1;

    const termsToQuery = [term];
    if (isSeasonPackQuery) {
      const cleanTerm = term.replace(/s\d+/gi, '').replace(/season\s*\d+/gi, '').trim();
      const padSeason = String(targetSeason).padStart(2, '0');
      termsToQuery.unshift(`${cleanTerm} S${padSeason}`);
      termsToQuery.push(`${cleanTerm} Season ${targetSeason}`);
    }

    const allItems = [];
    const seenHashes = new Set();

    for (const qTerm of termsToQuery) {
      for (const mirror of mirrors) {
        try {
          const url = `${mirror}?q=${encodeURIComponent(qTerm)}&cat=${catParam}`;
          const res = await fetch(url, {
            signal: AbortSignal.timeout(4500),
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
          });

          if (res.ok) {
            const text = await res.text();
            if (!text || text.trim().startsWith('<')) continue;
            const data = JSON.parse(text);

            if (Array.isArray(data) && data.length > 0 && data[0].id !== '0' && data[0].name !== 'No results returned') {
              for (const item of data) {
                if (item.info_hash && !seenHashes.has(item.info_hash.toLowerCase())) {
                  seenHashes.add(item.info_hash.toLowerCase());
                  allItems.push(item);
                }
              }
              break; // Mirror succeeded for this term
            }
          }
        } catch (err) {}
      }
    }

    if (allItems.length > 0) {
      const mapped = allItems.map(item => {
        const magnet = CineBay.buildMagnet(item.info_hash, item.name);
        const isPack = isSeasonPackQuery || CineBay.isSeasonPackName(item.name, targetSeason);
        return {
          id: item.id,
          name: item.name,
          infoHash: item.info_hash,
          seeders: parseInt(item.seeders || 0, 10),
          leechers: parseInt(item.leechers || 0, 10),
          size: parseInt(item.size || 0, 10),
          added: item.added ? new Date(parseInt(item.added, 10) * 1000).toISOString() : null,
          status: item.status || 'member',
          username: item.username || 'ThePirateBay',
          category: item.category,
          imdb: item.imdb || null,
          magnet,
          source: 'ThePirateBay',
          isSeasonPack: isPack,
          season: isPack ? targetSeason : undefined
        };
      });

      if (isSeasonPackQuery) {
        return mapped.filter(r => CineBay.isSeasonPackName(r.name, targetSeason));
      }
      return mapped;
    }

    // Fallback: If category search returned nothing and category was not 0, try universal category 0
    if (catParam !== '0') {
      try {
        const url = `https://apibay.org/q.php?q=${encodeURIComponent(term)}&cat=0`;
        const res = await fetch(url, {
          signal: AbortSignal.timeout(4500),
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });

        if (res.ok) {
          const text = await res.text();
          if (text && !text.trim().startsWith('<')) {
            const fbData = JSON.parse(text);
            if (Array.isArray(fbData) && fbData.length > 0 && fbData[0].id !== '0' && fbData[0].name !== 'No results returned') {
              const mapped = fbData.map(item => {
                const magnet = CineBay.buildMagnet(item.info_hash, item.name);
                const isPack = isSeasonPackQuery || CineBay.isSeasonPackName(item.name, targetSeason);
                return {
                  id: item.id,
                  name: item.name,
                  infoHash: item.info_hash,
                  seeders: parseInt(item.seeders || 0, 10),
                  leechers: parseInt(item.leechers || 0, 10),
                  size: parseInt(item.size || 0, 10),
                  added: item.added ? new Date(parseInt(item.added, 10) * 1000).toISOString() : null,
                  status: item.status || 'member',
                  username: item.username || 'ThePirateBay',
                  category: item.category,
                  imdb: item.imdb || null,
                  magnet,
                  source: 'ThePirateBay',
                  isSeasonPack: isPack,
                  season: isPack ? targetSeason : undefined
                };
              });

              if (isSeasonPackQuery) {
                return mapped.filter(r => CineBay.isSeasonPackName(r.name, targetSeason));
              }
              return mapped;
            }
          }
        }
      } catch (e) {}
    }

    return [];
  }

  /**
   * Search official YTS.GG API and mirror swarms (https://yts.gg/api)
   * Official Base URL: https://movies-api.accel.li/api/v2/
   * Mirrors: https://yts.gg/api/v2/, https://yts.mx/api/v2/, https://yts.lt/api/v2/
   * Returns verified movie torrents with full metadata (resolution, codec, channels, size, seeders, magnet, direct .torrent)
   */
  static async queryYts(query, options = {}) {
    try {
      // YTS indexes movies; skip pure TV series requests
      if (options.category === '205' || options.type === 'tv') {
        return [];
      }

      const endpoints = [
        'https://movies-api.accel.li/api/v2/list_movies.json',
        'https://yts.gg/api/v2/list_movies.json',
        'https://yts.mx/api/v2/list_movies.json',
        'https://yts.lt/api/v2/list_movies.json'
      ];

      let imdbId = options.imdbId;
      if (!imdbId && /^tt\d+$/i.test((query || '').trim())) {
        imdbId = query.trim();
      }

      const searchTerms = [];
      if (imdbId) {
        searchTerms.push(imdbId);
      }

      const cleanQuery = (query || '')
        .replace(/\b(1080p|720p|4k|2160p|bluray|web-dl|x264|x265|hevc|h264|h265)\b/gi, ' ')
        .replace(/[:\-–—]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (cleanQuery && cleanQuery !== imdbId) {
        searchTerms.push(cleanQuery);
      }

      if (searchTerms.length === 0) return [];

      const seenTorHashes = new Set();
      const results = [];

      for (const term of searchTerms) {
        for (const base of endpoints) {
          try {
            const url = `${base}?query_term=${encodeURIComponent(term)}&limit=20&with_rt_ratings=true`;
            const res = await fetch(url, {
              signal: AbortSignal.timeout(4000),
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TheMovieCine/2.0' }
            });

            if (res.ok) {
              const text = await res.text();
              if (!text || text.trim().startsWith('<')) continue;
              const json = JSON.parse(text);
              const movies = json?.data?.movies;
              if (Array.isArray(movies) && movies.length > 0) {
                for (const movie of movies) {
                  // If searching by imdbId, ensure movie matches
                  if (imdbId && movie.imdb_code && movie.imdb_code !== imdbId && movies.length > 1) {
                    continue;
                  }

                  const movieTorrents = movie.torrents || [];
                  for (const tor of movieTorrents) {
                    const hash = (tor.hash || '').toLowerCase();
                    if (!hash || seenTorHashes.has(hash)) continue;
                    seenTorHashes.add(hash);

                    const quality = tor.quality || '1080p';
                    const relType = tor.type || 'bluray';
                    const videoCodec = (tor.video_codec || (quality.includes('x265') ? 'x265' : 'x264')).toLowerCase();
                    const audioChannels = tor.audio_channels || (quality === '2160p' ? '5.1' : '2.0');
                    const bitDepth = tor.bit_depth ? String(tor.bit_depth) : (quality === '2160p' ? '10' : '8');

                    const name = `${movie.title} (${movie.year}) [${quality}] [${relType.toUpperCase()}] [${videoCodec.toUpperCase()}] [${audioChannels} Ch] [YTS.GG]`;
                    const magnet = CineBay.buildMagnet(hash, name);
                    const torrentUrl = tor.url || `https://yts.gg/torrent/download/${hash.toUpperCase()}`;
                    const sizeBytes = parseInt(tor.size_bytes || 0, 10);
                    const sizeFormatted = tor.size || Ranker.formatBytes(sizeBytes);
                    const dateAdded = tor.date_uploaded || (tor.date_uploaded_unix ? new Date(tor.date_uploaded_unix * 1000).toISOString() : new Date().toISOString());

                    results.push({
                      id: hash,
                      name,
                      infoHash: hash,
                      seeders: parseInt(tor.seeds || 0, 10),
                      leechers: parseInt(tor.peers || 0, 10),
                      size: sizeBytes,
                      sizeFormatted,
                      added: dateAdded,
                      status: 'trusted',
                      username: 'YTS.GG',
                      category: '200',
                      imdb: movie.imdb_code || imdbId || null,
                      magnet,
                      torrentUrl,
                      source: 'YTS.GG',
                      qualityBadge: quality,
                      releaseType: relType.toLowerCase(),
                      videoCodec,
                      bitDepth,
                      audioChannels,
                      dateUploadedUnix: tor.date_uploaded_unix || 0
                    });
                  }
                }
                if (results.length > 0) return results;
              }
            }
          } catch (e) {
            // Failover to next mirror
          }
        }
      }

      if (results.length === 0 && imdbId) {
        const detailBases = [
          'https://movies-api.accel.li/api/v2/movie_details.json',
          'https://yts.gg/api/v2/movie_details.json',
          'https://yts.mx/api/v2/movie_details.json'
        ];
        for (const detailUrl of detailBases) {
          try {
            const res = await fetch(`${detailUrl}?imdb_id=${encodeURIComponent(imdbId)}&with_cast=true`, {
              signal: AbortSignal.timeout(3500),
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TheMovieCine/2.0' }
            });
            if (res.ok) {
              const text = await res.text();
              if (!text || text.trim().startsWith('<')) continue;
              const json = JSON.parse(text);
              const movie = json?.data?.movie;
              if (movie && Array.isArray(movie.torrents)) {
                for (const tor of movie.torrents) {
                  const hash = (tor.hash || '').toLowerCase();
                  if (!hash || seenTorHashes.has(hash)) continue;
                  seenTorHashes.add(hash);

                  const quality = tor.quality || '1080p';
                  const relType = tor.type || 'bluray';
                  const videoCodec = (tor.video_codec || (quality.includes('x265') ? 'x265' : 'x264')).toLowerCase();
                  const audioChannels = tor.audio_channels || (quality === '2160p' ? '5.1' : '2.0');
                  const bitDepth = tor.bit_depth ? String(tor.bit_depth) : (quality === '2160p' ? '10' : '8');

                  const name = `${movie.title} (${movie.year}) [${quality}] [${relType.toUpperCase()}] [${videoCodec.toUpperCase()}] [${audioChannels} Ch] [YTS.GG]`;
                  const magnet = CineBay.buildMagnet(hash, name);
                  const torrentUrl = tor.url || `https://yts.gg/torrent/download/${hash.toUpperCase()}`;
                  const sizeBytes = parseInt(tor.size_bytes || 0, 10);
                  const sizeFormatted = tor.size || Ranker.formatBytes(sizeBytes);
                  const dateAdded = tor.date_uploaded || (tor.date_uploaded_unix ? new Date(tor.date_uploaded_unix * 1000).toISOString() : new Date().toISOString());

                  results.push({
                    id: hash,
                    name,
                    infoHash: hash,
                    seeders: parseInt(tor.seeds || 0, 10),
                    leechers: parseInt(tor.peers || 0, 10),
                    size: sizeBytes,
                    sizeFormatted,
                    added: dateAdded,
                    status: 'trusted',
                    username: 'YTS.GG',
                    category: '200',
                    imdb: movie.imdb_code || imdbId || null,
                    magnet,
                    torrentUrl,
                    source: 'YTS.GG',
                    qualityBadge: quality,
                    releaseType: relType.toLowerCase(),
                    videoCodec,
                    bitDepth,
                    audioChannels,
                    dateUploadedUnix: tor.date_uploaded_unix || 0
                  });
                }
                if (results.length > 0) return results;
              }
            }
          } catch (e) {}
        }
      }

      return results;
    } catch (e) {
      return [];
    }
  }

  /**
   * Fallback search querying YTS movie index
   */
  static async searchYtsFallback(query, options = {}) {
    return CineBay.queryYts(query, options);
  }
}
