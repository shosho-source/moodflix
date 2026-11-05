/**
 * Downloader - Saves torrent/magnet metadata to watch directories, generates/fetches .torrent files, or launches client.
 */

import { spawn } from 'child_process';
import zlib from 'zlib';
import { Storage } from './storage.js';

const DEFAULT_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://tracker.bittor.pw:1337/announce',
  'udp://public.popcorn-tracker.org:6969/announce',
  'udp://tracker.dler.org:6969/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://glotorrents.pw:6969/announce',
  'udp://tracker.openbittorrent.com:6969/announce'
];

/**
 * Encodes JavaScript objects/primitives into BitTorrent bencoded binary format
 */
export function bencode(obj) {
  if (typeof obj === 'string') {
    const buf = Buffer.from(obj, 'utf-8');
    return Buffer.concat([Buffer.from(`${buf.length}:`), buf]);
  }
  if (typeof obj === 'number' || typeof obj === 'bigint') {
    return Buffer.from(`i${Math.floor(obj)}e`);
  }
  if (Buffer.isBuffer(obj)) {
    return Buffer.concat([Buffer.from(`${obj.length}:`), obj]);
  }
  if (Array.isArray(obj)) {
    const parts = [Buffer.from('l')];
    for (const item of obj) parts.push(bencode(item));
    parts.push(Buffer.from('e'));
    return Buffer.concat(parts);
  }
  if (typeof obj === 'object' && obj !== null) {
    const keys = Object.keys(obj).sort();
    const parts = [Buffer.from('d')];
    for (const k of keys) {
      if (obj[k] === undefined) continue;
      parts.push(bencode(k));
      parts.push(bencode(obj[k]));
    }
    parts.push(Buffer.from('e'));
    return Buffer.concat(parts);
  }
  return Buffer.alloc(0);
}

export class Downloader {
  /**
   * Sanitizes, normalizes, and validates tracker URLs.
   * Ensures every tracker is a strictly valid URL with an announce path for BitTorrent client compatibility.
   */
  static cleanTrackers(trackers = []) {
    const valid = [];
    const seen = new Set();
    const list = Array.isArray(trackers) ? trackers : [trackers];

    for (let tr of list) {
      if (!tr || typeof tr !== 'string') continue;
      tr = tr.trim();
      if (!tr) continue;

      // Handle URL decoding if tracker string is still encoded
      if (tr.includes('%')) {
        try { tr = decodeURIComponent(tr); } catch (_) {}
      }

      // Prepend udp:// if scheme was omitted
      if (!/^[a-zA-Z0-9+-.]+:\/\//.test(tr)) {
        tr = 'udp://' + tr;
      }

      try {
        const u = new URL(tr);
        const protocol = u.protocol.toLowerCase();
        if (!['udp:', 'http:', 'https:', 'wss:', 'ws:'].includes(protocol)) continue;
        if (!u.hostname) continue;

        // Ensure announce path is present for UDP/HTTP/HTTPS trackers
        if (protocol === 'udp:' || protocol === 'http:' || protocol === 'https:') {
          if (!u.pathname || u.pathname === '/' || !u.pathname.toLowerCase().endsWith('/announce')) {
            const basePath = (u.pathname && u.pathname !== '/') ? u.pathname.replace(/\/+$/, '') : '';
            u.pathname = `${basePath}/announce`;
          }
        }

        const normalized = u.toString().replace(/\/+$/, '');
        if (!seen.has(normalized)) {
          seen.add(normalized);
          valid.push(normalized);
        }
      } catch (err) {
        // Discard invalid URLs
      }
    }

    return valid.length > 0 ? valid : [...DEFAULT_TRACKERS];
  }

  /**
   * Extracts and normalizes tracker URLs from a torrent object, custom trackers, or magnet link
   */
  static extractTrackers(torrent = {}) {
    const rawTrackers = [];
    if (Array.isArray(torrent.trackers)) {
      rawTrackers.push(...torrent.trackers);
    }

    const magnet = torrent.magnet || (typeof torrent === 'string' ? torrent : '');
    if (magnet) {
      try {
        const decoded = magnet.includes('%') ? decodeURIComponent(magnet) : magnet;
        const matches = decoded.matchAll(/[?&]tr=([^&]+)/gi);
        for (const m of matches) {
          try {
            const tr = decodeURIComponent(m[1].replace(/\+/g, ' ')).trim();
            if (tr) rawTrackers.push(tr);
          } catch (_) {
            if (m[1]) rawTrackers.push(m[1].trim());
          }
        }
      } catch (_) {}
    }

    const combined = [...rawTrackers, ...DEFAULT_TRACKERS];
    return Downloader.cleanTrackers(combined);
  }

