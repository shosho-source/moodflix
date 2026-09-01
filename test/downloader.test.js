import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Downloader, bencode } from '../src/downloader.js';

describe('Downloader', () => {
  it('safely rejects invalid or dangerous magnet strings', () => {
    // Should not throw or crash on malicious command payloads
    assert.doesNotThrow(() => {
      Downloader.openMagnetInClient("magnet:?xt=urn:btih:123'; calc.exe; #");
    });
    assert.doesNotThrow(() => {
      Downloader.openMagnetInClient('not_a_magnet_url');
    });
    assert.doesNotThrow(() => {
      Downloader.openMagnetInClient(null);
    });
    assert.doesNotThrow(() => {
      Downloader.openMagnetInClient('');
    });
  });

  it('records download metadata cleanly into storage history', async () => {
    const fakeTorrent = {
      name: 'Gladiator.2000.1080p',
      magnet: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Gladiator',
      qualityBadge: '1080p HD',
      rankScore: 95,
      sizeFormatted: '2.5 GB',
      seeders: 150
    };

    const res = await Downloader.startDownload('Gladiator', fakeTorrent, { openMagnet: false });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.record.movieTitle, 'Gladiator');
    assert.strictEqual(res.record.torrentName, 'Gladiator.2000.1080p');
  });

  it('extracts info hashes accurately from magnets and torrent objects', () => {
    const hash = 'c12fe1c06bba254a9dc9f519b335aa7c1367a88a';
    const torrent1 = { infoHash: hash };
    const torrent2 = { magnet: `magnet:?xt=urn:btih:${hash}&dn=Test` };
    
    assert.strictEqual(Downloader.extractInfoHash(torrent1), hash);
    assert.strictEqual(Downloader.extractInfoHash(torrent2), hash);
  });

  it('generates valid bencoded .torrent files', async () => {
    const fakeTorrent = {
      name: 'The Matrix 1999 1080p',
      magnet: 'magnet:?xt=urn:btih:c12fe1c06bba254a9dc9f519b335aa7c1367a88a&dn=The+Matrix',
      size: 2147483648
    };

    const res = await Downloader.fetchOrGenerateTorrentBuffer(fakeTorrent, 'The Matrix');
    assert.ok(res.buffer, 'Buffer must be returned');
    assert.ok(res.buffer.length > 50, 'Buffer must have content');
    assert.strictEqual(res.filename.endsWith('.torrent'), true);
    assert.strictEqual(res.buffer.slice(0, 1).toString(), 'd', 'Must start with bencode dictionary marker');
  });
});
