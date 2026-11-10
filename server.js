/**
 * The Movie Cine - Web Dashboard Server (TMDB + The Cine Bay)
 * Features live Movies, TV Shows, and quality torrent rankings.
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { TMDB } from './src/tmdb.js';
import { CineBay } from './src/cineBay.js';
import { Downloader } from './src/downloader.js';
import { Storage } from './src/storage.js';
import { TheRottenCine } from './src/rottenCine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file into process.env if present
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (process.env[key] === undefined) {
            process.env[key] = val;
          }
        }
      }
    });
  }
} catch (e) {}

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting in-memory store
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 300;

app.use((req, res, next) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || (req.socket ? req.socket.remoteAddress : 'unknown');
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };
  if (now > entry.resetTime) {
    entry.count = 1;
    entry.resetTime = now + RATE_LIMIT_WINDOW_MS;
  } else {
    entry.count++;
  }
  rateLimitMap.set(ip, entry);
  if (entry.count > MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ success: false, error: 'Too many requests, please slow down.' });
  }
  next();
});

// CORS middleware
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Security headers including Content-Security-Policy
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' https: data: 'unsafe-inline' 'unsafe-eval'; frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com; img-src 'self' https: data: blob:;"
  );
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// High-Speed In-Memory Cache (10 minutes TTL) with LRU eviction and interval sweep
const apiCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

function getCached(key) {
  const item = apiCache.get(key);
  if (!item) return null;
  if (Date.now() - item.timestamp > CACHE_TTL_MS) {
    apiCache.delete(key);
    return null;
  }
  // Refresh access position for LRU
  apiCache.delete(key);
  apiCache.set(key, item);
  return item.data;
}

function setCached(key, data) {
  if (apiCache.has(key)) {
    apiCache.delete(key);
  } else if (apiCache.size >= 500) {
    // Evict least recently used (first inserted/accessed item)
    const oldestKey = apiCache.keys().next().value;
    if (oldestKey) apiCache.delete(oldestKey);
  }
  apiCache.set(key, { data, timestamp: Date.now() });
}

// Periodic cleanup sweep for expired cache & rate limiter entries
const cacheCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, item] of apiCache.entries()) {
    if (now - item.timestamp > CACHE_TTL_MS) {
      apiCache.delete(key);
    }
  }
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now > entry.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);
if (cacheCleanupTimer.unref) cacheCleanupTimer.unref();

// Supabase REST Helper
const getSupabaseConfig = () => {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '';
  return { url, key, isConfigured: Boolean(url && key) };
};

const verifySupabaseAuthToken = async (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  const { url, key, isConfigured } = getSupabaseConfig();
  if (!isConfigured || !token) return null;
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/user`, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${token}`
      }
    });
    if (res.ok) {
      const user = await res.json();
      return user;
    }
  } catch (e) {
    console.warn('[Supabase Auth Verification Error]', e.message);
  }
  return null;
};

// Guard function to ensure mutation caller owns target userId
const assertUserAuthorized = async (req, targetUserId) => {
  if (!targetUserId || targetUserId === 'guest') return true;
  const { isConfigured } = getSupabaseConfig();
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const authUser = await verifySupabaseAuthToken(req);
    if (!authUser || authUser.id !== targetUserId) {
      return false;
    }
    return true;
  }

  // When Supabase is configured and targeting a UUID user, require matching auth session
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(targetUserId));
  if (isConfigured && isUuid) {
    return false;
  }
  return true;
};

const supabaseFetch = async (endpoint, options = {}) => {
  const { url, key, isConfigured } = getSupabaseConfig();
  if (!isConfigured) return null;
  const fullUrl = `${url.replace(/\/$/, '')}/rest/v1/${endpoint.replace(/^\//, '')}`;
  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  try {
    const res = await fetch(fullUrl, { ...options, headers });
    return res;
  } catch (err) {
    console.warn('[Supabase API Error]', err.message);
    return null;
  }
};

// Public Legal Pages
app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});

app.get('/terms', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

// 0. Public Client Config (Supabase credentials from environment variables)
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || ''
  });
});

// 0.5 Rapid Search for Watchlist Rapid Title Entry
app.get('/api/media/rapid-search', async (req, res) => {
  try {
    const query = req.query.q || req.query.query || '';
    const type = req.query.type || 'all';
    if (!query.trim()) return res.json({ success: true, results: [] });

    const cacheKey = `rapid:${type}:${query.trim().toLowerCase()}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json({ success: true, results: cached, cached: true });

    const results = await TMDB.rapidSearch(query, type);
    setCached(cacheKey, results);
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 1. Get TMDB movies & combined media (with caching)
app.get('/api/movies', async (req, res) => {
  try {
    const search = req.query.search || '';
    const category = req.query.category || 'all';
    const type = req.query.type || 'all'; // 'all' | 'movie' | 'tv'
    const year = req.query.year || 'all';

    const cacheKey = `movies:${type}:${search}:${category}:${year}`;
    const cached = getCached(cacheKey);
    if (cached) {
      const annotatedCached = cached.map(m => ({
        ...m,
        isDownloaded: Storage.hasDownloaded(m.title)
      }));
      return res.json({ success: true, count: annotatedCached.length, movies: annotatedCached, media: annotatedCached, cached: true });
    }

    let movies;
    if (type === 'movie') {
      movies = await TMDB.getMovies({ search, category, year });
    } else if (type === 'tv') {
      movies = await TMDB.getTVShows({ search, category, year });
    } else {
      movies = await TMDB.getCombinedMedia({ search, category, type: 'all', year });
    }

    const annotated = movies.map(m => ({
      ...m,
      isDownloaded: Storage.hasDownloaded(m.title)
    }));

    setCached(cacheKey, movies);
    const correctedQuery = movies.find(m => m.correctedQuery)?.correctedQuery || null;
    res.json({ success: true, count: annotated.length, movies: annotated, media: annotated, correctedQuery });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Get TMDB TV Shows (with caching)
app.get('/api/tv', async (req, res) => {
  try {
    const search = req.query.search || '';
    const category = req.query.category || 'all';
    const year = req.query.year || 'all';

    const cacheKey = `tv:${search}:${category}:${year}`;
    const cached = getCached(cacheKey);
    if (cached) {
      const annotatedCached = cached.map(s => ({
        ...s,
        isDownloaded: Storage.hasDownloaded(s.title)
      }));
      return res.json({ success: true, count: annotatedCached.length, shows: annotatedCached, cached: true });
    }

    const shows = await TMDB.getTVShows({ search, category, year });
    const annotated = shows.map(s => ({
      ...s,
      isDownloaded: Storage.hasDownloaded(s.title)
    }));

    setCached(cacheKey, shows);
    const correctedQuery = shows.find(s => s.correctedQuery)?.correctedQuery || null;
    res.json({ success: true, count: annotated.length, shows: annotated, correctedQuery });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Universal media endpoint (movies, tv, or combined) (with caching)
app.get('/api/media', async (req, res) => {
  try {
    const type = req.query.type || 'all';
    const search = req.query.search || '';
    const category = req.query.category || 'all';
    const year = req.query.year || 'all';

    const cacheKey = `media:${type}:${search}:${category}:${year}`;
    const cached = getCached(cacheKey);
    if (cached) {
      const annotatedCached = cached.map(item => ({
        ...item,
        isDownloaded: Storage.hasDownloaded(item.title)
      }));
      return res.json({ success: true, count: annotatedCached.length, items: annotatedCached, movies: annotatedCached, media: annotatedCached, cached: true });
    }

    let items;
    if (type === 'all') {
      items = await TMDB.getCombinedMedia({ search, category, type: 'all', year });
    } else {
      items = await TMDB.getMedia({ type, search, category, year });
    }

    const annotated = items.map(item => ({
      ...item,
      isDownloaded: Storage.hasDownloaded(item.title)
    }));

    setCached(cacheKey, items);
    const correctedQuery = items.find(i => i.correctedQuery)?.correctedQuery || null;
    res.json({ success: true, count: annotated.length, items: annotated, movies: annotated, media: annotated, correctedQuery });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Get TMDB Anime (TV series and Movies) (with caching)
app.get('/api/anime', async (req, res) => {
  try {
    const search = req.query.search || '';
    const category = req.query.category || 'all';
    const type = req.query.type || 'all'; // 'all' | 'tv' | 'movie'
    const year = req.query.year || 'all';

    const cacheKey = `anime:${type}:${search}:${category}:${year}`;
    const cached = getCached(cacheKey);
    if (cached) {
      const annotatedCached = cached.map(item => ({
        ...item,
        isDownloaded: Storage.hasDownloaded(item.title)
      }));
      return res.json({ success: true, count: annotatedCached.length, anime: annotatedCached, cached: true });
    }

    const items = await TMDB.getAnime({ search, category, type, year });
    const annotated = items.map(item => ({
      ...item,
      isDownloaded: Storage.hasDownloaded(item.title)
    }));

    setCached(cacheKey, items);
    const correctedQuery = items.find(i => i.correctedQuery)?.correctedQuery || null;
    res.json({ success: true, count: annotated.length, anime: annotated, correctedQuery });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3.5. Get similar media
app.get('/api/media/:id/similar', async (req, res) => {
  try {
    const { id } = req.params;
    const type = req.query.type || 'movie';
    const similar = await TMDB.getSimilarMedia(id, type);
    const annotated = similar.map(item => ({
      ...item,
      isDownloaded: Storage.hasDownloaded(item.title)
    }));
    res.json({ success: true, count: annotated.length, items: annotated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3.6. Get scene frames and stills gallery (movies, TV shows, and anime)
app.get('/api/media/:id/frames', async (req, res) => {
  try {
    const { id } = req.params;
    const type = req.query.type || 'movie';
    const cacheKey = `frames:${id}:${type}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return res.json({ success: true, count: cached.length, frames: cached, cached: true });
    }

    const frames = await TMDB.getFrames(id, type);
    setCached(cacheKey, frames);
    res.json({ success: true, count: frames.length, frames });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Handle Quiz Recommendations
app.post('/api/quiz', async (req, res) => {
  try {
    const answers = req.body;
    const recommendations = await TMDB.getQuizRecommendations(answers);
    const annotated = recommendations.map(m => ({
      ...m,
      isDownloaded: Storage.hasDownloaded(m.title)
    }));
    res.json({ success: true, count: annotated.length, results: annotated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4.5 Search Artist / Actor & Full Filmography with Google & TMDB Enrichment
const handleArtistLookup = async (req, res) => {
  try {
    const query = (req.query.q || '').trim();
    const id = req.query.id;

    if (!query && !id) {
      return res.status(400).json({ success: false, error: 'Artist name (q) or id is required' });
    }

    let artistId = id;
    let matches = [];

    if (!artistId) {
      matches = await TMDB.searchActors(query);
      if (matches.length === 0) {
        return res.json({ success: true, artist: null, actor: null, matches: [] });
      }
      artistId = matches[0].id;
    }

    const artist = await TMDB.getActorDetails(artistId);
    if (!artist) {
      return res.status(404).json({ success: false, error: 'Artist details not found' });
    }

    if (matches.length > 0 && matches[0].characterPlayed) {
      artist.characterPlayed = matches[0].characterPlayed;
      artist.characterQuery = query;
    }

    // Annotate credits with isDownloaded flag
    if (artist.credits && Array.isArray(artist.credits)) {
      artist.credits = artist.credits.map(c => ({
        ...c,
        isDownloaded: Storage.hasDownloaded(c.title)
      }));
    }

    const correctedQuery = matches[0]?.correctedQuery || null;
    res.json({
      success: true,
      artist,
      actor: artist,
      matches,
      characterPlayed: matches[0]?.characterPlayed || null,
      correctedQuery
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

app.get('/api/artist', handleArtistLookup);
app.get('/api/actor', handleArtistLookup);

const handleArtistSearch = async (req, res) => {
  try {
    const query = (req.query.q || '').trim();
    if (!query) {
      return res.status(400).json({ success: false, error: 'Query is required' });
    }
    const matches = await TMDB.searchActors(query);
    res.json({ success: true, count: matches.length, matches });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

app.get('/api/artist/search', handleArtistSearch);
app.get('/api/actor/search', handleArtistSearch);

const handleArtistById = async (req, res) => {
  try {
    const { id } = req.params;
    const character = req.query.character || req.query.characterPlayed || null;
    const artist = await TMDB.getActorDetails(id);
    if (!artist) {
      return res.status(404).json({ success: false, error: 'Artist not found' });
    }
    if (character) {
      artist.characterPlayed = character;
    }
    if (artist.credits && Array.isArray(artist.credits)) {
      artist.credits = artist.credits.map(c => ({
        ...c,
        isDownloaded: Storage.hasDownloaded(c.title)
      }));
    }
    res.json({ success: true, artist, actor: artist, characterPlayed: character });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

app.get('/api/artist/:id', handleArtistById);
app.get('/api/actor/:id', handleArtistById);

// 5. Search The Cine Bay for a movie or TV show
app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q || '';
    const minSeeds = req.query.minSeeds ? parseInt(req.query.minSeeds, 10) : 0;
    const category = req.query.category || '200'; // 200 = All Video, 205 = TV, 201 = Movies
    const season = req.query.season ? parseInt(req.query.season, 10) : undefined;
    const episode = req.query.episode ? parseInt(req.query.episode, 10) : undefined;
    const imdbId = req.query.imdbId || req.query.imdb || undefined;
    const tmdbId = req.query.tmdbId || req.query.id || undefined;
    const year = req.query.year || undefined;
    const type = req.query.type || (category === '205' ? 'tv' : 'movie');
    const isSeasonPack = req.query.isSeasonPack === 'true' || req.query.seasonPack === 'true';

    if (!query.trim()) {
      return res.status(400).json({ success: false, error: 'Search query is required' });
    }

    const torrents = await CineBay.search(query, { minSeeds, category, season, episode, imdbId, tmdbId, year, type, isSeasonPack, seasonPack: isSeasonPack });
    res.json({ success: true, count: torrents.length, query, torrents });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5b. Search Whole Season Pack Torrents (Whole Season as 1 Torrent File)
app.get('/api/season/torrents', async (req, res) => {
  try {
    const title = req.query.title || req.query.q || '';
    const season = req.query.season ? parseInt(req.query.season, 10) : 1;
    const imdbId = req.query.imdbId || req.query.imdb || undefined;
    const tmdbId = req.query.tmdbId || req.query.id || undefined;
    const year = req.query.year || undefined;
    const type = req.query.type || 'tv';

    if (!title.trim() && !imdbId && !tmdbId) {
      return res.status(400).json({ success: false, error: 'Title, tmdbId, or imdbId is required' });
    }

    const searchQuery = `${title || 'Series'} Season ${season}`.trim();
    const torrents = await CineBay.searchSeasonPack(searchQuery, season, {
      imdbId,
      tmdbId,
      year,
      type
    });

    res.json({
      success: true,
      season,
      count: torrents.length,
      title,
      torrents
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Download a specific torrent / record history
app.post('/api/download', async (req, res) => {
  try {
    const { movieTitle, torrent, openMagnet } = req.body;
    if (!torrent || (!torrent.magnet && !torrent.infoHash)) {
      return res.status(400).json({ success: false, error: 'Valid torrent object with magnet or infoHash is required' });
    }

    const result = await Downloader.startDownload(movieTitle, torrent, { openMagnet });
    res.json({ success: true, record: result.record });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5a. Direct .torrent file download
app.all(['/api/torrent/download', '/api/torrent/file'], async (req, res) => {
  try {
    const magnet = req.query.magnet || req.body?.magnet || '';
    const hash = req.query.hash || req.body?.hash || '';
    const name = req.query.name || req.body?.name || '';
    const title = req.query.title || req.body?.title || '';
    const torrentUrl = req.query.torrentUrl || req.body?.torrentUrl || '';
    const size = req.query.size || req.body?.size || '';
    const trackers = req.query.trackers || req.body?.trackers || '';

    if (!magnet && !hash && !torrentUrl) {
      return res.status(400).json({ success: false, error: 'Magnet link, infoHash, or torrentUrl is required to download .torrent' });
    }

    let parsedName = name || title;
    let parsedHash = hash;
    let parsedSize = size;
    const extractedTrackers = [];

    if (magnet) {
      try {
        const decodedMagnet = magnet.includes('%') ? decodeURIComponent(magnet) : magnet;
        if (!parsedName) {
          const dnMatch = decodedMagnet.match(/[?&]dn=([^&]+)/i);
          if (dnMatch) parsedName = decodeURIComponent(dnMatch[1].replace(/\+/g, ' '));
        }
        if (!parsedHash) {
          const hashMatch = decodedMagnet.match(/xt=urn:btih:([a-zA-Z0-9]{32,40})/i);
          if (hashMatch) parsedHash = hashMatch[1];
        }
        if (!parsedSize) {
          const xlMatch = decodedMagnet.match(/[?&]xl=([0-9]+)/i);
          if (xlMatch) parsedSize = parseInt(xlMatch[1], 10);
        }
      } catch (_) {}
    }

    if (Array.isArray(trackers)) {
      extractedTrackers.push(...trackers);
    } else if (typeof trackers === 'string' && trackers) {
      try {
        const parsedTr = JSON.parse(trackers);
        if (Array.isArray(parsedTr)) extractedTrackers.push(...parsedTr);
        else extractedTrackers.push(trackers);
      } catch (_) {
        extractedTrackers.push(trackers);
      }
    }

    const torrentObj = {
      name: parsedName || 'release',
      magnet: magnet || (parsedHash ? `magnet:?xt=urn:btih:${parsedHash}` : ''),
      infoHash: parsedHash,
      torrentUrl: torrentUrl || undefined,
      size: parsedSize ? parseInt(parsedSize, 10) : undefined,
      trackers: extractedTrackers.length > 0 ? extractedTrackers : undefined
    };

    const { buffer, filename } = await Downloader.fetchOrGenerateTorrentBuffer(torrentObj, title || name);

    // Record download in history
    Storage.recordDownload({
      movieTitle: title || parsedName || 'Direct .torrent Download',
      name: torrentObj.name,
      magnet: torrentObj.magnet,
      quality: 'HD',
      rankScore: 100,
      sizeFormatted: `${(buffer.length / 1024).toFixed(1)} KB`,
      seeders: 10
    });

    const safeFilename = filename.replace(/[^\w.-]/g, '_');
    res.setHeader('Content-Type', 'application/x-bittorrent');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'no-cache');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Get download history
app.get('/api/history', (req, res) => {
  try {
    const downloads = Storage.getDownloads();
    res.json({ success: true, count: downloads.length, downloads });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Remove download record from history
app.delete('/api/history/:id', (req, res) => {
  try {
    Storage.deleteDownload(req.params.id);
    res.json({ success: true, message: 'Record deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7.5. Legacy Watchlist API Endpoints (Local JSON Storage Fallback)
app.get('/api/watchlist', (req, res) => {
  try {
    const watchlist = Storage.getWatchlist();
    res.json({ success: true, count: watchlist.length, watchlist });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/watchlist', (req, res) => {
  try {
    const item = req.body;
    if (!item || (!item.title && typeof item !== 'string')) {
      return res.status(400).json({ success: false, error: 'Title or item object required' });
    }
    const watchlist = Storage.addToWatchlist(item);
    res.json({ success: true, count: watchlist.length, watchlist });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/watchlist/:id', (req, res) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const fallbackTitle = req.query.title ? decodeURIComponent(req.query.title) : null;
    const watchlist = Storage.removeFromWatchlist(id, fallbackTitle);
    res.json({ success: true, count: watchlist.length, watchlist });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/watchlist', (req, res) => {
  try {
    const watchlist = Storage.clearWatchlist();
    res.json({ success: true, count: watchlist.length, watchlist });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// 7.6. SUPABASE CLOUD USER WATCHLIST SYSTEM (Per-User Watchlist & Sync)
// =========================================================================

// GET User Watchlist from Supabase (or fallback to local storage)
app.get('/api/user/watchlist', async (req, res) => {
  const userId = req.query.userId || req.query.user_id || 'guest';
  try {
    const sbRes = await supabaseFetch(`watchlist_items?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`);
    if (sbRes && sbRes.ok) {
      const items = await sbRes.json();
      return res.json({ success: true, count: items.length, watchlist: items, source: 'supabase' });
    }
  } catch (e) {
    console.warn('Supabase watchlist fetch fallback:', e.message);
  }

  // Graceful fallback to local JSON storage
  const localList = Storage.getWatchlist();
  res.json({ success: true, count: localList.length, watchlist: localList, source: 'local' });
});

// POST / Upsert User Watchlist Item into Supabase
app.post('/api/user/watchlist', async (req, res) => {
  try {
    const { item, userId } = req.body;
    const targetUserId = userId || req.body.user_id || 'guest';

    const authorized = await assertUserAuthorized(req, targetUserId);
    if (!authorized) {
      return res.status(401).json({ success: false, error: 'Unauthorized: valid user authentication session required' });
    }

    if (!item || !item.title || typeof item.title !== 'string' || !item.title.trim()) {
      return res.status(400).json({ success: false, error: 'Valid title string is required' });
    }
    const cleanTitle = String(item.title).trim().slice(0, 500);

    let resolvedTmdbId = item.tmdbId || item.id ? parseInt(item.tmdbId || item.id, 10) : null;
    if (resolvedTmdbId && (item.isSeason || item.is_season) && (item.seasonNumber != null || item.season_number != null)) {
      const sNum = item.seasonNumber != null ? item.seasonNumber : item.season_number;
      resolvedTmdbId = parseInt(`${resolvedTmdbId}${String(sNum).padStart(2, '0')}`, 10);
    }

    const payload = {
      user_id: String(targetUserId),
      tmdb_id: resolvedTmdbId,
      media_type: item.mediaType || 'movie',
      title: cleanTitle,
      year: item.year ? Math.min(2100, Math.max(1800, parseInt(item.year, 10))) : null,
      poster: item.poster || null,
      backdrop: item.backdrop || null,
      rating: item.rating ? Math.min(10, Math.max(0, parseFloat(item.rating))) : 0,
      vote_count: item.voteCount || item.vote_count || 0,
      overview: (item.overview || item.synopsis || '').slice(0, 5000),
      genres: Array.isArray(item.genres) ? item.genres.slice(0, 20).map(g => String(g).slice(0, 50)) : [],
      runtime: item.runtime ? Math.max(0, parseInt(item.runtime, 10)) : 0,
      status: ['plan_to_watch', 'watching', 'completed', 'dropped'].includes(item.status) ? item.status : 'plan_to_watch',
      current_season: item.seasonNumber != null ? Math.max(1, parseInt(item.seasonNumber, 10)) : Math.max(1, parseInt(item.currentSeason || item.current_season || 1, 10)),
      current_episode: Math.max(0, parseInt(item.currentEpisode || item.current_episode || 0, 10)),
      total_seasons: Math.max(1, parseInt(item.totalSeasons || item.total_seasons || 1, 10)),
      total_episodes: Math.max(0, parseInt(item.totalEpisodes || item.total_episodes || 0, 10)),
      progress_pct: Math.min(100, Math.max(0, parseInt(item.progressPct || item.progress_pct || 0, 10))),
      user_rating: item.userRating || item.user_rating || null,
      diary_notes: item.diaryNotes || item.diary_notes || null,
      watched_date: item.watchedDate || item.watched_date || null,
      alert_enabled: Boolean(item.alertEnabled || item.alert_enabled),
      next_air_date: item.nextAirDate || item.next_air_date || null,
      streaming_info: Array.isArray(item.streamingInfo || item.streaming_info) ? (item.streamingInfo || item.streaming_info) : [],
      custom_lists: Array.isArray(item.customLists || item.custom_lists) ? (item.customLists || item.custom_lists) : [],
      updated_at: new Date().toISOString()
    };

    if (item.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(item.id))) {
      payload.id = String(item.id);
    }

    // Save to Supabase with on_conflict resolution matching database constraint watchlist_user_tmdb_unique
    let savedItem = payload;
    const isConflictQuery = payload.tmdb_id ? '?on_conflict=user_id,tmdb_id,media_type' : '';
    const sbRes = await supabaseFetch(`watchlist_items${isConflictQuery}`, {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(payload)
    });

    if (sbRes && sbRes.ok) {
      const data = await sbRes.json();
      if (Array.isArray(data) && data[0]) {
        savedItem = data[0];
      }
    }

    // Also mirror into local Storage for offline backup
    Storage.addToWatchlist(item);

    res.json({ success: true, item: savedItem });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper to map frontend camelCase properties to Supabase snake_case columns
const mapWatchlistUpdatesToDb = (updates = {}) => {
  const mapping = {
    currentEpisode: 'current_episode',
    currentSeason: 'current_season',
    totalEpisodes: 'total_episodes',
    totalSeasons: 'total_seasons',
    progressPct: 'progress_pct',
    userRating: 'user_rating',
    watchedDate: 'watched_date',
    diaryNotes: 'diary_notes',
    alertEnabled: 'alert_enabled',
    customLists: 'custom_lists',
    mediaType: 'media_type',
    tmdbId: 'tmdb_id',
    voteCount: 'vote_count',
    nextAirDate: 'next_air_date',
    streamingInfo: 'streaming_info'
  };
  const result = {};
  for (const [key, val] of Object.entries(updates)) {
    const dbKey = mapping[key] || key;
    result[dbKey] = val;
  }
  return result;
};

// PATCH User Watchlist Item (Progress, Rating, Status, Diary, Custom Lists)
app.patch('/api/user/watchlist/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, updates, tmdbId, title } = req.body;
    const targetUserId = userId || 'guest';

    const authorized = await assertUserAuthorized(req, targetUserId);
    if (!authorized) {
      return res.status(401).json({ success: false, error: 'Unauthorized: valid user authentication session required' });
    }

    const dbFields = mapWatchlistUpdatesToDb(updates);
    const fields = { ...dbFields, updated_at: new Date().toISOString() };

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id));
    const isSmallNumber = /^\d{1,9}$/.test(String(id));
    const reqTmdbId = tmdbId || req.body.tmdb_id;
    let queryFilter = isUuid
      ? `id=eq.${encodeURIComponent(id)}`
      : ((reqTmdbId || isSmallNumber)
          ? `tmdb_id=eq.${encodeURIComponent(reqTmdbId || id)}`
          : `title=eq.${encodeURIComponent(title || id)}`);
    queryFilter += `&user_id=eq.${encodeURIComponent(targetUserId)}`;

    let savedItem = fields;
    const sbRes = await supabaseFetch(`watchlist_items?${queryFilter}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(fields)
    });

    if (sbRes && sbRes.ok) {
      const data = await sbRes.json();
      if (Array.isArray(data) && data[0]) {
        savedItem = data[0];
      }
    }

    // Mirror updates into local Storage for fallback & guest persistence
    Storage.updateWatchlistItem(id, fields, title);

    res.json({ success: true, item: savedItem });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE User Watchlist Item
app.delete('/api/user/watchlist/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.query.userId || req.query.user_id || 'guest';
    const fallbackTitle = req.query.title ? decodeURIComponent(req.query.title) : null;

    const authorized = await assertUserAuthorized(req, userId);
    if (!authorized) {
      return res.status(401).json({ success: false, error: 'Unauthorized: valid user authentication session required' });
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id));
    let queryFilter = isUuid
      ? `id=eq.${encodeURIComponent(id)}`
      : (fallbackTitle
          ? `title=eq.${encodeURIComponent(fallbackTitle)}`
          : (/^\d+$/.test(String(id))
              ? `tmdb_id=eq.${encodeURIComponent(id)}`
              : `title=eq.${encodeURIComponent(id)}`));
    queryFilter += `&user_id=eq.${encodeURIComponent(userId)}`;

    // Delete from Supabase
    await supabaseFetch(`watchlist_items?${queryFilter}`, {
      method: 'DELETE'
    });

    // Also remove from local storage
    Storage.removeFromWatchlist(id, fallbackTitle);
    res.json({ success: true, message: 'Item deleted from watchlist' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE User Watchlist (Clear Entire Watchlist for User)
app.delete('/api/user/watchlist', async (req, res) => {
  try {
    const userId = req.query.userId || req.query.user_id || 'guest';

    const authorized = await assertUserAuthorized(req, userId);
    if (!authorized) {
      return res.status(401).json({ success: false, error: 'Unauthorized: valid user authentication session required' });
    }

    await supabaseFetch(`watchlist_items?user_id=eq.${encodeURIComponent(userId)}`, {
      method: 'DELETE'
    });
    Storage.clearWatchlist();
    res.json({ success: true, count: 0, watchlist: [], message: 'Watchlist cleared successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Custom Curated Lists Endpoints
app.get('/api/user/custom-lists', async (req, res) => {
  const userId = req.query.userId || req.query.user_id || 'guest';
  try {
    const sbRes = await supabaseFetch(`custom_lists?user_id=eq.${encodeURIComponent(userId)}&order=created_at.asc`);
    if (sbRes && sbRes.ok) {
      const lists = await sbRes.json();
      return res.json({ success: true, count: lists.length, lists, source: 'supabase' });
    }
  } catch (e) {
    console.warn('[Supabase custom_lists fetch error]:', e.message);
  }

  // Graceful fallback to persistent local Storage
  const localLists = Storage.getCustomLists(userId);
  res.json({ success: true, count: localLists.length, lists: localLists, source: 'local' });
});

app.post('/api/user/custom-lists', async (req, res) => {
  try {
    const listData = req.body.list || req.body;
    const name = (listData.name || '').trim();
    const description = (listData.description || '').trim();
    const color = listData.color || '#ff2a5f';
    const icon = listData.icon || 'bookmark';
    const targetUserId = req.body.userId || listData.userId || req.body.user_id || 'guest';

    const authorized = await assertUserAuthorized(req, targetUserId);
    if (!authorized) {
      return res.status(401).json({ success: false, error: 'Unauthorized: valid user authentication session required' });
    }

    if (!name) return res.status(400).json({ success: false, error: 'List name is required' });

    // Ensure valid UUID for Supabase uuid column type
    const isUuid = listData.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(listData.id));
    const listId = isUuid ? String(listData.id) : crypto.randomUUID();

    const payload = {
      id: listId,
      user_id: targetUserId,
      name,
      description,
      color,
      icon,
      created_at: listData.created_at || new Date().toISOString()
    };

    let saved = payload;
    const sbRes = await supabaseFetch('custom_lists', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(payload)
    });

    if (sbRes && sbRes.ok) {
      const data = await sbRes.json();
      if (Array.isArray(data) && data[0]) {
        saved = data[0];
      }
    } else if (sbRes) {
      console.warn('[Supabase custom_lists POST warning]:', await sbRes.text());
    }

    // Mirror into local Storage
    Storage.saveCustomList(targetUserId, saved);

    res.json({ success: true, list: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/user/custom-lists/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.query.userId || req.query.user_id || 'guest';

    const authorized = await assertUserAuthorized(req, userId);
    if (!authorized) {
      return res.status(401).json({ success: false, error: 'Unauthorized: valid user authentication session required' });
    }

    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id))) {
      await supabaseFetch(`custom_lists?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`, { method: 'DELETE' });
    }

    // Remove from local Storage
    Storage.deleteCustomList(userId, id);

    res.json({ success: true, message: 'Custom list deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Watch Diary Endpoints (Supabase Cloud Database + Persistent Local Mirror)
app.get('/api/user/diary', async (req, res) => {
  const userId = req.query.userId || req.query.user_id || 'guest';
  try {
    const sbRes = await supabaseFetch(`watch_diary?user_id=eq.${encodeURIComponent(userId)}&order=watch_date.desc,created_at.desc`);
    if (sbRes && sbRes.ok) {
      const diary = await sbRes.json();
      return res.json({ success: true, count: diary.length, diary, source: 'supabase' });
    }
  } catch (e) {
    console.warn('[Supabase watch_diary fetch error]:', e.message);
  }

  // Graceful fallback to persistent local Storage
  const localDiary = Storage.getDiaryEntries(userId);
  res.json({ success: true, count: localDiary.length, diary: localDiary, source: 'local' });
});

app.post('/api/user/diary', async (req, res) => {
  try {
    const entryData = req.body.entry || req.body.diary || req.body;
    const targetUserId = req.body.userId || entryData.userId || req.body.user_id || entryData.user_id || 'guest';

    const authorized = await assertUserAuthorized(req, targetUserId);
    if (!authorized) {
      return res.status(401).json({ success: false, error: 'Unauthorized: valid user authentication session required' });
    }

    const title = (entryData.title || entryData.movie_title || '').trim();
    if (!title) return res.status(400).json({ success: false, error: 'Title is required for diary entry' });

    // Validate or generate UUID for database compatibility
    const entryId = (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(entryData.id || '')))
      ? entryData.id
      : crypto.randomUUID();

    const rawItemId = entryData.watchlistItemId || entryData.watchlist_item_id || null;
    let resolvedWatchlistItemId = rawItemId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(rawItemId))
      ? String(rawItemId)
      : null;

    if (!resolvedWatchlistItemId && (entryData.tmdbId || entryData.tmdb_id || rawItemId)) {
      const queryTmdb = entryData.tmdbId || entryData.tmdb_id || (/^\d+$/.test(String(rawItemId)) ? rawItemId : null);
      if (queryTmdb) {
        try {
          const matchRes = await supabaseFetch(`watchlist_items?tmdb_id=eq.${queryTmdb}&user_id=eq.${encodeURIComponent(targetUserId)}&select=id&limit=1`);
          if (matchRes && matchRes.ok) {
            const matchData = await matchRes.json();
            if (matchData && matchData[0]?.id) {
              resolvedWatchlistItemId = matchData[0].id;
            }
          }
        } catch (_) {}
      }
    }

    const watchDate = entryData.watch_date || entryData.watched_date || entryData.watchDate || new Date().toISOString().slice(0, 10);
    const rating = (entryData.rating !== undefined && entryData.rating !== null && entryData.rating !== '') ? parseFloat(entryData.rating) : null;
    const review = entryData.review || entryData.notes || entryData.diaryNotes || entryData.diary_notes || '';

    const payload = {
      id: entryId,
      user_id: targetUserId,
      watchlist_item_id: resolvedWatchlistItemId,
      tmdb_id: (entryData.tmdb_id || entryData.tmdbId) ? parseInt(entryData.tmdb_id || entryData.tmdbId, 10) : null,
      title: title,
      media_type: entryData.media_type || entryData.mediaType || 'movie',
      poster: entryData.poster || entryData.poster_path || null,
      year: entryData.year ? parseInt(entryData.year, 10) : null,
      watch_date: watchDate,
      rating: rating,
      review: review,
      season: entryData.season ? parseInt(entryData.season, 10) : null,
      episode: entryData.episode ? parseInt(entryData.episode, 10) : null,
      rewatch: Boolean(entryData.rewatch),
      created_at: entryData.created_at || new Date().toISOString()
    };

    let saved = payload;
    try {
      const sbRes = await supabaseFetch('watch_diary', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(payload)
      });

      if (sbRes && sbRes.ok) {
        const data = await sbRes.json();
        if (data && data[0]) saved = data[0];
      }
    } catch (sbErr) {
      console.warn('[Supabase watch_diary save error]:', sbErr.message);
    }

    // Mirror to persistent local Storage
    Storage.saveDiaryEntry(targetUserId, saved);

    res.json({ success: true, entry: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/user/diary/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.query.userId || req.query.user_id || 'guest';

    const authorized = await assertUserAuthorized(req, userId);
    if (!authorized) {
      return res.status(401).json({ success: false, error: 'Unauthorized: valid user authentication session required' });
    }

    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id))) {
      await supabaseFetch(`watch_diary?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`, { method: 'DELETE' });
    }

    // Remove from local Storage
    Storage.deleteDiaryEntry(userId, id);

    res.json({ success: true, message: 'Diary entry deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Regional Streaming Availability Endpoint
app.get('/api/providers', async (req, res) => {
  try {
    const { id, type, region } = req.query;
    if (!id) return res.status(400).json({ success: false, error: 'Media ID is required' });
    const targetRegion = (region || 'US').toUpperCase();
    const cacheKey = `providers:${id}:${type}:${targetRegion}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json({ success: true, providers: cached, cached: true });

    const details = await TMDB.getDetails(id, type || 'movie', { region: targetRegion });
    const providers = details?.streamingDetails || { region: targetRegion, flatrate: [], rent: [], buy: [], free: [] };
    setCached(cacheKey, providers);
    res.json({ success: true, providers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Data Import & Export Endpoints
app.post('/api/user/import', async (req, res) => {
  try {
    const { items, userId } = req.body;
    const targetUserId = userId || 'guest';
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Array of items required' });
    }

    let importedCount = 0;
    const records = [];

    for (const raw of items.slice(0, 200)) {
      const title = raw.title || raw.Title || raw.name || '';
      if (!title) continue;

      const record = {
        user_id: targetUserId,
        tmdb_id: raw.tmdb_id || raw.tmdbId || raw.id || null,
        media_type: raw.media_type || raw.mediaType || (raw.Season ? 'tv' : 'movie'),
        title: title.trim(),
        year: parseInt(raw.year || raw.Year || 0, 10) || null,
        poster: raw.poster || null,
        rating: parseFloat(raw.rating || raw.Rating || 0) || 0,
        status: raw.status || (raw.WatchedDate ? 'completed' : 'plan_to_watch'),
        user_rating: raw.user_rating || raw.Rating10 ? parseFloat(raw.user_rating || raw.Rating10) : null,
        diary_notes: raw.diary_notes || raw.Review || null,
        watched_date: raw.watched_date || raw.WatchedDate || null,
        created_at: new Date().toISOString()
      };
      records.push(record);
      Storage.addToWatchlist(record);
    }

    if (records.length > 0) {
      await supabaseFetch('watchlist_items?on_conflict=user_id,tmdb_id,media_type', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(records)
      });
      importedCount = records.length;
    }

    res.json({ success: true, count: importedCount, message: `Successfully imported ${importedCount} items into watchlist` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/user/export', async (req, res) => {
  try {
    const userId = req.query.userId || 'guest';
    const format = (req.query.format || 'csv').toLowerCase();

    let items = [];
    const sbRes = await supabaseFetch(`watchlist_items?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`);
    if (sbRes && sbRes.ok) {
      items = await sbRes.json();
    } else {
      items = Storage.getWatchlist();
    }

    if (format === 'trakt') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="moodflix_trakt_export.json"');
      const traktData = {
        movies: items.filter(i => (i.media_type || i.mediaType) === 'movie').map(i => ({
          title: i.title,
          year: i.year,
          ids: { tmdb: i.tmdb_id || i.tmdbId }
        })),
        shows: items.filter(i => (i.media_type || i.mediaType) === 'tv').map(i => ({
          title: i.title,
          year: i.year,
          ids: { tmdb: i.tmdb_id || i.tmdbId }
        }))
      };
      return res.send(JSON.stringify(traktData, null, 2));
    }

    if (format === 'letterboxd') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="moodflix_letterboxd_export.csv"');
      let csv = 'Title,Year,Rating10,WatchedDate,Review\n';
      items.forEach(i => {
        const titleSafe = `"${(i.title || '').replace(/"/g, '""')}"`;
        const reviewSafe = `"${(i.diary_notes || '').replace(/"/g, '""')}"`;
        csv += `${titleSafe},${i.year || ''},${i.user_rating || ''},${i.watched_date || ''},${reviewSafe}\n`;
      });
      return res.send(csv);
    }

    // Standard CSV Export
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="moodflix_watchlist.csv"');
    let csv = 'Title,Year,MediaType,Status,Rating,Runtime,DateAdded,TMDB_ID,Genres\n';
    items.forEach(i => {
      const titleSafe = `"${(i.title || '').replace(/"/g, '""')}"`;
      const genresList = Array.isArray(i.genres) ? i.genres : (typeof i.genres === 'string' ? [i.genres] : []);
      const genresSafe = `"${(genresList.join(';') || '').replace(/"/g, '""')}"`;
      csv += `${titleSafe},${i.year || ''},${i.media_type || i.mediaType || 'movie'},${i.status || 'plan_to_watch'},${i.rating || ''},${i.runtime || ''},${i.created_at || ''},${i.tmdb_id || i.tmdbId || ''},${genresSafe}\n`;
    });
    res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Get settings
app.get('/api/settings', (req, res) => {
  try {
    const rawSettings = Storage.getSettings();
    const settings = { ...rawSettings };
    // Redact TMDB API key and token to prevent harvesting
    delete settings.tmdbApiKey;
    delete settings.tmdbReadToken;
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Update settings
app.post('/api/settings', (req, res) => {
  try {
    const updated = Storage.updateSettings(req.body);
    res.json({ success: true, settings: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 10. Run automated auto-cine cycle
app.post('/api/run-cycle', async (req, res) => {
  try {
    const logs = [];
    const logger = {
      log: msg => logs.push({ type: 'info', message: msg, time: new Date().toLocaleTimeString() }),
      success: msg => logs.push({ type: 'success', message: msg, time: new Date().toLocaleTimeString() }),
      warn: msg => logs.push({ type: 'warn', message: msg, time: new Date().toLocaleTimeString() }),
      error: msg => logs.push({ type: 'error', message: msg, time: new Date().toLocaleTimeString() })
    };

    const cine = new TheRottenCine(req.body);
    const summary = await cine.run({ logger });

    res.json({ success: true, summary, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 11. Get media details (trailer, providers, runtime)
app.get('/api/details', async (req, res) => {
  try {
    const { id, type, title, year, region } = req.query;
    if (!id && !title) return res.status(400).json({ success: false, error: 'Media ID or title is required' });
    const targetRegion = (region || 'US').toUpperCase();
    const cacheKey = `details:${id}:${type}:${targetRegion}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json({ success: true, details: cached, cached: true });

    const details = await TMDB.getDetails(id, type || 'movie', { fallbackTitle: title, fallbackYear: year, region: targetRegion });
    if (details) setCached(cacheKey, details);
    res.json({ success: true, details });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 11b. Direct Trailer Search Endpoint
app.get('/api/trailer', async (req, res) => {
  try {
    const { id, type, title, year } = req.query;
    let trailerKey = null;
    if (id) {
      const details = await TMDB.getDetails(id, type || 'movie', { fallbackTitle: title, fallbackYear: year });
      trailerKey = details?.trailerKey || null;
    }
    if (!trailerKey && title) {
      trailerKey = await TMDB.findYouTubeTrailer(title, year, type || 'movie');
    }
    res.json({ success: true, trailerKey });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 12. Get similar media (legacy route, delegating to TMDB.getSimilarMedia)
app.get('/api/similar', async (req, res) => {
  try {
    const { id, type } = req.query;
    if (!id) return res.status(400).json({ success: false, error: 'Media ID is required' });
    const similar = await TMDB.getSimilarMedia(id, type || 'movie');
    res.json({ success: true, similar, items: similar });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 13. Get TV Season Episodes
app.get('/api/tv/episodes', async (req, res) => {
  try {
    const { id, season } = req.query;
    if (!id || !season) return res.status(400).json({ success: false, error: 'Media ID and season number are required' });
    const episodes = await TMDB.getTVEpisodes(id, season);
    res.json({ success: true, episodes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start Express server if not in Vercel serverless environment and not in test execution
if (!process.env.VERCEL && process.env.NODE_ENV !== 'test' && (!process.argv[1] || process.argv[1].endsWith('server.js'))) {
  app.listen(PORT, () => {
    console.log(`⚓ The Movie Cine server running at: http://localhost:${PORT}`);
  });
}

export default app;