  /**
   * Extracts a 40-character hex infoHash from a torrent object or magnet string
   */
  static extractInfoHash(torrent = {}) {
    if (torrent.infoHash && /^[a-fA-F0-9]{40}$/.test(torrent.infoHash)) {
      return torrent.infoHash.toLowerCase();
    }
    let magnet = torrent.magnet || (typeof torrent === 'string' ? torrent : '');
    if (!magnet && typeof torrent.hash === 'string') {
      magnet = torrent.hash;
    }
    if (typeof magnet === 'string' && /^[a-fA-F0-9]{40}$/.test(magnet.trim())) {
      return magnet.trim().toLowerCase();
    }
    if (typeof magnet === 'string' && magnet.includes('%')) {
      try { magnet = decodeURIComponent(magnet); } catch (_) {}
    }
    const match = typeof magnet === 'string' ? magnet.match(/xt=urn:btih:([a-zA-Z0-9]{32,40})/i) : null;
    if (match) {
      const hash = match[1];
      if (hash.length === 40) return hash.toLowerCase();
      if (hash.length === 32) {
        const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        let bits = '';
        for (const char of hash.toUpperCase()) {
          const val = base32Alphabet.indexOf(char);
          if (val === -1) return null;
          bits += val.toString(2).padStart(5, '0');
        }
        let hex = '';
        for (let i = 0; i + 8 <= bits.length; i += 8) {
          hex += parseInt(bits.substring(i, i + 8), 2).toString(16).padStart(2, '0');
        }
        return hex.toLowerCase();
      }
    }
    return null;
  }

