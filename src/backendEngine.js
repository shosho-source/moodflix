/**
 * Backend Torrent Engine - High-Speed TCP/UDP BitTorrent & HTTP Video Streaming Proxy
 * Enables standard BitTorrent swarms (PirateBay/YTS) to stream & download over HTTP into the browser.
 */

import WebTorrent from 'webtorrent';

class BackendEngine {
  constructor() {
    this.client = new WebTorrent();
    this.torrentMeta = new Map(); // infoHash -> { name, magnet, addedAt }
    
    this.client.on('error', err => {
      console.warn('[Backend Engine] Client error:', err?.message || err);
    });
    console.log('[Backend Engine] High-Speed TCP/UDP BitTorrent Client active ✓');
  }

  add(torrentInput, customMeta = {}) {
    return new Promise((resolve, reject) => {
      let target = torrentInput;
      if (typeof torrentInput === 'object' && torrentInput.buffer) {
        target = Buffer.from(torrentInput.buffer, 'base64');
      } else if (typeof torrentInput === 'string' && torrentInput.startsWith('data:')) {
        const base64Data = torrentInput.split(',')[1];
        target = Buffer.from(base64Data, 'base64');
      }

      try {
        let existing = this.client.get(target);
        if (existing) return resolve(existing);

        const torrent = this.client.add(target, {
          announce: [
            'udp://tracker.opentrackr.org:1337/announce',
            'udp://open.stealth.si:80/announce',
            'udp://tracker.torrent.eu.org:451/announce',
            'udp://tracker.bittor.pw:1337/announce',
            'udp://public.popcorn-tracker.org:6969/announce',
            'udp://tracker.dler.org:6969/announce',
            'wss://tracker.openwebtorrent.com',
            'wss://tracker.webtorrent.dev'
          ]
        });

        let settled = false;

        torrent.on('infoHash', () => {
          console.log(`[Backend Engine] InfoHash resolved: ${torrent.infoHash}`);
          this.torrentMeta.set(torrent.infoHash, {
            name: customMeta.name || torrent.name || 'Torrent Transfer',
            magnet: typeof torrentInput === 'string' ? torrentInput : null,
            addedAt: Date.now()
          });
          if (!settled) {
            settled = true;
            resolve(torrent);
          }
        });

        torrent.on('metadata', () => {
          console.log(`[Backend Engine] Metadata ready: ${torrent.name} (${torrent.files ? torrent.files.length : 0} files)`);
          const meta = this.torrentMeta.get(torrent.infoHash) || {};
          meta.name = torrent.name || meta.name;
          this.torrentMeta.set(torrent.infoHash, meta);
          if (!settled) {
            settled = true;
            resolve(torrent);
          }
        });

        torrent.on('ready', () => {
          if (!settled) {
            settled = true;
            resolve(torrent);
          }
        });

        torrent.on('error', err => {
          console.warn(`[Backend Engine] Torrent error:`, err?.message || err);
          if (!settled) {
            settled = true;
            reject(err);
          }
        });

        setTimeout(() => {
          if (!settled) {
            settled = true;
            resolve(torrent);
          }
        }, 3000);
      } catch (err) {
        reject(err);
      }
    });
  }

  get(torrentId) {
    return this.client.get(torrentId);
  }

  getAll() {
    return this.client.torrents.map(t => {
      const meta = this.torrentMeta.get(t.infoHash) || {};
      return {
        infoHash: t.infoHash,
        name: t.name || meta.name || 'Connecting to TCP/UDP swarm...',
        magnet: meta.magnet || null,
        addedAt: meta.addedAt || Date.now(),
        progress: t.progress,
        downloadSpeed: t.downloadSpeed,
        uploadSpeed: t.uploadSpeed,
        numPeers: t.numPeers,
        length: t.length || 0,
        done: t.done,
        status: t.done ? 'completed' : (t.paused ? 'paused' : 'downloading'),
        files: t.files ? t.files.map((f, i) => ({ index: i, name: f.name, length: f.length })) : []
      };
    });
  }

