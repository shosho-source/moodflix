/**
 * Downloader - Saves torrent/magnet metadata to watch directories or launches client.
 */

import { spawn } from 'child_process';
import { Storage } from './storage.js';

export class Downloader {
  /**
   * Dispatches a torrent/magnet download:
   * 1. Creates a .magnet file in the watch directory for auto-watchers
   * 2. Optionally opens the magnet link in default torrent client
   * 3. Records the download in storage history
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
    // Validate magnet URL format to prevent injection attacks
    if (!/^magnet:\?xt=urn:btih:[a-zA-Z0-9]{32,40}/i.test(trimmed)) {
      console.warn('[Downloader] Invalid or unsafe magnet link rejected:', trimmed.slice(0, 50));
      return;
    }

    const platform = process.platform;
    try {
      if (platform === 'win32') {
        // Safe spawn on Windows without shell string interpolation
        spawn('cmd.exe', ['/c', 'start', '', trimmed], { windowsHide: true, shell: false });
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
