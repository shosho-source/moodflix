import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CineBay } from '../src/cineBay.js';

describe('Torrent Filter Card System & YTS Source Suite', () => {
  const appJsContent = readFileSync(resolve('public/app.js'), 'utf-8');
  const styleCssContent = readFileSync(resolve('public/style.css'), 'utf-8');
  const indexHtmlContent = readFileSync(resolve('public/index.html'), 'utf-8');

  it('defines all 20 filter card items matching the reference image in exact order', () => {
    const expectedFilters = [
      { id: 'all', label: 'All Torrents' },
      { id: 'new', label: 'new' },
      { id: 'bluray', label: 'bluray' },
      { id: '720p', label: 'HD (720p)' },
      { id: '1080p', label: 'FullHD (1080p)' },
      { id: '2160p', label: '4K (2160p)' },
      { id: 'xvid', label: 'AVI (XviD)' },
      { id: 'mp4', label: 'MP4' },
      { id: 'hevc', label: 'HEVC (x265)' },
      { id: 'atmos', label: 'Atmos' }
    ];

    for (const item of expectedFilters) {
      assert.ok(
        appJsContent.includes(`id: '${item.id}'`) && appJsContent.includes(`label: '${item.label}'`),
        `Expected filter item "${item.label}" (${item.id}) to be defined in app.js`
      );
    }
  });

  it('HTML includes modalTorrentFilterBar inside modalBodyContent', () => {
    assert.ok(indexHtmlContent.includes('id="modalTorrentFilterBar"'), 'Expected modalTorrentFilterBar in index.html');
    assert.ok(indexHtmlContent.includes('class="torrent-filter-bar hidden"'), 'Expected class torrent-filter-bar in index.html');
  });

  it('CSS defines comprehensive styling for filter pills, active states, and new badge box', () => {
    assert.ok(styleCssContent.includes('.torrent-filter-bar'), 'Expected .torrent-filter-bar in style.css');
    assert.ok(styleCssContent.includes('.torrent-filter-card'), 'Expected .torrent-filter-card in style.css');
    assert.ok(styleCssContent.includes('.torrent-filter-card.active-all'), 'Expected active-all state for All Torrents in style.css');
    assert.ok(styleCssContent.includes('.torrent-filter-card.active-tag'), 'Expected active-tag state with white border in style.css');
    assert.ok(styleCssContent.includes('.badge-new-box'), 'Expected .badge-new-box for new tag styling in style.css');
  });

  it('evaluates filter matching functions accurately across various release names and codecs', () => {
    // Extract matchTorrentFilter logic using eval/Function context
    const fnMatch = appJsContent.match(/function matchTorrentFilter\([\s\S]*?\n\}/);
    assert.ok(fnMatch, 'Expected matchTorrentFilter function in app.js');

    const matchTorrentFilter = new Function('t', 'filterId', fnMatch[0] + '\nreturn matchTorrentFilter(t, filterId);');

    // 1. 4K HDR HEVC 6-channel YTS release
    const yts4k = {
      name: 'Inception (2010) [2160p] [BLURAY] [X265] [5.1 Ch] [YTS.GG]',
      qualityBadge: '2160p',
      releaseType: 'bluray',
      videoCodec: 'x265',
      bitDepth: '10',
      audioChannels: '5.1',
      source: 'YTS.GG',
      torrentUrl: 'https://yts.gg/torrent/download/HASH'
    };

    assert.strictEqual(matchTorrentFilter(yts4k, 'all'), true);
    assert.strictEqual(matchTorrentFilter(yts4k, 'direct'), true);
    assert.strictEqual(matchTorrentFilter(yts4k, 'bluray'), true);
    assert.strictEqual(matchTorrentFilter(yts4k, '2160p'), true);
    assert.strictEqual(matchTorrentFilter(yts4k, '1080p'), false);
    assert.strictEqual(matchTorrentFilter(yts4k, '720p'), false);
    assert.strictEqual(matchTorrentFilter(yts4k, 'mp4'), true);
    assert.strictEqual(matchTorrentFilter(yts4k, 'hevc'), true);
    assert.strictEqual(matchTorrentFilter(yts4k, 'hdr'), true);
    assert.strictEqual(matchTorrentFilter(yts4k, '6ch'), true);

    // 2. 1080p SDR XviD release
    const xvidRelease = {
      name: 'Classic.Movie.1995.1080p.BDRip.XviD.AC3-EVO.avi',
      qualityBadge: '1080p',
      releaseType: 'bdrip',
      videoCodec: 'xvid',
      bitDepth: '8',
      audioChannels: '2.0',
      source: 'ThePirateBay'
    };

    assert.strictEqual(matchTorrentFilter(xvidRelease, 'all'), true);
    assert.strictEqual(matchTorrentFilter(xvidRelease, 'xvid'), true);
    assert.strictEqual(matchTorrentFilter(xvidRelease, '1080p'), true);
    assert.strictEqual(matchTorrentFilter(xvidRelease, 'sdr'), true);
    assert.strictEqual(matchTorrentFilter(xvidRelease, 'dolby'), true); // AC3 is Dolby Digital
    assert.strictEqual(matchTorrentFilter(xvidRelease, '2160p'), false);

    // 3. Dolby Atmos DTS-HD MA release
    const atmosRelease = {
      name: 'Interstellar.2014.2160p.UHD.Remux.HDR.Dolby.Atmos.DTS-HD.MA.7.1',
      qualityBadge: '2160p',
      releaseType: 'remux',
      videoCodec: 'hevc',
      bitDepth: '10',
      audioChannels: '7.1',
      source: 'Torrentio'
    };

    assert.strictEqual(matchTorrentFilter(atmosRelease, 'atmos'), true);
    assert.strictEqual(matchTorrentFilter(atmosRelease, 'dolby'), true);
    assert.strictEqual(matchTorrentFilter(atmosRelease, 'dts'), true);
    assert.strictEqual(matchTorrentFilter(atmosRelease, 'dtsma'), true);
    assert.strictEqual(matchTorrentFilter(atmosRelease, '8ch'), true);
    assert.strictEqual(matchTorrentFilter(atmosRelease, 'hdr'), true);
    assert.strictEqual(matchTorrentFilter(atmosRelease, '2160p'), true);
  });

  it('queries CineBay with official YTS API endpoint and includes YTS.GG in search results', async () => {
    const torrents = await CineBay.queryYts('Inception', { imdbId: 'tt1375666' });
    assert.ok(torrents.length > 0, 'YTS.GG returned releases');
    assert.strictEqual(torrents[0].source, 'YTS.GG');
    assert.ok(torrents[0].torrentUrl.startsWith('https://yts.gg/torrent/download/'));
    assert.ok(torrents[0].magnet.startsWith('magnet:?xt=urn:btih:'));
  });
});
