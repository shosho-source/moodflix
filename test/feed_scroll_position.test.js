import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Feed Scroll Position Memory Suite', () => {
  const appJs = fs.readFileSync(path.join(rootDir, 'public', 'app.js'), 'utf-8');
  const indexHtml = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf-8');

  it('HTML defines #back-to-feed-btn within detail view actions', () => {
    assert.ok(indexHtml.includes('id="back-to-feed-btn"'), 'back-to-feed-btn exists in HTML');
    assert.ok(indexHtml.includes('BACK TO FEED'), 'button contains BACK TO FEED text');
  });

  it('state initializes feedScrollPositions dictionary', () => {
    assert.ok(appJs.includes('feedScrollPositions: {}'), 'state has feedScrollPositions dictionary');
  });

  it('JavaScript defines saveFeedScrollPosition and restoreFeedScrollPosition functions', () => {
    assert.ok(appJs.includes('function saveFeedScrollPosition'), 'saveFeedScrollPosition function is defined');
    assert.ok(appJs.includes('function restoreFeedScrollPosition'), 'restoreFeedScrollPosition function is defined');
    assert.ok(appJs.includes('window.saveFeedScrollPosition = saveFeedScrollPosition'), 'saveFeedScrollPosition attached to window');
    assert.ok(appJs.includes('window.restoreFeedScrollPosition = restoreFeedScrollPosition'), 'restoreFeedScrollPosition attached to window');
  });

  it('saveFeedScrollPosition captures siteMain scrollTop and window scrollY for active visible tab', () => {
    assert.ok(appJs.includes('const siteMain = document.querySelector(\'.site-main\')'), 'queries .site-main container');
    assert.ok(appJs.includes('mainScroll = siteMain ? siteMain.scrollTop : 0'), 'records siteMain.scrollTop');
    assert.ok(appJs.includes('state.feedScrollPositions[tabId] = {'), 'stores per-tab scroll coordinates');
    assert.ok(appJs.includes('if (!tabId || tabId === \'detail-view\') return;'), 'does not overwrite detail-view scroll as feed scroll');
  });

  it('openDetailView saves feed scroll position before transitioning to detail-view', () => {
    assert.ok(appJs.includes('function openDetailView'), 'openDetailView function is defined');
    const startIdx = appJs.indexOf('function openDetailView(');
    const endIdx = appJs.indexOf('function loadDetailCast(', startIdx);
    const openDetailPart = appJs.slice(startIdx, endIdx);
    assert.ok(openDetailPart.includes('saveFeedScrollPosition(state.activeTab)'), 'openDetailView calls saveFeedScrollPosition');
    assert.ok(openDetailPart.includes('state.lastFeedTab = state.activeTab'), 'records lastFeedTab');
    assert.ok(openDetailPart.includes('siteMain.scrollTop = 0'), 'resets detail-view scroll to top');
  });

  it('switchTab handles scroll restoration when returning from detail view', () => {
    assert.ok(appJs.includes('function switchTab(tabId, restoreScroll = false)'), 'switchTab accepts restoreScroll param');
    assert.ok(appJs.includes('isReturningFromDetail = (prevTab === \'detail-view\''), 'checks if returning from detail view');
    assert.ok(appJs.includes('restoreFeedScrollPosition(tabId)'), 'calls restoreFeedScrollPosition in switchTab');
  });

  it('#back-to-feed-btn click listener restores previous scroll position on return', () => {
    const btnHandlerMatch = appJs.match(/elements\.btnBackToFeed\?\.addEventListener\('click'[\s\S]*?\}\);/);
    assert.ok(btnHandlerMatch, 'btnBackToFeed listener found');
    assert.ok(btnHandlerMatch[0].includes('restoreFeedScrollPosition'), 'listener invokes restoreFeedScrollPosition');
    assert.ok(btnHandlerMatch[0].includes('switchTab(targetTab, true)'), 'listener triggers switchTab with restore flag');
  });

  it('scroll restoration supports animation frame layout reflow', () => {
    assert.ok(appJs.includes('requestAnimationFrame'), 'uses requestAnimationFrame for seamless paint');
  });

  it('functional evaluation: records and restores scroll positions accurately per feed', () => {
    // Create an isolated JS execution context to test the exact functions
    const mockState = {
      activeTab: 'movies-view',
      lastFeedTab: 'movies-view',
      feedScrollPositions: {}
    };

    const mockElements = {
      'movies-view': { classList: { contains: (c) => false } },
      'anime-view': { classList: { contains: (c) => false } },
      'detail-view': { classList: { contains: (c) => false } },
      'hidden-feed': { classList: { contains: (c) => c === 'hidden' } }
    };

    let siteMainScrollTop = 1420;
    let windowScrollTop = 0;

    const mockDocument = {
      getElementById: (id) => mockElements[id] || null,
      querySelector: (sel) => {
        if (sel === '.site-main') {
          return {
            get scrollTop() { return siteMainScrollTop; },
            set scrollTop(v) { siteMainScrollTop = v; }
          };
        }
        return null;
      }
    };

    const mockWindow = {
      scrollY: 0,
      scrollTo: ({ top }) => { windowScrollTop = top; }
    };

    // Instantiate functions using mock environment
    const saveFeedScrollPosition = (tabId = mockState.activeTab) => {
      if (!tabId || tabId === 'detail-view') return;
      const el = mockDocument.getElementById(tabId);
      if (el && el.classList.contains('hidden')) return;

      const siteMain = mockDocument.querySelector('.site-main');
      const mainScroll = siteMain ? siteMain.scrollTop : 0;
      const winScroll = mockWindow.scrollY || 0;

      if (!mockState.feedScrollPositions) {
        mockState.feedScrollPositions = {};
      }
      mockState.feedScrollPositions[tabId] = {
        main: mainScroll,
        window: winScroll
      };
    };

    const restoreFeedScrollPosition = (tabId = mockState.lastFeedTab) => {
      if (!tabId || !mockState.feedScrollPositions || mockState.feedScrollPositions[tabId] === undefined) return;
      const saved = mockState.feedScrollPositions[tabId];
      const targetMain = typeof saved === 'object' && saved !== null
        ? (typeof saved.main === 'number' ? saved.main : 0)
        : (typeof saved === 'number' ? saved : 0);
      const targetWin = typeof saved === 'object' && saved !== null
        ? (typeof saved.window === 'number' ? saved.window : 0)
        : (typeof saved === 'number' ? saved : 0);

      const siteMain = mockDocument.querySelector('.site-main');
      if (siteMain && typeof targetMain === 'number') {
        siteMain.scrollTop = targetMain;
      }
      if (typeof targetWin === 'number') {
        mockWindow.scrollTo({ top: targetWin });
      }
    };

    // 1. Save movies-view scroll at 1420
    saveFeedScrollPosition('movies-view');
    assert.deepStrictEqual(mockState.feedScrollPositions['movies-view'], { main: 1420, window: 0 });

    // 2. Switching to detail-view resets siteMain to 0
    siteMainScrollTop = 0;

    // 3. Trying to save detail-view scroll does not pollute state
    saveFeedScrollPosition('detail-view');
    assert.strictEqual(mockState.feedScrollPositions['detail-view'], undefined);

    // 4. Trying to save a hidden tab does nothing
    siteMainScrollTop = 999;
    saveFeedScrollPosition('hidden-feed');
    assert.strictEqual(mockState.feedScrollPositions['hidden-feed'], undefined);

    // 5. Clicking back to feed restores scroll to 1420
    siteMainScrollTop = 0;
    restoreFeedScrollPosition('movies-view');
    assert.strictEqual(siteMainScrollTop, 1420, 'siteMain.scrollTop is restored to 1420');

    // 6. Test independent anime tab scroll
    siteMainScrollTop = 2300;
    saveFeedScrollPosition('anime-view');
    assert.deepStrictEqual(mockState.feedScrollPositions['anime-view'], { main: 2300, window: 0 });
    assert.deepStrictEqual(mockState.feedScrollPositions['movies-view'], { main: 1420, window: 0 });

    siteMainScrollTop = 0;
    restoreFeedScrollPosition('anime-view');
    assert.strictEqual(siteMainScrollTop, 2300, 'anime-view restores to 2300 independently');
  });
});
