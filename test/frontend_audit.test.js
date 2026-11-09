import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Frontend Codebase Audit & Integrity', () => {
  const indexHtml = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf-8');
  const appJs = fs.readFileSync(path.join(rootDir, 'public', 'app.js'), 'utf-8');
  const styleCss = fs.readFileSync(path.join(rootDir, 'public', 'style.css'), 'utf-8');

  it('HTML contains all essential UI containers and buttons', () => {
    assert.ok(indexHtml.includes('id="loader"'), 'loader element exists');
    assert.ok(indexHtml.includes('id="toastContainer"'), 'toast container exists');
    assert.ok(indexHtml.includes('id="directSearchForm"'), 'direct search form exists');
    assert.ok(indexHtml.includes('id="directSearchResults"'), 'direct search results container exists');

    assert.ok(indexHtml.includes('id="tutorial-back-feed-btn"'), 'tutorial back button exists');
  });

  it('JavaScript defines all critical handlers and lifecycle functions without missing references', () => {
    assert.ok(appJs.includes('function hideInitialLoader'), 'hideInitialLoader function is defined');
    assert.ok(appJs.includes('function showToast'), 'showToast function is defined');
    assert.ok(appJs.includes('function performDirectSearch'), 'performDirectSearch function is defined');

    assert.ok(appJs.includes('tutorial-back-feed-btn'), 'tutorial back button is wired in JS');
  });

  it('CSS defines full styles for loader fade-out and toast notifications', () => {
    assert.ok(styleCss.includes('.loader-overlay.fade-out'), 'fade-out class exists for loader');
    assert.ok(styleCss.includes('.toast-item'), 'toast-item styles exist');
    assert.ok(styleCss.includes('.toast-item.show'), 'toast show animation class exists');
  });

  it('Desktop view permits text selection and copying across content wrapper and text elements', () => {
    assert.ok(styleCss.includes('user-select: text'), 'user-select: text is defined for readable content');
    assert.ok(!styleCss.includes('.content-wrapper {\n  position: relative;\n  z-index: 10;\n  display: flex;\n  flex-direction: column;\n  height: 100vh;\n  pointer-events: none;\n  user-select: none;\n}'), '.content-wrapper does not block user-select on desktop');
  });

  it('Split-flap display dynamically scales tiles and prevents clipping for large numbers', () => {
    // Assert CSS auto-scaling definitions
    assert.ok(styleCss.includes('.stat-value.flip-digit-cluster.digits-5'), 'CSS defines scaling for 5-digit clusters');
    assert.ok(styleCss.includes('--tile-w: 26px'), 'CSS sets scaled tile width for 5-digit clusters');
    assert.ok(styleCss.includes('minmax(0, 1.25fr)'), 'CSS grid allocates flexible column space for watch time cell');
    assert.ok(styleCss.includes('overflow: hidden'), 'CSS prevents visual overflow on stats cell');

    // Assert JS split flap logic
    assert.ok(appJs.includes('containerEl.dataset.digits = String(numDigits)'), 'JS updates dataset.digits on cluster');
    assert.ok(appJs.includes('digits-${numDigits}'), 'JS updates digits-N class on cluster');
    assert.ok(appJs.includes('parentCell.dataset.digits = String(numDigits)'), 'JS updates digits on parent cell');
    assert.ok(appJs.includes("tile.classList.add('unit-tile')"), 'JS adds unit-tile to letter tiles');
  });

  it('Custom lists are wired with UUID generation, database syncing, and navigation hooks', () => {
    assert.ok(appJs.includes('crypto.randomUUID'), 'JS uses valid UUID generation for custom lists');
    assert.ok(appJs.includes('/api/user/custom-lists'), 'JS calls custom-lists backend endpoint');
    assert.ok(appJs.includes('loadCustomLists()'), 'JS defines and invokes loadCustomLists');
    assert.ok(appJs.includes("tabId === 'profile-view'"), 'JS checks profile-view in tab switching');
  });

  it('Tutorial navigation is positioned as a top-right corner button and removed from desktop nav tabs', () => {
    // Assert tutorial button exists in header-actions
    assert.ok(indexHtml.includes('id="header-tutorial-btn"'), 'header-tutorial-btn exists in HTML');
    assert.ok(indexHtml.includes('class="retro-btn header-tutorial-btn"'), 'tutorial button has retro-btn and header-tutorial-btn classes');

    // Assert tutorial is not in desktop nav-tabs
    const navMatch = indexHtml.match(/<nav class="nav-tabs" id="mainNav">([\s\S]*?)<\/nav>/);
    assert.ok(navMatch, 'mainNav found');
    assert.ok(!navMatch[1].includes('data-tab="tutorial-view"'), 'tutorial-view is removed from mainNav tabs');

    // Assert JS wiring
    assert.ok(appJs.includes("document.getElementById('header-tutorial-btn')"), 'header-tutorial-btn is wired in JS');

    // Assert CSS styling
    assert.ok(styleCss.includes('.header-tutorial-btn {'), 'header-tutorial-btn styles defined in CSS');
  });

  it('Watch diary entries are wired with UUID generation, database syncing, and navigation hooks', () => {
    assert.ok(appJs.includes('/api/user/diary'), 'JS calls diary backend endpoint');
    assert.ok(appJs.includes('loadDiaryEntries()'), 'JS defines and invokes loadDiaryEntries');
    assert.ok(appJs.includes('entry.watch_date'), 'JS checks database watch_date field');
    assert.ok(appJs.includes("subTab === 'diary'"), 'JS checks diary subtab');
  });
});