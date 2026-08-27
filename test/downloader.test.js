import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Downloader } from '../src/downloader.js';

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
});
