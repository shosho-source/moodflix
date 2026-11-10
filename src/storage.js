/**
 * Storage - Lightweight persistence for download history, watchlists, and settings.
 * Pure JavaScript with atomic JSON file persistence.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const DEFAULT_TMDB_API_KEY = process.env.TMDB_API_KEY || '';
export const DEFAULT_TMDB_READ_TOKEN = process.env.TMDB_READ_TOKEN || '';

export class Storage {
  static DATA_DIR = process.env.VERCEL ? path.join('/tmp', '.rotten-cine') : path.resolve(process.cwd(), '.rotten-cine');
  static DATA_FILE = path.join(Storage.DATA_DIR, 'data.json');
  static _memoryState = null;
  static _cache = null;

  static DEFAULT_STATE = {
    settings: {
      minRating: 7.0,
      minSeeds: 5,
      tmdbApiKey: DEFAULT_TMDB_API_KEY,
      tmdbReadToken: DEFAULT_TMDB_READ_TOKEN,
      autoOpenMagnets: false
    },
    downloads: [],
    watchlist: [],
    customLists: [],
    watchDiary: []
  };

  static ensureDataFile() {
    try {
      if (!fs.existsSync(Storage.DATA_DIR)) {
        fs.mkdirSync(Storage.DATA_DIR, { recursive: true });
      }
      if (!fs.existsSync(Storage.DATA_FILE)) {
        fs.writeFileSync(Storage.DATA_FILE, JSON.stringify(Storage.DEFAULT_STATE, null, 2), 'utf-8');
      }
    } catch (e) {
      // In read-only serverless filesystems, fail gracefully
    }
  }

  static read() {
    if (Storage._cache) {
      return JSON.parse(JSON.stringify(Storage._cache));
    }
    try {
      Storage.ensureDataFile();
      if (fs.existsSync(Storage.DATA_FILE)) {
        const content = fs.readFileSync(Storage.DATA_FILE, 'utf-8');
        if (content && content.trim()) {
          const parsed = JSON.parse(content);
          const state = {
            ...Storage.DEFAULT_STATE,
            ...parsed,
            settings: { ...Storage.DEFAULT_STATE.settings, ...(parsed.settings || {}) },
            downloads: Array.isArray(parsed.downloads) ? parsed.downloads : [],
            watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist : [],
            customLists: Array.isArray(parsed.customLists) ? parsed.customLists : [],
            watchDiary: Array.isArray(parsed.watchDiary) ? parsed.watchDiary : []
          };
          Storage._cache = state;
          Storage._memoryState = state;
          return JSON.parse(JSON.stringify(state));
        }
      }
    } catch (err) {
      // Fallback to memory
    }
    if (Storage._memoryState) {
      Storage._cache = Storage._memoryState;
      return JSON.parse(JSON.stringify(Storage._memoryState));
    }
    const fallback = JSON.parse(JSON.stringify(Storage.DEFAULT_STATE));
    Storage._cache = fallback;
    return fallback;
  }

  static write(data) {
    Storage._cache = JSON.parse(JSON.stringify(data));
    Storage._memoryState = Storage._cache;
    try {
      Storage.ensureDataFile();
      const tmpFile = `${Storage.DATA_FILE}.${crypto.randomBytes(16).toString('hex')}.tmp`;
      let renamed = false;
      try {
        fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
        fs.renameSync(tmpFile, Storage.DATA_FILE);
        renamed = true;
      } catch (e) {
        try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch (_) {}
      }
      if (!renamed) {
        fs.writeFileSync(Storage.DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
      }
    } catch (e) {
      // Fallback in read-only environment
    }
  }

  static getSettings() {
    const data = Storage.read();
    const settings = data.settings || {};
    return {
      ...Storage.DEFAULT_STATE.settings,
      ...settings,
      tmdbApiKey: (settings.tmdbApiKey && String(settings.tmdbApiKey).trim()) ? String(settings.tmdbApiKey).trim() : (process.env.TMDB_API_KEY || ''),
      tmdbReadToken: (settings.tmdbReadToken && String(settings.tmdbReadToken).trim()) ? String(settings.tmdbReadToken).trim() : (process.env.TMDB_READ_TOKEN || '')
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
    if (!norm) return false;
    const data = Storage.read();
    return (data.downloads || []).some(d => {
      const target = (d.movieTitle || d.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!target) return false;
      if (target === norm) return true;
      // Only permit substring inclusion if both titles are >= 6 characters to prevent false positives on short words like 'it', 'up', 'saw'
      if (norm.length >= 6 && target.length >= 6) {
        return target.includes(norm) || norm.includes(target);
      }
      return false;
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

  static addToWatchlist(item) {
    const data = Storage.read();
    if (!data.watchlist) data.watchlist = [];
    const title = typeof item === 'string' ? item : (item.title || '');
    if (!title) return data.watchlist;

    const exists = data.watchlist.some(w => {
      if (typeof w === 'object' && typeof item === 'object' && w.id && item.id && String(w.id) === String(item.id)) return true;
      const existingTitle = typeof w === 'string' ? w : (w.title || '');
      return existingTitle.toLowerCase() === title.toLowerCase();
    });

    if (!exists) {
      const entry = typeof item === 'string' ? item : {
        ...item,
        id: item.id || Date.now().toString(),
        title: item.title,
        addedAt: item.addedAt || new Date().toISOString()
      };
      data.watchlist.unshift(entry);
      Storage.write(data);
    }
    return data.watchlist;
  }

  static removeFromWatchlist(identifier, fallbackTitle = null) {
    const data = Storage.read();
    const target = String(identifier || '').toLowerCase();
    const targetTitle = String(fallbackTitle || '').toLowerCase();
    data.watchlist = (data.watchlist || []).filter(w => {
      const itemTitle = typeof w === 'string' ? w : (w.title || '');
      const itemId = typeof w === 'object' && w.id ? String(w.id) : '';
      if (itemId && target && itemId.toLowerCase() === target) return false;
      if (itemTitle && target && itemTitle.toLowerCase() === target) return false;
      if (itemTitle && targetTitle && itemTitle.toLowerCase() === targetTitle) return false;
      return true;
    });
    Storage.write(data);
    return data.watchlist;
  }

  static clearWatchlist() {
    const data = Storage.read();
    data.watchlist = [];
    Storage.write(data);
    return data.watchlist;
  }

  static updateWatchlistItem(identifier, updates = {}, fallbackTitle = null) {
    const data = Storage.read();
    if (!Array.isArray(data.watchlist)) data.watchlist = [];
    const target = String(identifier || '').toLowerCase();
    const targetTitle = String(fallbackTitle || '').toLowerCase();

    const idx = data.watchlist.findIndex(w => {
      const itemTitle = typeof w === 'string' ? w : (w.title || '');
      const itemId = typeof w === 'object' && w.id ? String(w.id) : '';
      const tmdbId = typeof w === 'object' && (w.tmdbId || w.tmdb_id) ? String(w.tmdbId || w.tmdb_id) : '';
      if (itemId && target && itemId.toLowerCase() === target) return true;
      if (tmdbId && target && tmdbId === target) return true;
      if (itemTitle && target && itemTitle.toLowerCase() === target) return true;
      if (itemTitle && targetTitle && itemTitle.toLowerCase() === targetTitle) return true;
      return false;
    });

    if (idx !== -1) {
      const current = typeof data.watchlist[idx] === 'string' ? { title: data.watchlist[idx] } : data.watchlist[idx];
      data.watchlist[idx] = { ...current, ...updates, updatedAt: new Date().toISOString() };
      Storage.write(data);
      return data.watchlist[idx];
    }
    return null;
  }
  static getCustomLists(userId = 'guest') {
    const data = Storage.read();
    const lists = Array.isArray(data.customLists) ? data.customLists : [];
    if (!userId || userId === 'all') return lists;
    return lists.filter(l => (l.user_id || l.userId || 'guest') === userId);
  }

  static saveCustomList(userId, list) {
    const data = Storage.read();
    if (!Array.isArray(data.customLists)) data.customLists = [];
    const targetUserId = userId || list.user_id || list.userId || 'guest';
    const listId = list.id || crypto.randomUUID();

    const entry = {
      id: listId,
      user_id: targetUserId,
      name: list.name,
      description: list.description || '',
      color: list.color || '#ff2a5f',
      icon: list.icon || 'bookmark',
      created_at: list.created_at || new Date().toISOString()
    };

    const existingIdx = data.customLists.findIndex(l => l.id === listId);
    if (existingIdx !== -1) {
      data.customLists[existingIdx] = { ...data.customLists[existingIdx], ...entry };
    } else {
      data.customLists.unshift(entry);
    }
    Storage.write(data);
    return entry;
  }

  static deleteCustomList(userId, listId) {
    const data = Storage.read();
    if (!Array.isArray(data.customLists)) return [];
    data.customLists = data.customLists.filter(l => {
      const matchId = l.id === listId;
      const matchUser = !userId || (l.user_id || l.userId || 'guest') === userId;
      return !(matchId && matchUser);
    });
    Storage.write(data);
    return data.customLists;
  }

  static getDiaryEntries(userId = 'guest') {
    const data = Storage.read();
    const entries = Array.isArray(data.watchDiary) ? data.watchDiary : [];
    if (!userId || userId === 'all') return entries;
    return entries.filter(e => (e.user_id || e.userId || 'guest') === userId);
  }

  static saveDiaryEntry(userId, entry) {
    const data = Storage.read();
    if (!Array.isArray(data.watchDiary)) data.watchDiary = [];
    const targetUserId = userId || entry.user_id || entry.userId || 'guest';
    const entryId = entry.id || crypto.randomUUID();

    const record = {
      id: entryId,
      user_id: targetUserId,
      watchlist_item_id: entry.watchlist_item_id || entry.watchlistItemId || null,
      tmdb_id: (entry.tmdb_id || entry.tmdbId) ? parseInt(entry.tmdb_id || entry.tmdbId, 10) : null,
      title: entry.title,
      media_type: entry.media_type || entry.mediaType || 'movie',
      poster: entry.poster || null,
      year: entry.year ? parseInt(entry.year, 10) : null,
      watch_date: entry.watch_date || entry.watched_date || entry.watchDate || new Date().toISOString().slice(0, 10),
      rating: (entry.rating !== undefined && entry.rating !== null && entry.rating !== '') ? parseFloat(entry.rating) : null,
      review: entry.review || entry.notes || entry.diaryNotes || entry.diary_notes || '',
      season: entry.season ? parseInt(entry.season, 10) : null,
      episode: entry.episode ? parseInt(entry.episode, 10) : null,
      rewatch: Boolean(entry.rewatch),
      created_at: entry.created_at || new Date().toISOString()
    };

    const existingIdx = data.watchDiary.findIndex(e => e.id === entryId);
    if (existingIdx !== -1) {
      data.watchDiary[existingIdx] = { ...data.watchDiary[existingIdx], ...record };
    } else {
      data.watchDiary.unshift(record);
    }
    Storage.write(data);
    return record;
  }

  static deleteDiaryEntry(userId, entryId) {
    const data = Storage.read();
    if (!Array.isArray(data.watchDiary)) return [];
    data.watchDiary = data.watchDiary.filter(e => {
      const matchId = String(e.id) === String(entryId);
      const matchUser = !userId || (e.user_id || e.userId || 'guest') === userId;
      return !(matchId && matchUser);
    });
    Storage.write(data);
    return data.watchDiary;
  }

}
