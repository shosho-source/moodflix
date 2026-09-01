/**
 * The Movie Cine - Web Dashboard Server (TMDB + The Cine Bay)
 * Features live Movies, TV Shows, and quality torrent rankings.
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
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
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim();
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    });
  }
} catch (e) {}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

// 1. Get TMDB movies
app.get('/api/movies', async (req, res) => {
  try {
    const search = req.query.search || '';
    const category = req.query.category || 'all';

    const movies = await TMDB.getMovies({ search, category });
    const annotated = movies.map(m => ({
      ...m,
      isDownloaded: Storage.hasDownloaded(m.title)
    }));

    res.json({ success: true, count: annotated.length, movies: annotated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Get TMDB TV Shows
app.get('/api/tv', async (req, res) => {
  try {
    const search = req.query.search || '';
    const category = req.query.category || 'all';

    const shows = await TMDB.getTVShows({ search, category });
    const annotated = shows.map(s => ({
      ...s,
      isDownloaded: Storage.hasDownloaded(s.title)
    }));

    res.json({ success: true, count: annotated.length, shows: annotated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Universal media endpoint (movies or tv)
app.get('/api/media', async (req, res) => {
  try {
    const type = req.query.type || 'movie';
    const search = req.query.search || '';
    const category = req.query.category || 'all';

    const items = await TMDB.getMedia({ type, search, category });
    const annotated = items.map(item => ({
      ...item,
      isDownloaded: Storage.hasDownloaded(item.title)
    }));

    res.json({ success: true, count: annotated.length, items: annotated });
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

// 5. Search The Cine Bay for a movie or TV show
app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q || '';
    const minSeeds = req.query.minSeeds ? parseInt(req.query.minSeeds, 10) : 0;
    const category = req.query.category || '200'; // 200 = All Video, 205 = TV, 201 = Movies
    const season = req.query.season ? parseInt(req.query.season, 10) : undefined;
    const episode = req.query.episode ? parseInt(req.query.episode, 10) : undefined;
    const imdbId = req.query.imdbId || req.query.imdb || undefined;
    const type = req.query.type || (category === '205' ? 'tv' : 'movie');

    if (!query.trim()) {
      return res.status(400).json({ success: false, error: 'Search query is required' });
    }

    const torrents = await CineBay.search(query, { minSeeds, category, season, episode, imdbId, type });
    res.json({ success: true, count: torrents.length, query, torrents });
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

    if (!magnet && !hash) {
      return res.status(400).json({ success: false, error: 'Magnet link or infoHash is required to download .torrent' });
    }

    const torrentObj = {
      name: name || title || 'release',
      magnet: magnet || (hash ? `magnet:?xt=urn:btih:${hash}` : ''),
      infoHash: hash
    };

    const { buffer, filename } = await Downloader.fetchOrGenerateTorrentBuffer(torrentObj, title || name);

    // Record download in history
    Storage.recordDownload({
      movieTitle: title || name || 'Direct .torrent Download',
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

// 8. Get settings
app.get('/api/settings', (req, res) => {
  try {
    const settings = Storage.getSettings();
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
    const { id, type } = req.query;
    if (!id) return res.status(400).json({ success: false, error: 'Media ID is required' });
    const details = await TMDB.getDetails(id, type || 'movie');
    res.json({ success: true, details });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 12. Get similar media
app.get('/api/similar', async (req, res) => {
  try {
    const { id, type } = req.query;
    if (!id) return res.status(400).json({ success: false, error: 'Media ID is required' });
    const similar = await TMDB.getSimilar(id, type || 'movie');
    res.json({ success: true, similar });
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

// Start Express server if not in Vercel serverless environment
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`⚓ The Movie Cine server running at: http://localhost:${PORT}`);
  });
}

export default app;
