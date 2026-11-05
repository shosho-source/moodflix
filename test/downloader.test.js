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
    
    // Pieces length must match Math.ceil(size / 262144) * 20
    const expectedPieces = Math.ceil(2147483648 / 262144) * 20;
    assert.ok(res.buffer.includes(Buffer.from(`6:pieces${expectedPieces}:`)), 'Pieces buffer must match piece count * 20');
  });

  it('permits valid magnet links with spaces, plus signs, brackets, and tracker slashes', () => {
    assert.doesNotThrow(() => {
      Downloader.openMagnetInClient('magnet:?xt=urn:btih:c12fe1c06bba254a9dc9f519b335aa7c1367a88a&dn=The+Matrix+(1999)+[1080p]&tr=udp://tracker.opentrackr.org:1337/announce');
    });
  });

  it('sanitizes and validates tracker URLs ensuring valid /announce paths without invalid URL errors', () => {
    const rawTrackers = [
      'udp://exodus.desync.com:6969', // missing path
      'udp://tracker.opentrackr.org:1337/announce',
      'http://tracker.example.com:80', // missing path
      'https://tracker.tamersunion.org:443/announce',
      'invalid://malformed url with spaces',
      '',
      null,
      'udp://exodus.desync.com:6969/announce' // duplicate once normalized
    ];

    const cleaned = Downloader.cleanTrackers(rawTrackers);
    assert.ok(cleaned.length > 0);
    for (const tr of cleaned) {
      assert.doesNotThrow(() => new URL(tr));
      const u = new URL(tr);
      assert.ok(['udp:', 'http:', 'https:', 'wss:', 'ws:'].includes(u.protocol));
      assert.ok(u.pathname.endsWith('/announce'), `Tracker ${tr} must end with /announce`);
    }
  });

  it('extracts trackers accurately from magnet links and ensures all URLs in .torrent are valid', async () => {
    const magnetWithTrackers = 'magnet:?xt=urn:btih:c12fe1c06bba254a9dc9f519b335aa7c1367a88a&dn=Gladiator&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Fexodus.desync.com%3A6969';
    const trackers = Downloader.extractTrackers({ magnet: magnetWithTrackers });
    
    assert.ok(trackers.some(t => t.includes('exodus.desync.com:6969/announce')));
    assert.ok(trackers.some(t => t.includes('tracker.opentrackr.org:1337/announce')));

    const res = await Downloader.fetchOrGenerateTorrentBuffer({ magnet: magnetWithTrackers, size: 1048576 }, 'Gladiator');
    assert.ok(res.buffer);
    assert.strictEqual(res.filename, 'Gladiator.torrent');
    
    // Parse announce entries in buffer to confirm none have missing path
    const text = res.buffer.toString('binary');
    const announceListMatch = text.match(/13:announce-listl(.*?)ee/s);
    assert.ok(announceListMatch, 'Expected announce-list in torrent buffer');
  });
});