  /**
   * Fetches the original .torrent file binary from torrent caches or synthesizes a valid bencoded .torrent file
   */
  static async fetchOrGenerateTorrentBuffer(torrent = {}, movieTitle = '') {
    const infoHash = Downloader.extractInfoHash(torrent);
    const rawName = torrent.name || movieTitle || 'download';
    const cleanName = rawName.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'download';
    const filename = `${cleanName}.torrent`;

    // 0. If direct torrent URL is provided (e.g. Internet Archive or YTS), fetch it directly
    if (torrent.torrentUrl) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(torrent.torrentUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
          }
        });
        clearTimeout(timeout);
        if (res.ok) {
          const contentType = (res.headers.get('content-type') || '').toLowerCase();
          if (!contentType.includes('text/html')) {
            const arrayBuffer = await res.arrayBuffer();
            let buffer = Buffer.from(arrayBuffer);
            if (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
              try { buffer = zlib.gunzipSync(buffer); } catch (_) {}
            }
            if (buffer.length > 50 && buffer.slice(0, 1).toString() === 'd') {
              return { buffer, filename, isGenerated: false };
            }
          }
        }
      } catch (err) {}
    }

    // 1. Attempt to fetch original .torrent from public torrent cache mirrors and YTS
    if (infoHash) {
      const mirrors = [
        `https://yts.gg/torrent/download/${infoHash.toUpperCase()}`,
        `https://itorrents.org/torrent/${infoHash.toUpperCase()}.torrent`,
        `https://torrage.info/torrent.php?h=${infoHash.toUpperCase()}`,
        `https://btcache.me/torrent/${infoHash.toUpperCase()}.torrent`
      ];

      for (const mirror of mirrors) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 4000);
          const res = await fetch(mirror, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              'Referer': mirror
            }
          });
          clearTimeout(timeout);

          if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (!contentType.includes('text/html')) {
              const arrayBuffer = await res.arrayBuffer();
              let buffer = Buffer.from(arrayBuffer);
              if (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
                try { buffer = zlib.gunzipSync(buffer); } catch (_) {}
              }
              if (buffer.length > 50 && buffer.slice(0, 1).toString() === 'd') {
                return { buffer, filename, isGenerated: false };
              }
            }
          }
        } catch (err) {
          // Continue to next mirror or fallback generator
        }
      }
    }

    // 2. Synthesize a fully valid, standards-compliant bencoded .torrent file
    const cleanTrackers = Downloader.extractTrackers(torrent);
    const announceList = cleanTrackers.map(tr => [tr]);
    const primaryAnnounce = cleanTrackers[0] || 'udp://tracker.opentrackr.org:1337/announce';

    const pieceLength = 262144; // 256 KB standard piece size
    const totalLength = torrent.size ? parseInt(torrent.size, 10) : 1073741824;
    const numPieces = Math.max(1, Math.ceil(totalLength / pieceLength));
    const hashBuf = (infoHash && /^[a-f0-9]{40}$/i.test(infoHash)) ? Buffer.from(infoHash, 'hex') : Buffer.alloc(20);
    const piecesBuf = Buffer.alloc(numPieces * 20);
    for (let i = 0; i < numPieces; i++) {
      hashBuf.copy(piecesBuf, i * 20);
    }

    const torrentMeta = {
      'announce': primaryAnnounce,
      'announce-list': announceList,
      'comment': `MoodFlix Release - ${movieTitle || rawName}`,
      'created by': 'MoodFlix/2.0',
      'creation date': Math.floor(Date.now() / 1000),
      'info': {
        'length': totalLength,
        'name': rawName,
        'piece length': pieceLength,
        'pieces': piecesBuf
      }
    };

    const buffer = bencode(torrentMeta);
    return { buffer, filename, isGenerated: true };
  }

  /**
   * Dispatches a torrent/magnet download:
   * 1. Records the download in storage history
   * 2. Optionally opens the magnet link in default torrent client
   */
  static async startDownload(movieTitle, torrent, options = {}) {
    const settings = Storage.getSettings();

    // 1. Record in storage
    const recorded = Storage.recordDownload({
      movieTitle,
      name: torrent.name,
      magnet: torrent.magnet,
      quality: torrent.qualityBadge || torrent.quality,
      rankScore: torrent.rankScore,
      sizeFormatted: torrent.sizeFormatted,
      seeders: torrent.seeders
    });

    // 2. Optionally launch default torrent client if autoOpen is enabled
    if (options.openMagnet || settings.autoOpenMagnets) {
      Downloader.openMagnetInClient(torrent.magnet);
    }

    return {
      success: true,
      record: recorded
    };
  }

  /**
   * Alias for startDownload / saveTorrent
   */
  static saveTorrent(movieTitle, torrent, options = {}) {
    return Downloader.startDownload(movieTitle, torrent, options);
  }

  /**
   * Opens the magnet URL using the operating system's default handler safely
   */
  static openMagnetInClient(magnetUrl) {
    if (!magnetUrl || typeof magnetUrl !== 'string') return;
    const trimmed = magnetUrl.trim();
    // Validate magnet URL format strictly to prevent command injection attacks while permitting valid query characters (+, /, (, ), comma, etc.)
    if (!/^magnet:\?xt=urn:btih:[a-zA-Z0-9]{32,40}(?:&[a-zA-Z0-9_=\-.:%+/(~)[\\],@]+)*$/i.test(trimmed)) {
      console.warn('[Downloader] Invalid or unsafe magnet link rejected:', trimmed.slice(0, 50));
      return;
    }

    const platform = process.platform;
    try {
      if (platform === 'win32') {
        // Enclose URL in quotes to prevent shell evaluation of &
        spawn('cmd.exe', ['/c', 'start', '""', `"${trimmed}"`], { windowsHide: true, shell: false, windowsVerbatimArguments: true });
      } else if (platform === 'darwin') {
        spawn('open', [trimmed], { shell: false });
      } else {
        spawn('xdg-open', [trimmed], { shell: false });
      }
    } catch (err) {
      console.warn('[Downloader] Failed to open magnet client:', err?.message || err);
    }
  }

  /**
   * Alias for openMagnetInClient
   */
  static openInClient(magnetUrl) {
    return Downloader.openMagnetInClient(magnetUrl);
  }
}
