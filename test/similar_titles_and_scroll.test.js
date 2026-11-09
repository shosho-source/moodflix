import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import app from '../server.js';
import { TMDB } from '../src/tmdb.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Similar Titles & Horizontal Mouse Scroll Suite', () => {
  let server;
  let baseUrl;

  const appJs = fs.readFileSync(path.join(rootDir, 'public', 'app.js'), 'utf-8');
  const styleCss = fs.readFileSync(path.join(rootDir, 'public', 'style.css'), 'utf-8');
  const indexHtml = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf-8');

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

  it('TMDB.getSimilarMedia returns authentic, franchise-aware recommendations for movies', async () => {
    // 155 = The Dark Knight
    const results = await TMDB.getSimilarMedia(155, 'movie');
    assert.ok(Array.isArray(results), 'returns an array');
    assert.ok(results.length >= 5, 'returns at least 5 similar titles');

    // Never recommend self
    assert.ok(!results.some(r => r.id === 155), 'does not include the source movie itself');

    // Franchise siblings / Batman universe on top
    const titles = results.map(r => r.title.toLowerCase());
    const hasFranchise = titles.some(t => t.includes('batman') || t.includes('dark knight'));
    assert.ok(hasFranchise, 'includes Batman franchise sequels/prequels in top results');

    // All results have valid poster and title
    results.forEach(item => {
      assert.ok(item.title, 'has title');
      assert.ok(item.poster, 'has poster');
      assert.strictEqual(item.category, 'similar');
    });
  });

  it('TMDB.getSimilarMedia returns highly correlated recommendations for TV shows', async () => {
    // 1396 = Breaking Bad
    const results = await TMDB.getSimilarMedia(1396, 'tv');
    assert.ok(Array.isArray(results), 'returns an array');
    assert.ok(results.length >= 5, 'returns at least 5 similar titles');

    // Never recommend self
    assert.ok(!results.some(r => r.id === 1396), 'does not include source TV show itself');

    const titles = results.map(r => r.title.toLowerCase());
    const hasSaulOrNarcos = titles.some(t => t.includes('better call saul') || t.includes('narcos') || t.includes('snowfall'));
    assert.ok(hasSaulOrNarcos, 'includes Better Call Saul or Narcos for Breaking Bad');
  });

  it('GET /api/media/:id/similar returns annotated similar titles', async () => {
    const res = await fetch(`${baseUrl}/api/media/155/similar?type=movie`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.items));
    assert.ok(data.items.length >= 5);
    assert.ok('isDownloaded' in data.items[0]);
  });

  it('UI defines horizontal mouse wheel scrolling and styled retro scrollbars on similar section', () => {
    // Check HTML elements
    assert.ok(indexHtml.includes('id="similarSection"'), 'similarSection container exists in HTML');
    assert.ok(indexHtml.includes('id="similarMediaContainer"'), 'similarMediaContainer exists in HTML');
    assert.ok(indexHtml.includes('id="btnSimilarLeft"'), 'left scroll button exists');
    assert.ok(indexHtml.includes('id="btnSimilarRight"'), 'right scroll button exists');

    // Check CSS styles for similar-grid
    assert.ok(styleCss.includes('.similar-grid {'), '.similar-grid class exists in CSS');
    assert.ok(styleCss.includes('overflow-x: auto'), 'similar-grid allows horizontal scrolling');
    assert.ok(styleCss.includes('.similar-grid::-webkit-scrollbar'), 'similar-grid has styled scrollbar');

    // Check JS wheel event binding (matching castList onwheel pattern)
    assert.ok(appJs.includes('container.onwheel = (e) => {'), 'container.onwheel is implemented in loadSimilarMedia');
    assert.ok(appJs.includes('container.scrollLeft += e.deltaY'), 'deltaY is mapped to scrollLeft');
  });
});

