import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import app from '../server.js';
import { Storage } from '../src/storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Profile & Watchlist with Google Login Integration', () => {
  const indexHtml = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf-8');
  const appJs = fs.readFileSync(path.join(rootDir, 'public', 'app.js'), 'utf-8');
  const styleCss = fs.readFileSync(path.join(rootDir, 'public', 'style.css'), 'utf-8');

  let server;
  let baseUrl;

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

  it('Desktop navigation contains Profile / Watchlist tab in place of settings', () => {
    assert.ok(
      indexHtml.includes('data-tab="profile-view"') && indexHtml.includes('Profile / Watchlist'),
      'Desktop navigation includes Profile / Watchlist tab'
    );
    // Desktop mainNav should not have settings tab
    const navMatch = indexHtml.match(/<nav class="nav-tabs" id="mainNav">([\s\S]*?)<\/nav>/);
    assert.ok(navMatch, 'mainNav found');
    assert.ok(!navMatch[1].includes('data-tab="settings-view"'), 'settings tab is replaced in desktop nav');
    assert.ok(navMatch[1].includes('data-tab="profile-view"'), 'profile tab is present in desktop nav');
  });

  it('Mobile bottom navigation contains Profile / Watchlist item', () => {
    const mobileNavMatch = indexHtml.match(/<nav class="mobile-bottom-nav[^"]*" id="mobileBottomNav"[\s\S]*?<\/nav>/);
    assert.ok(mobileNavMatch, 'mobileBottomNav found');
    assert.ok(mobileNavMatch[0].includes('data-tab="profile-view"'), 'mobile nav includes profile tab');
  });

  it('Initial Google login blocking screen is removed and guest mode is enabled', () => {
    // Top-level auth-view is not gating the site
    assert.ok(!indexHtml.includes('<section id="auth-view"'), 'standalone blocking auth-view section removed from index.html');
    // JavaScript boots to dashboard/guest mode instead of locking with showAuthView()
    assert.ok(appJs.includes('await showDashboardView(null)'), 'guest fallback launches dashboard directly');
  });

  it('Profile view contains Google Sign-In and user profile states', () => {
    assert.ok(indexHtml.includes('id="profile-view"'), 'profile-view panel exists in HTML');
    assert.ok(indexHtml.includes('id="google-login-btn"'), 'google-login-btn exists inside profile view');
    assert.ok(indexHtml.includes('CONTINUE WITH GOOGLE'), 'Google sign-in CTA button text exists');
    assert.ok(indexHtml.includes('id="profileGuestCard"'), 'guest card exists');
    assert.ok(indexHtml.includes('id="profileUserCard"'), 'user card exists');
    assert.ok(indexHtml.includes('id="profileLogoutBtn"'), 'profile logout button exists');
  });

  it('Watchlist UI elements are defined in HTML and Detail View', () => {
    assert.ok(indexHtml.includes('id="watchlistGrid"'), 'watchlistGrid exists');
    assert.ok(indexHtml.includes('id="watchlistEmptyState"'), 'watchlistEmptyState exists');
    assert.ok(indexHtml.includes('id="watchlistCountBadge"'), 'watchlistCountBadge exists');
    assert.ok(indexHtml.includes('id="detailWatchlistBtn"'), 'detailWatchlistBtn exists in detail actions');
  });

  it('CSS defines full styles for Profile view, Watchlist cards, and active states', () => {
    assert.ok(styleCss.includes('.profile-page-container'), 'profile container styles exist');
    assert.ok(styleCss.includes('.watchlist-grid'), 'watchlist grid styles exist');
    assert.ok(styleCss.includes('.watchlist-item-card'), 'watchlist card styles exist');
    assert.ok(styleCss.includes('.active-watchlist'), 'active-watchlist button style exists');
  });

  it('Storage and API endpoints manage watchlist items accurately', async () => {
    // Clear initial
    Storage.clearWatchlist();

    const sampleMovie = {
      id: 'movie-test-999',
      title: 'Inception Test',
      year: 2010,
      poster: 'https://example.com/inception.jpg',
      rating: 8.8,
      mediaType: 'movie',
      synopsis: 'A dream within a dream.'
    };

    // POST /api/watchlist
    const postRes = await fetch(`${baseUrl}/api/watchlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sampleMovie)
    });
    const postData = await postRes.json();
    assert.strictEqual(postRes.status, 200);
    assert.strictEqual(postData.success, true);
    assert.ok(postData.count >= 1);

    // GET /api/watchlist
    const getRes = await fetch(`${baseUrl}/api/watchlist`);
    const getData = await getRes.json();
    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(getData.success, true);
    const found = getData.watchlist.some(w => (w.title || w) === 'Inception Test');
    assert.ok(found, 'Added movie found in watchlist');

    // DELETE /api/watchlist/:id
    const delRes = await fetch(`${baseUrl}/api/watchlist/Inception%20Test`, { method: 'DELETE' });
    assert.strictEqual(delRes.status, 200);
    const checkRes = await fetch(`${baseUrl}/api/watchlist`);
    const checkData = await checkRes.json();
    const stillFound = checkData.watchlist.some(w => (w.title || w) === 'Inception Test');
    assert.strictEqual(stillFound, false, 'Movie removed from watchlist');

    // Clean up
    Storage.clearWatchlist();
  });
});
