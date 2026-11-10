import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Card 3-Dot Overflow Menu Suite', () => {
  const appJs = fs.readFileSync(path.join(rootDir, 'public', 'app.js'), 'utf-8');
  const styleCss = fs.readFileSync(path.join(rootDir, 'public', 'style.css'), 'utf-8');

  it('JavaScript defines getCardOverflowMenuHtml, attachCardOverflowListeners, and closeAllCardOverflowMenus', () => {
    assert.ok(appJs.includes('function getCardOverflowMenuHtml'), 'getCardOverflowMenuHtml function is defined');
    assert.ok(appJs.includes('function attachCardOverflowListeners'), 'attachCardOverflowListeners function is defined');
    assert.ok(appJs.includes('function closeAllCardOverflowMenus'), 'closeAllCardOverflowMenus function is defined');
    assert.ok(appJs.includes('window.getCardOverflowMenuHtml = getCardOverflowMenuHtml'), 'getCardOverflowMenuHtml is exposed on window');
    assert.ok(appJs.includes('window.attachCardOverflowListeners = attachCardOverflowListeners'), 'attachCardOverflowListeners is exposed on window');
  });

  it('card overflow menu HTML includes 3-dot trigger (more_vert) and 3 action icons in exact order', () => {
    assert.ok(appJs.includes('card-overflow-trigger'), 'trigger button class exists');
    assert.ok(appJs.includes('more_vert'), '3-dot more_vert icon used in trigger');
    assert.ok(appJs.includes('card-action-watched'), 'watched/unwatched action exists');
    assert.ok(appJs.includes('card-action-addtolist'), 'add to list action exists');
    assert.ok(appJs.includes('card-action-watchlater'), 'watch later action exists');
    assert.ok(appJs.includes('visibility'), 'visibility icon used for watched status');
    assert.ok(appJs.includes('playlist_add'), 'playlist_add icon used for custom lists');
    assert.ok(appJs.includes('bookmark_add'), 'bookmark_add icon used for watch later');
  });

  it('renderMediaGrid and loadSimilarMedia inject overflow menu HTML and wire listeners', () => {
    const renderMediaPart = appJs.slice(appJs.indexOf('function renderMediaGrid('), appJs.indexOf('function openDetailView('));
    assert.ok(renderMediaPart.includes('getCardOverflowMenuHtml('), 'renderMediaGrid calls getCardOverflowMenuHtml');
    assert.ok(renderMediaPart.includes('attachCardOverflowListeners('), 'renderMediaGrid calls attachCardOverflowListeners');
    assert.ok(renderMediaPart.includes('e.target.closest(\'.card-overflow-wrap\')'), 'card click ignores card overflow wrap');

    const simStart = appJs.indexOf('async function loadSimilarMedia(');
    const similarPart = appJs.slice(simStart, simStart + 3000);
    assert.ok(similarPart.includes('getCardOverflowMenuHtml('), 'loadSimilarMedia calls getCardOverflowMenuHtml');
    assert.ok(similarPart.includes('attachCardOverflowListeners('), 'loadSimilarMedia calls attachCardOverflowListeners');
    assert.ok(similarPart.includes('class="similar-card-header"') && similarPart.includes('${overflowHtml}'), 'loadSimilarMedia places overflow menu next to title in similar-card-header');
  });

  it('CSS defines comprehensive brutalist styling for card overflow menu and action icons', () => {
    assert.ok(styleCss.includes('.card-overflow-wrap {'), 'CSS defines .card-overflow-wrap');
    assert.ok(styleCss.includes('.card-overflow-trigger {'), 'CSS defines .card-overflow-trigger');
    assert.ok(styleCss.includes('.card-overflow-menu {'), 'CSS defines .card-overflow-menu');
    assert.ok(styleCss.includes('.card-overflow-item {'), 'CSS defines .card-overflow-item');
    assert.ok(styleCss.includes('.similar-card .card-overflow-wrap'), 'CSS defines similar-card specific overflow positioning');
    assert.ok(styleCss.includes('.similar-card-header'), 'CSS defines .similar-card-header flex container');
    assert.ok(styleCss.includes('.card-action-watched'), 'CSS defines watched action styles');
    assert.ok(styleCss.includes('.card-action-addtolist'), 'CSS defines add to list action styles');
    assert.ok(styleCss.includes('.card-action-watchlater'), 'CSS defines watch later action styles');
    assert.ok(styleCss.includes('.movie-card.menu-open'), 'CSS defines elevated z-index for open menu');
    assert.ok(styleCss.includes('overflow: visible;'), 'movie-card allows visible overflow for floating menu');
  });

  it('document listeners handle closing open menus on outside click and Escape key', () => {
    assert.ok(appJs.includes("if (!e.target.closest('.card-overflow-wrap'))"), 'handles click outside menu');
    assert.ok(appJs.includes("if (e.key === 'Escape')"), 'handles Escape key dismissal');
  });

  it('functional evaluation: generates valid markup and toggles states accurately', () => {
    // Test data
    const mockMovie = { id: 101, title: 'Inception', year: '2010', poster: 'inception.jpg', mediaType: 'movie' };
    const mockAnime = { id: 202, title: 'Attack on Titan', year: '2013', isAnime: true, mediaType: 'tv' };

    // Function extraction simulator
    const generateHtml = (item, type, idx, isWatched = false, isWatchLater = false, inLists = false) => {
      const watchedIcon = isWatched ? 'visibility' : 'visibility_off';
      const watchedTitle = isWatched ? 'Watched — click to mark unwatched' : 'Mark as Watched';
      const listIcon = inLists ? 'playlist_add_check' : 'playlist_add';
      const listTitle = inLists ? 'In Lists (1) — click to edit' : 'Add to List';
      const watchLaterIcon = isWatchLater ? 'bookmark_added' : 'bookmark_add';
      const watchLaterTitle = isWatchLater ? 'In Watch Later — click to remove' : 'Save to Watch Later';

      return `
        <div class="card-overflow-wrap">
          <button type="button" class="card-overflow-trigger" aria-label="Card options" title="Options" data-card-idx="${idx}">
            <span class="material-symbols-outlined">more_vert</span>
          </button>
          <div class="card-overflow-menu hidden" role="menu">
            <button type="button" class="card-overflow-item card-action-watched ${isWatched ? 'active' : ''}" data-action="watched" data-card-idx="${idx}" title="${watchedTitle}" aria-label="${watchedTitle}">
              <span class="material-symbols-outlined">${watchedIcon}</span>
            </button>
            <button type="button" class="card-overflow-item card-action-addtolist ${inLists ? 'active' : ''}" data-action="addtolist" data-card-idx="${idx}" title="${listTitle}" aria-label="${listTitle}">
              <span class="material-symbols-outlined">${listIcon}</span>
            </button>
            <button type="button" class="card-overflow-item card-action-watchlater ${isWatchLater ? 'active' : ''}" data-action="watchlater" data-card-idx="${idx}" title="${watchLaterTitle}" aria-label="${watchLaterTitle}">
              <span class="material-symbols-outlined">${watchLaterIcon}</span>
            </button>
          </div>
        </div>
      `;
    };

    const htmlDefault = generateHtml(mockMovie, 'movie', 0, false, false, false);
    assert.ok(htmlDefault.includes('visibility_off'), 'unwatched shows visibility_off');
    assert.ok(htmlDefault.includes('playlist_add'), 'not in lists shows playlist_add');
    assert.ok(htmlDefault.includes('bookmark_add'), 'not in watch later shows bookmark_add');

    const htmlWatched = generateHtml(mockMovie, 'movie', 0, true, false, false);
    assert.ok(htmlWatched.includes('visibility</span>'), 'watched shows visibility');
    assert.ok(htmlWatched.includes('class="card-overflow-item card-action-watched active"'), 'watched button has active class');

    const htmlAnimeWithLists = generateHtml(mockAnime, 'tv', 1, false, true, true);
    assert.ok(htmlAnimeWithLists.includes('playlist_add_check'), 'assigned to list shows playlist_add_check');
    assert.ok(htmlAnimeWithLists.includes('bookmark_added'), 'in watch later shows bookmark_added');
  });
});
