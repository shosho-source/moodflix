import { describe, it } from 'node:test';
import assert from 'node:assert';
import { NameCleaner } from '../src/nameCleaner.js';

describe('NameCleaner', () => {
  it('cleans release tags, years, and codecs correctly', () => {
    const raw = 'Inception (2010) 1080p BrRip x264 - 1.85GB - YIFY';
    const cleaned = NameCleaner.clean(raw);
    assert.strictEqual(cleaned, 'Inception');
  });

  it('cleans complicated cine bay release names', () => {
    const cases = [
      { raw: 'Attack.The.Block.DVDRip.XviD-DoNE', expected: 'Attack The Block' },
      { raw: 'Finding Nemo (2003) Widescreen DVDrip V3nDetta.avi', expected: 'Finding Nemo' },
      { raw: 'Fast Five[2011]BDRip XviD-ExtraTorrentRG.avi', expected: 'Fast Five' },
      { raw: 'The.Triplets.of Belleville..2011.TS.XviD-NOVA.avi', expected: 'The Triplets of Belleville' },
      { raw: 'Submarine.2011.720p.BDRip.x264.AC3.dxva-HDLiTE', expected: 'Submarine' },
      { raw: 'DodgeBall [2004] [DVDRip XviD] [1337x]-Dita496', expected: 'DodgeBall' }
    ];

    for (const { raw, expected } of cases) {
      const cleaned = NameCleaner.clean(raw);
      assert.strictEqual(cleaned, expected);
    }
  });

  it('extracts valid release years accurately', () => {
    assert.strictEqual(new NameCleaner('Gladiator (2000) 1080p').getReleaseYear(), 2000);
    assert.strictEqual(new NameCleaner('Oppenheimer 2023').getReleaseYear(), 2023);
    assert.strictEqual(new NameCleaner('No Year In Title').getReleaseYear(), null);
    assert.strictEqual(new NameCleaner('1917 2019 1080p').getReleaseYear(), 2019);
  });

  it('preserves numeric and year-titled movies without stripping them to empty', () => {
    assert.strictEqual(NameCleaner.clean('1917'), '1917');
    assert.strictEqual(NameCleaner.clean('1984'), '1984');
    assert.strictEqual(NameCleaner.clean('2012'), '2012');
    assert.strictEqual(NameCleaner.clean('1917 (2019) 1080p BluRay'), '1917');
    assert.strictEqual(NameCleaner.clean('2012 (2009) 720p HD'), '2012');
  });
});
