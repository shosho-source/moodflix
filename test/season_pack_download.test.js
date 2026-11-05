import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import app from '../server.js';
import { CineBay } from '../src/cineBay.js';
import { Downloader } from '../src/downloader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Whole Season 1-Torrent Download Suite (TV & Anime)', () => {
  let server;
  let baseUrl;

  const indexHtml = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf-8');
  const appJs = fs.readFileSync(path.join(rootDir, 'public', 'app.js'), 'utf-8');
  const styleCss = fs.readFileSync(path.join(rootDir, 'public', 'style.css'), 'utf-8');

  before(async () => {
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('CineBay.isSeasonPackName accurately evaluates season batches and rejects single episodes', () => {
    // TV Series Season Packs
    assert.strictEqual(CineBay.isSeasonPackName('Breaking.Bad.SEASON.01.S01.COMPLETE.1080p.10bit', 1), true);
    assert.strictEqual(CineBay.isSeasonPackName('Breaking Bad (2008) S01 (2160p AMZN WEB-DL)', 1), true);
    assert.strictEqual(CineBay.isSeasonPackName('Breaking Bad S01-S05 Complete 720p', 1), true);
    assert.strictEqual(CineBay.isSeasonPackName('Breaking Bad S01-S05 Complete 720p', 3), true);
    assert.strictEqual(CineBay.isSeasonPackName('Breaking Bad S01-S05 Complete 720p', 6), false);

    // Anime Batches
    assert.strictEqual(CineBay.isSeasonPackName('[Erai-raws] Death Note - 01 ~ 37 [1080p][BATCH]', 1), true);
    assert.strictEqual(CineBay.isSeasonPackName('[Judas] Shingeki no Kyojin (Season 1) [BD 1080p][Batch]', 1), true);
    assert.strictEqual(CineBay.isSeasonPackName('[Judas] Shingeki no Kyojin (Season 2) [BD 1080p][Batch]', 1), false);
    assert.strictEqual(CineBay.isSeasonPackName('[Judas] Shingeki no Kyojin (Season 2) [BD 1080p][Batch]', 2), true);
    assert.strictEqual(CineBay.isSeasonPackName('Attack on Titan Seasons 1 to 4 Complete 1080p', 1), true);

    // Single episodes must be rejected
    assert.strictEqual(CineBay.isSeasonPackName('Breaking Bad S01E07 A No-Rough-Stuff-Type Deal 1080p', 1), false);
    assert.strictEqual(CineBay.isSeasonPackName('Attack on Titan S02E04 1080p', 2), false);
  });

  it('CineBay.searchSeasonPack returns whole-season torrents for TV series', async () => {
    const torrents = await CineBay.searchSeasonPack('Breaking Bad', 1);
    assert.ok(Array.isArray(torrents), 'returns array of torrents');
    assert.ok(torrents.length > 0, 'finds season 1 pack releases');

    const top = torrents[0];
    assert.ok(top.name, 'torrent has a name');
    assert.ok(top.magnet && top.magnet.startsWith('magnet:?'), 'has valid magnet link');
    assert.strictEqual(top.isSeasonPack, true, 'flagged as isSeasonPack');
    assert.strictEqual(top.season, 1, 'tagged with season 1');

    // Confirm that torrent names represent whole season/batch
    const anyPack = torrents.some(t => CineBay.isSeasonPackName(t.name, 1));
    assert.ok(anyPack, 'at least one release matches whole season naming');
  });

  it('CineBay.searchSeasonPack returns complete batches for Anime series', async () => {
    const torrents = await CineBay.searchSeasonPack('Attack on Titan', 1);
    assert.ok(Array.isArray(torrents), 'returns array of torrents');
    assert.ok(torrents.length > 0, 'finds anime season 1 releases');

    const anyBatch = torrents.some(t => /(batch|complete|collection|s0?1|season\s*1)/i.test(t.name));
    assert.ok(anyBatch, 'contains anime batch or season pack releases');
  });

  it('GET /api/season/torrents returns whole-season torrents', async () => {
    const res = await fetch(`${baseUrl}/api/season/torrents?title=Breaking%20Bad&season=1&type=tv`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.strictEqual(data.success, true);
    assert.strictEqual(data.season, 1);
    assert.ok(Array.isArray(data.torrents));
    assert.ok(data.torrents.length > 0);
    assert.ok(data.torrents[0].magnet.startsWith('magnet:?'));
  });

  it('GET /api/search with isSeasonPack=true returns whole-season torrents', async () => {
    const res = await fetch(`${baseUrl}/api/search?q=Breaking%20Bad&season=1&isSeasonPack=true&type=tv&category=205`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.torrents));
    assert.ok(data.torrents.length > 0);
  });

  it('GET /api/torrent/download generates valid .torrent file for a season pack', async () => {
    const samplePackMagnet = 'magnet:?xt=urn:btih:e2b01ba1df534cb007869cfb7e121a8e18e573ea&dn=Breaking.Bad.S01.Complete.1080p';
    const params = new URLSearchParams({
      magnet: samplePackMagnet,
      title: 'Breaking Bad Season 1 Complete',
      name: 'Breaking.Bad.S01.Complete.1080p'
    });

    const res = await fetch(`${baseUrl}/api/torrent/download?${params.toString()}`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type')?.includes('application/x-bittorrent'));
    const disposition = res.headers.get('content-disposition') || '';
    assert.ok(disposition.includes('.torrent'));

    const buf = Buffer.from(await res.arrayBuffer());
    assert.ok(buf.length > 50, 'downloaded buffer is non-trivial');
    assert.strictEqual(buf.slice(0, 1).toString(), 'd', 'valid bencoded dictionary start');
  });

  it('Detail View does not include redundant standalone button; season pack is inside torrents tab', () => {
    assert.ok(!indexHtml.includes('id="detailSeasonPackBtn"'), 'detailSeasonPackBtn removed from HTML');
  });

  it('JavaScript defines loadSeasonPackTorrents and binds accordion whole-season controls', () => {
    assert.ok(appJs.includes('loadSeasonPackTorrents'), 'loadSeasonPackTorrents function is defined');
    assert.ok(appJs.includes('btn-season-pack-quick'), 'quick season pack button is handled');
    assert.ok(appJs.includes('btn-load-season-pack'), 'season pack load CTA is bound');
    assert.ok(appJs.includes('season-pack-results'), 'season pack results container is rendered');
  });

  it('CSS defines comprehensive styles for season pack banner, quick button, and results', () => {
    assert.ok(styleCss.includes('.btn-season-pack-quick'), '.btn-season-pack-quick styles defined');
    assert.ok(styleCss.includes('.season-pack-banner'), '.season-pack-banner styles defined');
    assert.ok(styleCss.includes('.season-pack-results-area'), '.season-pack-results-area styles defined');
  });
});
