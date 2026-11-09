import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Quick Add Multiples & Mobile Z-Index Suite', () => {
  const styleCss = fs.readFileSync(path.resolve('public/style.css'), 'utf8');
  const appJs = fs.readFileSync(path.resolve('public/app.js'), 'utf8');

  it('mobile-bottom-nav has higher z-index (5000) than in-flow content on mobile', () => {
    // Check mobile-bottom-nav z-index
    assert.ok(
      styleCss.includes('z-index: 5000 !important;'),
      'mobile-bottom-nav should have z-index: 5000 !important'
    );

    // Verify rapid-entry-container does not have 1050 or higher z-index that overlaps mobile nav
    assert.strictEqual(
      styleCss.includes('.rapid-entry-container {\r\n    width: 100% !important;\r\n    max-width: 100% !important;\r\n    min-width: 0 !important;\r\n    box-sizing: border-box !important;\r\n    flex-direction: column !important;\r\n    gap: 8px !important;\r\n    margin-bottom: 14px !important;\r\n    position: relative !important;\r\n    z-index: 1050 !important;') ||
      styleCss.includes('z-index: 1050 !important;'),
      false,
      'rapid-entry-container must not have z-index 1050 !important'
    );
  });

  it('rapid-entry-container and rapid-search-dropdown have controlled z-indexes (60 and 70)', () => {
    assert.ok(styleCss.includes('z-index: 60 !important;'), 'rapid-entry-container mobile z-index should be 60');
    assert.ok(styleCss.includes('z-index: 70 !important;'), 'rapid-search-dropdown mobile z-index should be 70');
    assert.ok(styleCss.includes('z-index: 60;'), 'rapid-entry-container desktop z-index should be 60');
    assert.ok(styleCss.includes('z-index: 70;'), 'rapid-search-dropdown desktop z-index should be 70');
  });

  it('app.js does not collapse rapid search dropdown upon adding an item', () => {
    // Find handleRapidSearchInput in app.js
    const searchFnIndex = appJs.indexOf('async function handleRapidSearchInput');
    assert.ok(searchFnIndex > 0, 'handleRapidSearchInput must exist in app.js');

    const fnChunk = appJs.slice(searchFnIndex, searchFnIndex + 8000);

    // It should NOT collapse the dropdown in row click
    assert.strictEqual(
      fnChunk.includes("setTimeout(() => {\r\n          dropdown.classList.add('hidden');") ||
      fnChunk.includes("setTimeout(() => {\n          dropdown.classList.add('hidden');"),
      false,
      'handleRapidSearchInput must not collapse dropdown after adding an item'
    );

    // It should add in-watchlist class to the row and mark button added
    assert.ok(fnChunk.includes("row.classList.add('in-watchlist')"), 'Should mark row as in-watchlist');
    assert.ok(fnChunk.includes("addBtn.classList.add('is-added')"), 'Should mark addBtn as is-added');

    // It should provide a close button in the header
    assert.ok(fnChunk.includes('rapid-header-close-btn'), 'Should provide rapid-header-close-btn');
  });

  it('style.css defines styling for rapid-header-close-btn and rapid-result-row.in-watchlist', () => {
    assert.ok(styleCss.includes('.rapid-header-close-btn'), 'style.css should style .rapid-header-close-btn');
    assert.ok(styleCss.includes('.rapid-result-row.in-watchlist'), 'style.css should style .rapid-result-row.in-watchlist');
  });
});
