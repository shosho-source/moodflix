import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('TV Series Season Accordion & Loading Animation Suite', () => {
  const appJs = fs.readFileSync(path.join(rootDir, 'public', 'app.js'), 'utf-8');
  const styleCss = fs.readFileSync(path.join(rootDir, 'public', 'style.css'), 'utf-8');

  it('defines loadTVSeasonsAccordion, toggleSeasonAccordion, and toggleEpisodeAccordion on window', () => {
    assert.ok(appJs.includes('async function loadTVSeasonsAccordion'), 'loadTVSeasonsAccordion is defined');
    assert.ok(appJs.includes('window.toggleSeasonAccordion'), 'window.toggleSeasonAccordion is exposed');
    assert.ok(appJs.includes('window.toggleEpisodeAccordion'), 'window.toggleEpisodeAccordion is exposed');
  });

  it('renders season-acc container with structured button and status element', () => {
    assert.ok(appJs.includes('id="season-acc-${s.season_number}"'), 'season-acc item container id is preserved');
    assert.ok(appJs.includes('class="accordion-btn"'), 'accordion-btn is present');
    assert.ok(appJs.includes('class="season-btn-status"'), 'season-btn-status element exists for live loading feedback');
    assert.ok(appJs.includes('class="accordion-arrow"'), 'accordion arrow exists for expansion state');
  });

  it('does NOT use fragile inline JSON.stringify in onclick attributes that break on quotes', () => {
    assert.ok(!appJs.includes("onclick=\"toggleSeasonAccordion(${s.season_number}, '${encodeURIComponent(JSON.stringify(m))}')\""), 'inline stringified quote-breaking handler is eliminated from seasons');
    assert.ok(!appJs.includes("onclick=\"toggleEpisodeAccordion(${seasonNumber}, ${e.episode_number}, '${encodeURIComponent(JSON.stringify(m))}')\""), 'inline stringified quote-breaking handler is eliminated from episodes');
  });

  it('injects radar scanning loader into accordion and episode content while loading', () => {
    assert.ok(appJs.includes('content.innerHTML = getTorrentLoadingHtml('), 'accordion content displays getTorrentLoadingHtml animation');
    assert.ok(appJs.includes('btn.classList.add(\'is-loading\')'), 'button receives is-loading class during fetch');
    assert.ok(appJs.includes('btn.classList.remove(\'is-loading\')'), 'button removes is-loading class in finally block');
  });

  it('CSS defines comprehensive styling for accordion, loading states, and animations', () => {
    assert.ok(styleCss.includes('.accordion-item'), '.accordion-item styling exists');
    assert.ok(styleCss.includes('.accordion-btn.expanded'), '.accordion-btn.expanded styling exists');
    assert.ok(styleCss.includes('.accordion-btn.is-loading'), '.accordion-btn.is-loading styling exists');
    assert.ok(styleCss.includes('.episode-btn.is-loading'), '.episode-btn.is-loading styling exists');
    assert.ok(styleCss.includes('@keyframes accordionFadeIn'), 'accordion fade-in animation exists');
    assert.ok(styleCss.includes('@keyframes episodeFadeIn'), 'episode fade-in animation exists');
    assert.ok(styleCss.includes('.accordion-content .torrent-fetch-loader'), 'nested radar loader styling exists');
    assert.ok(styleCss.includes('.btn-try-again'), '.btn-try-again styling exists in CSS');
  });

  it('renders a small try again button when torrents are not found or fail', () => {
    assert.ok(appJs.includes('btn-try-again'), 'btn-try-again class is used in empty/error states');
    assert.ok(appJs.includes('TRY AGAIN'), 'TRY AGAIN label is present on retry buttons');
    assert.ok(appJs.includes('modalEmptyRetryBtn'), 'modal empty state defines retry button');
    assert.ok(appJs.includes('ep-retry-btn'), 'episode empty state defines retry button');
  });
});
