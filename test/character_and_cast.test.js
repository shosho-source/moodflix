import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TMDB } from '../src/tmdb.js';

describe('Character Search and Movie Cast Integration', () => {
  it('searching character "barney stinson" returns Neil Patrick Harris with characterPlayed', async () => {
    const results = await TMDB.searchArtists('barney stinson');
    assert.ok(results.length > 0, 'Should find at least 1 actor for Barney Stinson');
    assert.strictEqual(results[0].name, 'Neil Patrick Harris');
    assert.strictEqual(results[0].characterPlayed, 'Barney Stinson');
    assert.strictEqual(results[0].isCharacterMatch, true);
  });

  it('searching character "superman" returns list of actors who played Superman', async () => {
    const results = await TMDB.searchArtists('superman');
    assert.ok(results.length >= 4, 'Should return multiple actors who portrayed Superman');
    const names = results.map(r => r.name);
    assert.ok(names.includes('Henry Cavill'), 'Should include Henry Cavill');
    assert.ok(names.includes('Christopher Reeve'), 'Should include Christopher Reeve');
    assert.ok(results.every(r => r.characterPlayed === 'Superman'));
  });

  it('searching character "batman" returns list of actors who played Batman', async () => {
    const results = await TMDB.searchArtists('batman');
    assert.ok(results.length >= 4, 'Should return multiple actors who portrayed Batman');
    const names = results.map(r => r.name);
    assert.ok(names.includes('Christian Bale'), 'Should include Christian Bale');
    assert.ok(names.includes('Robert Pattinson'), 'Should include Robert Pattinson');
    assert.ok(names.includes('Ben Affleck'), 'Should include Ben Affleck');
    assert.ok(results.every(r => r.characterPlayed === 'Batman'));
  });

  it('TMDB.getDetails includes top cast members for movies', async () => {
    const details = await TMDB.getDetails(27205, 'movie'); // Inception
    assert.ok(details, 'Details should be returned');
    assert.ok(Array.isArray(details.cast), 'Cast should be an array');
    assert.ok(details.cast.length > 0, 'Cast array should not be empty');
    
    const leo = details.cast.find(c => c.name.includes('DiCaprio'));
    assert.ok(leo, 'Leonardo DiCaprio should be in Inception cast');
    assert.ok(leo.character.toLowerCase().includes('cobb'), 'Character should be Dom Cobb');
    assert.ok(typeof leo.id === 'number', 'Cast member should have a numeric TMDB id');
  });

  it('TMDB.getDetails includes cast members for TV shows', async () => {
    const details = await TMDB.getDetails(1100, 'tv'); // How I Met Your Mother
    assert.ok(details, 'Details should be returned');
    assert.ok(Array.isArray(details.cast), 'Cast should be an array');
    assert.ok(details.cast.length > 0, 'TV cast array should not be empty');

    const nph = details.cast.find(c => c.name.includes('Neil Patrick Harris'));
    assert.ok(nph, 'Neil Patrick Harris should be in HIMYM cast');
    assert.ok(nph.character.toLowerCase().includes('barney'), 'Character should be Barney Stinson');
  });

  it('verifies HTML and CSS define responsive and accessible cast section elements', async () => {
    const fs = await import('fs');
    const html = fs.readFileSync('public/index.html', 'utf8');
    const css = fs.readFileSync('public/style.css', 'utf8');

    assert.ok(html.includes('id="detailCastSection"'), 'HTML must have #detailCastSection');
    assert.ok(html.includes('id="detailCastList"'), 'HTML must have #detailCastList');
    assert.ok(html.includes('id="btnCastLeft"'), 'HTML must have #btnCastLeft');
    assert.ok(html.includes('id="btnCastRight"'), 'HTML must have #btnCastRight');

    assert.ok(css.includes('.detail-cast-section'), 'CSS must define .detail-cast-section');
    assert.ok(css.includes('.detail-cast-list'), 'CSS must define .detail-cast-list');
    assert.ok(css.includes('.detail-cast-card'), 'CSS must define .detail-cast-card');
    assert.ok(css.includes('min-width: 0;'), 'CSS must constrain min-width to prevent flex overflow');
  });
});
