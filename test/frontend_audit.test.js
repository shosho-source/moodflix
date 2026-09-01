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
});
