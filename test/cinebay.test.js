import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CineBay } from '../src/cineBay.js';

describe('CineBay Torrent Provider', () => {
  it('builds standard BitTorrent magnet links correctly', () => {
    const hash = '2849211f150e966ef7924f43aec22727a644e10d';
    const name = 'Inception.2010.1080p';
    const magnet = CineBay.buildMagnet(hash, name);
    assert.ok(magnet.startsWith('magnet:?xt=urn:btih:2849211f150e966ef7924f43aec22727a644e10d'));
    assert.ok(magnet.includes(encodeURIComponent(name)));
    assert.ok(magnet.includes('tracker.opentrackr.org'));
  });

  it('searches and returns high-speed verified torrent streams', async () => {
    const results = await CineBay.search('Inception');
    assert.ok(results.length > 0, 'Expected at least 1 torrent to be returned');
    const topResult = results[0];
    assert.ok(topResult.name, 'Expected torrent to have name');
    assert.ok(topResult.infoHash, 'Expected torrent to have infoHash');
    assert.ok(topResult.magnet, 'Expected torrent to have magnet URL');
    assert.ok(topResult.magnet.startsWith('magnet:?'));
  });
});
