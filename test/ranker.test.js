import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Ranker } from '../src/ranker.js';

describe('Ranker', () => {
  it('ranks higher resolution and healthy seed counts higher', () => {
    const torrent4K = {
      name: 'Dune.Part.Two.2024.2160p.UHD.HDR.x265.10bit-FLUX',
      seeders: 350,
      size: 15 * 1024 * 1024 * 1024,
      status: 'vip'
    };

    const torrent720p = {
      name: 'Dune.Part.Two.2024.720p.HD.x264',
      seeders: 15,
      size: 1.2 * 1024 * 1024 * 1024,
      status: 'member'
    };

    const torrentCam = {
      name: 'Dune.Part.Two.2024.HDCAM.x264',
      seeders: 500,
      size: 800 * 1024 * 1024,
      status: 'member'
    };

    const score4K = Ranker.calculateScore(torrent4K);
    const score720p = Ranker.calculateScore(torrent720p);
    const scoreCam = Ranker.calculateScore(torrentCam);

    assert.ok(score4K.score > score720p.score, '4K score should be greater than 720p score');
    assert.ok(score720p.score > scoreCam.score, '720p score should be higher than CAM score despite seeds');
    assert.strictEqual(score4K.quality, '4K UHD');
    assert.strictEqual(scoreCam.quality, 'CAM/SCR');
  });

  it('sorts a list of torrents in descending rank order', () => {
    const list = [
      { name: 'Low Quality CAM', seeders: 10, size: 500000000 },
      { name: 'Movie.2024.1080p.BluRay.x264', seeders: 150, size: 4000000000, status: 'vip' },
      { name: 'Movie.2024.720p.WEB', seeders: 40, size: 1200000000 }
    ];

    const ranked = Ranker.rankTorrents(list);
    assert.strictEqual(ranked[0].qualityBadge, '1080p HD');
    assert.ok(ranked[0].rankScore >= ranked[1].rankScore);
    assert.ok(ranked[1].rankScore >= ranked[2].rankScore);
  });
});