  remove(torrentId) {
    const t = this.client.get(torrentId);
    if (t) {
      this.torrentMeta.delete(t.infoHash);
      t.destroy();
      return true;
    }
    return false;
  }

  pause(torrentId) {
    const t = this.client.get(torrentId);
    if (t) {
      t.pause();
      return true;
    }
    return false;
  }

  resume(torrentId) {
    const t = this.client.get(torrentId);
    if (t) {
      t.resume();
      return true;
    }
    return false;
  }

  getLargestFile(torrent) {
    if (!torrent || !torrent.files || torrent.files.length === 0) return null;
    return torrent.files.reduce((a, b) => (b.length > a.length ? b : a), torrent.files[0]);
  }

  async streamFile(req, res, torrentId) {
    try {
      const torrent = await this.add(torrentId);
      if (!torrent || !torrent.files || torrent.files.length === 0) {
        return res.status(404).send('Torrent metadata not available yet');
      }

      const fileIdx = req.query.file ? parseInt(req.query.file, 10) : -1;
      const file = (fileIdx >= 0 && torrent.files[fileIdx]) ? torrent.files[fileIdx] : this.getLargestFile(torrent);

      if (!file) return res.status(404).send('No streamable file found in torrent');

      const total = file.length;
      const range = req.headers.range;

      res.setHeader('Accept-Ranges', 'bytes');

      let contentType = 'video/mp4';
      if (/\.(webm)$/i.test(file.name)) contentType = 'video/webm';
      else if (/\.(mkv)$/i.test(file.name)) contentType = 'video/x-matroska';
      else if (/\.(avi)$/i.test(file.name)) contentType = 'video/x-msvideo';
      else if (/\.(mp3)$/i.test(file.name)) contentType = 'audio/mpeg';

      res.setHeader('Content-Type', contentType);

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        let start = parseInt(parts[0], 10);
        let end = parts[1] ? parseInt(parts[1], 10) : total - 1;
        if (isNaN(start) || start < 0) start = 0;
        if (isNaN(end) || end >= total) end = total - 1;
        
        if (start > end) {
          res.setHeader('Content-Range', `bytes */${total}`);
          return res.status(416).send('Requested Range Not Satisfiable');
        }

        const chunksize = (end - start) + 1;

        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
        res.setHeader('Content-Length', chunksize);

        const stream = file.createReadStream({ start, end });
        req.on('close', () => {
          if (stream && !stream.destroyed) stream.destroy();
        });
        stream.pipe(res);
      } else {
        res.setHeader('Content-Length', total);
        const stream = file.createReadStream();
        req.on('close', () => {
          if (stream && !stream.destroyed) stream.destroy();
        });
        stream.pipe(res);
      }
    } catch (err) {
      console.error('[Backend Engine] Stream error:', err);
      if (!res.headersSent) res.status(500).send('Stream error: ' + err.message);
    }
  }

  async downloadFile(req, res, torrentId) {
    try {
      const torrent = await this.add(torrentId);
      if (!torrent || !torrent.files || torrent.files.length === 0) {
        return res.status(404).send('Torrent metadata not available yet');
      }

      const file = this.getLargestFile(torrent);
      if (!file) return res.status(404).send('File not found in torrent');

      const safeName = (file.name || 'download').replace(/[^a-zA-Z0-9_.-]/g, '_');
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      res.setHeader('Content-Length', file.length);

      const stream = file.createReadStream();
      req.on('close', () => {
        if (stream && !stream.destroyed) stream.destroy();
      });
      stream.pipe(res);
    } catch (err) {
      console.error('[Backend Engine] Download error:', err);
      if (!res.headersSent) res.status(500).send('Download error: ' + err.message);
    }
  }
}

export const backendEngine = new BackendEngine();
