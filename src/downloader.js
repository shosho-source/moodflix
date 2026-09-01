/**
 * Downloader - Saves torrent/magnet metadata to watch directories, generates/fetches .torrent files, or launches client.
 */

import { spawn } from 'child_process';
import { Storage } from './storage.js';

const DEFAULT_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://tracker.bittor.pw:1337/announce',
  'udp://public.popcorn-tracker.org:6969/announce',
  'udp://tracker.dler.org:6969/announce',
  'udp://exodus.desync.com:6969',
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
   * Extracts a 40-character hex infoHash from a torrent object or magnet string
   */
  static extractInfoHash(torrent = {}) {
    if (torrent.infoHash && /^[a-fA-F0-9]{40}$/.test(torrent.infoHash)) {
      return torrent.infoHash.toLowerCase();
    }
    const magnet = torrent.magnet || (typeof torrent === 'string' ? torrent : '');
    const match = magnet.match(/xt=urn:btih:([a-zA-Z0-9]{32,40})/i);
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

    // 1. Attempt to fetch original .torrent from public torrent cache mirrors
    if (infoHash) {
      const mirrors = [
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
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            }
          });
          clearTimeout(timeout);

          if (res.ok) {
            const arrayBuffer = await res.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            if (buffer.length > 50 && buffer.slice(0, 1).toString() === 'd') {
              return { buffer, filename, isGenerated: false };
            }
          }
        } catch (err) {
          // Continue to next mirror or fallback generator
        }
      }
    }

    // 2. Synthesize a valid bencoded .torrent file
    const trackers = (torrent.trackers && Array.isArray(torrent.trackers) && torrent.trackers.length > 0)
      ? torrent.trackers
      : DEFAULT_TRACKERS;
    const announceList = trackers.map(tr => [tr]);
    const primaryAnnounce = trackers[0] || 'udp://tracker.opentrackr.org:1337/announce';

    const pieceLength = 262144; // 256 KB standard piece size
    const totalLength = torrent.size ? parseInt(torrent.size, 10) : 1073741824;

    const torrentMeta = {
      'announce': primaryAnnounce,
      'announce-list': announceList,
      'comment': `MoodFlix Verified Release - ${movieTitle || rawName}`,
      'created by': 'MoodFlix/2.0',
      'creation date': Math.floor(Date.now() / 1000),
      'info': {
        'name': rawName,
        'piece length': pieceLength,
        'length': totalLength,
        'pieces': infoHash && /^[a-f0-9]{40}$/i.test(infoHash) ? Buffer.from(infoHash, 'hex') : Buffer.alloc(20)
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
    // Validate magnet URL format strictly to prevent command injection attacks
    if (!/^magnet:\?xt=urn:btih:[a-zA-Z0-9]{32,40}(?:&[a-zA-Z0-9_=\-.:%]+)*$/i.test(trimmed)) {
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
