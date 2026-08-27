/**
 * Storage - Lightweight persistence for download history, watchlists, and settings.
 * Pure JavaScript with atomic JSON file persistence.
 */

import fs from 'fs';
import path from 'path';

export const DEFAULT_TMDB_API_KEY = '2e22dca68c093bae309efd704aa6d020';
export const DEFAULT_TMDB_READ_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIyZTIyZGNhNjhjMDkzYmFlMzA5ZWZkNzA0YWE2ZDAyMCIsIm5iZiI6MTc4MzE3Mjc3NC43ODcwMDAyLCJzdWIiOiI2YTQ5MGVhNjNhYzJkYzk4YTY3NDViNGUiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.hyizZKI38hhc3pRm_Ga1QslIsW5cJ-SkuiF1HH8p_Rc';

export class Storage {
  static DATA_DIR = path.resolve(process.cwd(), '.rotten-cine');
  static DATA_FILE = path.join(Storage.DATA_DIR, 'data.json');

  static DEFAULT_STATE = {
    settings: {
      minRating: 7.0,
      minSeeds: 5,
      tmdbApiKey: DEFAULT_TMDB_API_KEY,
      tmdbReadToken: DEFAULT_TMDB_READ_TOKEN,
      autoOpenMagnets: false
    },
    downloads: [],
    watchlist: []
  };

  static ensureDataFile() {
    if (!fs.existsSync(Storage.DATA_DIR)) {
      fs.mkdirSync(Storage.DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(Storage.DATA_FILE)) {
      fs.writeFileSync(Storage.DATA_FILE, JSON.stringify(Storage.DEFAULT_STATE, null, 2), 'utf-8');
    }
  }

  static read() {
    Storage.ensureDataFile();
    try {
      const content = fs.readFileSync(Storage.DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      // Ensure default credentials are included if missing
      parsed.settings = { ...Storage.DEFAULT_STATE.settings, ...parsed.settings };
      return parsed;
    } catch (err) {
      return { ...Storage.DEFAULT_STATE };
    }
  }

  static write(data) {
    Storage.ensureDataFile();
    const tmpFile = `${Storage.DATA_FILE}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    try {
      fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpFile, Storage.DATA_FILE);
    } catch (e) {
      try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch (_) {}
      // Fallback direct write
      fs.writeFileSync(Storage.DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    }
  }

  static getSettings() {
    const data = Storage.read();
    const settings = data.settings || {};
    return {
      ...Storage.DEFAULT_STATE.settings,
      ...settings,
      tmdbApiKey: (settings.tmdbApiKey && String(settings.tmdbApiKey).trim()) ? String(settings.tmdbApiKey).trim() : (process.env.TMDB_API_KEY || DEFAULT_TMDB_API_KEY),
      tmdbReadToken: (settings.tmdbReadToken && String(settings.tmdbReadToken).trim()) ? String(settings.tmdbReadToken).trim() : (process.env.TMDB_READ_TOKEN || DEFAULT_TMDB_READ_TOKEN)
    };
  }

  static updateSettings(newSettings) {
    const data = Storage.read();
    data.settings = { ...data.settings, ...newSettings };
    Storage.write(data);
    return data.settings;
  }

  static getDownloads() {
    const data = Storage.read();
    return data.downloads || [];
  }

  static hasDownloaded(movieTitle) {
    if (!movieTitle) return false;
    const norm = movieTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
    const data = Storage.read();
    return (data.downloads || []).some(d => {
      const target = (d.movieTitle || d.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return target === norm || target.includes(norm) || norm.includes(target);
    });
  }

  static recordDownload(item) {
    const data = Storage.read();
    if (!data.downloads) data.downloads = [];

    const record = {
      id: item.infoHash || item.id || Date.now().toString(),
      movieTitle: item.movieTitle || item.title,
      torrentName: item.name || item.torrentName || item.title,
      magnet: item.magnet || '',
      quality: item.qualityBadge || item.quality || 'HD',
      rankScore: item.rankScore || 0,
      sizeFormatted: item.sizeFormatted || 'N/A',
      seeders: item.seeders || 0,
      downloadedAt: new Date().toISOString()
    };

    data.downloads.unshift(record);
    Storage.write(data);
    return record;
  }

  static deleteDownload(id) {
    const data = Storage.read();
    data.downloads = (data.downloads || []).filter(d => d.id !== id);
    Storage.write(data);
  }

  static getWatchlist() {
    const data = Storage.read();
    return data.watchlist || [];
  }

  static addToWatchlist(title) {
    const data = Storage.read();
    if (!data.watchlist) data.watchlist = [];
    if (!data.watchlist.includes(title)) {
      data.watchlist.push(title);
      Storage.write(data);
    }
    return data.watchlist;
  }

  static removeFromWatchlist(title) {
    const data = Storage.read();
    data.watchlist = (data.watchlist || []).filter(t => t !== title);
    Storage.write(data);
    return data.watchlist;
  }
}
