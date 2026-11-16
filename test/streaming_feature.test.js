import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getSourcesList,
  generateStreamEmbedUrl,
  getEmbedSources,
  resolveStreamSources,
  fetchAniSkip
} from '../src/streamProviders.js';
import { Storage } from '../src/storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Archival Screening Room & Live Video Streaming Suite', () => {
  const indexHtml = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf-8');
  const appJs = fs.readFileSync(path.join(rootDir, 'public', 'app.js'), 'utf-8');
  const styleCss = fs.readFileSync(path.join(rootDir, 'public', 'style.css'), 'utf-8');
  const serverJs = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf-8');

  it('streamProviders defines 18 mirror sources and loads data/moodflix-source.json', () => {
    const sources = getSourcesList();
    assert.strictEqual(Array.isArray(sources), true, 'sources is an array');
    assert.strictEqual(sources.length, 18, 'defines all 18 mirror sources');

    const expectedNames = [
      'vidsrcme', 'vidsrc.to', 'vidsrc.pm', 'vidsrc_buzz', 'instaplay',
      'multiembed', 'videasy', 'vidlink', 'vidcore', 'moviesapi',
      'peachify', 'vembed', 'vidnest', 'vidfast', 'vidspark',
      'autoembed', '2embed', 'anyembed'
    ];

    expectedNames.forEach(name => {
      assert.ok(sources.some(s => s.name === name), `contains provider: ${name}`);
    });
  });

  it('generateStreamEmbedUrl accurately generates movie URLs across provider conventions', () => {
    // 1. Standard path provider
    const vidsrcMovie = generateStreamEmbedUrl({
      base: 'https://vidsrc.me/embed',
      type: 'movie',
      id: 550,
      providerName: 'vidsrcme'
    });
    assert.strictEqual(vidsrcMovie, 'https://vidsrc.me/embed/movie/550');

    // 2. VidLink with dark gold styling tokens
    const vidlinkMovie = generateStreamEmbedUrl({
      base: 'https://vidlink.pro',
      type: 'movie',
      id: 550,
      providerName: 'vidlink'
    });
    assert.strictEqual(
      vidlinkMovie,
      'https://vidlink.pro/movie/550?primaryColor=e09f3e&secondaryColor=151310&iconColor=e09f3e'
    );

    // 3. SuperEmbed / MultiEmbed with TMDB query
    const multiMovie = generateStreamEmbedUrl({
      base: 'https://multiembed.mov',
      type: 'movie',
      id: 550,
      providerName: 'multiembed'
    });
    assert.strictEqual(multiMovie, 'https://multiembed.mov/?video_id=550&tmdb=1');

    // 4. SuperEmbed with IMDB ID
    const multiImdb = generateStreamEmbedUrl({
      base: 'https://multiembed.mov',
      type: 'movie',
      id: 550,
      imdbId: 'tt0137523',
      providerName: 'multiembed'
    });
    assert.strictEqual(multiImdb, 'https://multiembed.mov/?video_id=tt0137523');

    // 5. AnyEmbed / SmashyStream
    const anyMovie = generateStreamEmbedUrl({
      base: 'https://embed.smashystream.com',
      type: 'movie',
      id: 550,
      providerName: 'anyembed'
    });
    assert.strictEqual(anyMovie, 'https://embed.smashystream.com/playere.php?tmdb=550');

    // 6. 2Embed
    const twoEmbedMovie = generateStreamEmbedUrl({
      base: 'https://www.2embed.cc',
      type: 'movie',
      id: 550,
      providerName: '2embed'
    });
    assert.strictEqual(twoEmbedMovie, 'https://www.2embed.cc/embed/550');
  });

  it('generateStreamEmbedUrl accurately generates TV series and episode URLs', () => {
    // 1. Standard path provider
    const vidsrcTv = generateStreamEmbedUrl({
      base: 'https://vidsrc.me/embed',
      type: 'tv',
      id: 1399,
      season: 2,
      episode: 5,
      providerName: 'vidsrcme'
    });
    assert.strictEqual(vidsrcTv, 'https://vidsrc.me/embed/tv/1399/2/5');

    // 2. VidLink TV
    const vidlinkTv = generateStreamEmbedUrl({
      base: 'https://vidlink.pro',
      type: 'tv',
      id: 1399,
      season: 2,
      episode: 5,
      providerName: 'vidlink'
    });
    assert.strictEqual(
      vidlinkTv,
      'https://vidlink.pro/tv/1399/2/5?primaryColor=e09f3e&secondaryColor=151310&iconColor=e09f3e'
    );

    // 3. SuperEmbed TV
    const multiTv = generateStreamEmbedUrl({
      base: 'https://multiembed.mov',
      type: 'tv',
      id: 1399,
      season: 2,
      episode: 5,
      providerName: 'multiembed'
    });
    assert.strictEqual(multiTv, 'https://multiembed.mov/?video_id=1399&tmdb=1&s=2&e=5');

    // 4. AnyEmbed TV
    const anyTv = generateStreamEmbedUrl({
      base: 'https://embed.smashystream.com',
      type: 'tv',
      id: 1399,
      season: 2,
      episode: 5,
      providerName: 'anyembed'
    });
    assert.strictEqual(anyTv, 'https://embed.smashystream.com/playere.php?tmdb=1399&season=2&episode=5');

    // 5. 2Embed TV
    const twoEmbedTv = generateStreamEmbedUrl({
      base: 'https://www.2embed.cc',
      type: 'tv',
      id: 1399,
      season: 2,
      episode: 5,
      providerName: '2embed'
    });
    assert.strictEqual(twoEmbedTv, 'https://www.2embed.cc/embedtv/1399&s=2&e=5');
  });

  it('getEmbedSources returns all 18 formatted sources with generated URLs', () => {
    const list = getEmbedSources({ type: 'movie', id: 550 });
    assert.strictEqual(list.length, 18);
    list.forEach(src => {
      assert.ok(src.name && src.label && src.url);
      assert.ok(src.url.startsWith('https://'), `Valid URL: ${src.url}`);
    });
  });

  it('resolveStreamSources returns embed fallback mode with 18 mirrors when no external extractor configured', async () => {
    const res = await resolveStreamSources({
      mediaType: 'movie',
      id: 550
    });
    assert.strictEqual(res.mode, 'embed');
    assert.strictEqual(Array.isArray(res.sources), true);
    assert.strictEqual(res.sources.length, 0);
    assert.strictEqual(Array.isArray(res.fallbackEmbeds), true);
    assert.strictEqual(res.fallbackEmbeds.length, 18);
  });

  it('Storage saves, retrieves, and isolates watch progress records', () => {
    const testUser = 'user-test-screening';
    const progressRecord = {
      media_id: '550',
      media_type: 'movie',
      title: 'Fight Club',
      poster_path: '/fightclub.jpg',
      season: 1,
      episode: 1,
      progress_seconds: 1200,
      duration_seconds: 7200,
      completed: false
    };

    const saved = Storage.saveWatchProgress(testUser, progressRecord);
    assert.strictEqual(saved.title, 'Fight Club');
    assert.strictEqual(saved.progress_seconds, 1200);

    const fetched = Storage.getWatchProgress(testUser, '550', 1, 1);
    assert.ok(fetched, 'Fetched progress item');
    assert.strictEqual(fetched.progress_seconds, 1200);

    const recent = Storage.getRecentWatchProgress(testUser, 10);
    assert.ok(recent.length > 0, 'Returns recent items');
    assert.strictEqual(recent[0].title, 'Fight Club');

    // Clean up
    Storage.deleteWatchProgress(testUser, '550', 1, 1);
    const afterDelete = Storage.getWatchProgress(testUser, '550', 1, 1);
    assert.strictEqual(afterDelete, null, 'Deleted cleanly');
  });

  it('server.js defines streaming endpoints: /api/stream, /api/stream/sources, /api/proxy/hls, /api/proxy/subtitles, /api/progress', () => {
    assert.ok(serverJs.includes("app.get('/api/stream'"), 'defines /api/stream');
    assert.ok(serverJs.includes("app.get('/api/stream/sources'"), 'defines /api/stream/sources');
    assert.ok(serverJs.includes("app.get('/api/proxy/hls'"), 'defines /api/proxy/hls');
    assert.ok(serverJs.includes("app.get('/api/proxy/subtitles'"), 'defines /api/proxy/subtitles');
    assert.ok(serverJs.includes("app.get('/api/progress'"), 'defines GET /api/progress');
    assert.ok(serverJs.includes("app.post('/api/progress'"), 'defines POST /api/progress');
    assert.ok(serverJs.includes("app.delete('/api/progress'"), 'defines DELETE /api/progress');

    // Verify Content-Security-Policy allows iframe streaming embeds and youtube
    assert.ok(
      serverJs.includes('https://www.youtube.com') && serverJs.includes('https: data: blob:'),
      'CSP allows iframe streaming hosts'
    );
  });

  it('index.html contains screening room player modal, controls, and detail view stream button', () => {
    assert.ok(indexHtml.includes('id="screeningRoomModal"'), 'HTML defines screeningRoomModal');
    assert.ok(indexHtml.includes('id="screeningModalTitle"'), 'HTML defines screeningModalTitle');
    assert.ok(indexHtml.includes('id="screeningSourceSelect"'), 'HTML defines screeningSourceSelect');
    assert.ok(indexHtml.includes('id="screeningEpisodeBar"'), 'HTML defines screeningEpisodeBar');
    assert.ok(indexHtml.includes('id="screeningIframe"'), 'HTML defines screeningIframe');
    assert.ok(indexHtml.includes('id="screeningVideo"'), 'HTML defines screeningVideo');
    assert.ok(indexHtml.includes('id="screeningAniSkipBtn"'), 'HTML defines screeningAniSkipBtn');
    assert.ok(indexHtml.includes('id="screeningFlashMsg"'), 'HTML defines screeningFlashMsg');
    assert.ok(indexHtml.includes('id="detailStreamBtn"'), 'Detail actions defines detailStreamBtn');
    assert.ok(indexHtml.includes('id="continueWatchingShelf"'), 'Feed defines continueWatchingShelf');
    assert.ok(indexHtml.includes('hls.js'), 'HTML loads Hls.js script');
  });

  it('app.js defines screening room controller and watch progress engine', () => {
    assert.ok(appJs.includes('function openScreeningRoom('), 'defines openScreeningRoom');
    assert.ok(appJs.includes('function closeScreeningRoom('), 'defines closeScreeningRoom');
    assert.ok(appJs.includes('function loadScreeningStream('), 'defines loadScreeningStream');
    assert.ok(appJs.includes('function changeScreeningSource('), 'defines changeScreeningSource');
    assert.ok(appJs.includes('function changeScreeningEpisode('), 'defines changeScreeningEpisode');
    assert.ok(appJs.includes('function screeningNextEpisode('), 'defines screeningNextEpisode');
    assert.ok(appJs.includes('function toggleScreeningMode('), 'defines toggleScreeningMode');
    assert.ok(appJs.includes('function triggerAniSkip('), 'defines triggerAniSkip');
    assert.ok(appJs.includes('function handleScreeningKeydown('), 'defines handleScreeningKeydown');
    assert.ok(appJs.includes('function saveWatchProgress('), 'defines saveWatchProgress');
    assert.ok(appJs.includes('function loadContinueWatching('), 'defines loadContinueWatching');

    // Verify window exports
    assert.ok(appJs.includes('window.openScreeningRoom = openScreeningRoom'), 'exports openScreeningRoom');
    assert.ok(appJs.includes('window.closeScreeningRoom = closeScreeningRoom'), 'exports closeScreeningRoom');
    assert.ok(appJs.includes('window.STREAM_MIRROR_SOURCES = STREAM_MIRROR_SOURCES'), 'exports STREAM_MIRROR_SOURCES');

    // Verify smooth loader hiding and episode bar management
    assert.ok(appJs.includes('iframe.onload = hideLoader'), 'wires iframe load event to dismiss loading HUD');
    assert.ok(appJs.includes("episodeBar.classList.add('hidden')"), 'hides episode selectors for movies');
  });

  it('style.css defines retro-brutalist cinema styles for screening room and continue watching shelf', () => {
    assert.ok(styleCss.includes('.screening-room-modal-card {'), 'defines .screening-room-modal-card');
    assert.ok(styleCss.includes('.screening-viewport-stage {'), 'defines .screening-viewport-stage');
    assert.ok(styleCss.includes('.screening-aniskip-btn {'), 'defines .screening-aniskip-btn');
    assert.ok(styleCss.includes('.screening-flash-toast {'), 'defines .screening-flash-toast');
    assert.ok(styleCss.includes('.btn-stream-primary {'), 'defines .btn-stream-primary');
    assert.ok(styleCss.includes('.btn-stream-episode {'), 'defines .btn-stream-episode');
    assert.ok(styleCss.includes('.continue-watching-shelf {'), 'defines .continue-watching-shelf');

    // UI Fix Verifications
    assert.ok(
      styleCss.includes('.screening-modal-header') &&
      styleCss.includes('background: #0a0a0a !important'),
      'modal header has explicit dark background to prevent white-on-white text disappearance'
    );
    assert.ok(
      styleCss.includes('.screening-loader-overlay.hidden') &&
      styleCss.includes('.screening-aniskip-btn.hidden') &&
      styleCss.includes('.screening-episode-bar.hidden') &&
      styleCss.includes('display: none !important'),
      'explicitly hides screening HUD elements when marked .hidden'
    );
    assert.ok(
      styleCss.includes('.spin-icon {') && styleCss.includes('animation: spin'),
      'defines spin-icon with continuous rotation animation'
    );
    assert.ok(
      styleCss.includes('.screening-season-select') && styleCss.includes('min-width: 64px !important'),
      'defines minimum comfortable width for season and episode selectors'
    );
  });

  it('locks stream feature behind Google authentication on client and server', () => {
    // 1. HTML defines Stream Auth Gate Modal with Google login CTA
    assert.ok(indexHtml.includes('id="streamAuthModal"'), 'HTML defines streamAuthModal');
    assert.ok(indexHtml.includes('id="btnStreamAuthGoogleLogin"'), 'HTML defines btnStreamAuthGoogleLogin');
    assert.ok(indexHtml.includes('id="streamAuthTargetTitle"'), 'HTML defines streamAuthTargetTitle');
    assert.ok(indexHtml.includes('CONTINUE WITH GOOGLE'), 'HTML contains Google sign in button in stream auth modal');

    // 2. JS checks state.user before launching stream and gates access
    assert.ok(appJs.includes('function openStreamAuthModal('), 'app.js defines openStreamAuthModal');
    assert.ok(appJs.includes('function closeStreamAuthModal('), 'app.js defines closeStreamAuthModal');
    assert.ok(appJs.includes('function checkPendingStreamAfterLogin('), 'app.js defines checkPendingStreamAfterLogin');
    assert.ok(
      appJs.includes('if (!state.user) {\n    openStreamAuthModal(item, options);\n    return;') ||
      appJs.includes('if (!state.user) {') && appJs.includes('openStreamAuthModal(item'),
      'openScreeningRoom blocks unauthenticated guests and prompts Google login'
    );
    assert.ok(
      appJs.includes('window.openStreamAuthModal = openStreamAuthModal'),
      'exports openStreamAuthModal'
    );

    // 3. Server enforces authentication session when Supabase is configured
    assert.ok(
      serverJs.includes("app.get('/api/stream'") &&
      serverJs.includes('verifySupabaseAuthToken(req)') &&
      serverJs.includes('401'),
      'server.js guards /api/stream with Google auth token verification'
    );

    // 4. CSS defines stream auth modal and button locked indicators
    assert.ok(styleCss.includes('.stream-auth-modal-card'), 'CSS defines .stream-auth-modal-card');
    assert.ok(styleCss.includes('.btn-stream-primary.stream-btn-locked'), 'CSS defines .btn-stream-primary.stream-btn-locked');
  });

  it('makes the continue playback section collapsed by default on mobile and desktop', () => {
    // 1. Initial DOM element includes is-collapsed class
    assert.ok(
      indexHtml.includes('id="continueWatchingShelf"') &&
      indexHtml.includes('continue-watching-shelf retro-box hidden is-collapsed'),
      'HTML initializes continueWatchingShelf with is-collapsed class'
    );

    // 2. JavaScript initializes collapsed state to true by default
    assert.ok(
      appJs.includes('state.continueShelfCollapsed = true'),
      'app.js defaults state.continueShelfCollapsed to true'
    );
    assert.ok(
      appJs.includes('continue-shelf-toggle-btn'),
      'app.js defines toggle button for continue shelf'
    );
    assert.ok(
      appJs.includes('window.toggleContinueWatchingShelf ='),
      'app.js exports toggleContinueWatchingShelf on window'
    );

    // 3. CSS hides grid and styles header compactly when collapsed
    assert.ok(
      styleCss.includes('.continue-watching-shelf.is-collapsed'),
      'CSS defines .continue-watching-shelf.is-collapsed'
    );
    assert.ok(
      styleCss.includes('.continue-watching-shelf.is-collapsed .continue-shelf-grid') &&
      styleCss.includes('display: none !important'),
      'CSS hides continue-shelf-grid when shelf is collapsed'
    );
    assert.ok(
      styleCss.includes('.continue-shelf-toggle-btn'),
      'CSS styles continue-shelf-toggle-btn'
    );
    assert.ok(
      styleCss.includes('.continue-watching-shelf.is-collapsed') &&
      styleCss.includes('margin-bottom: 14px !important'),
      'CSS defines compact mobile styling for collapsed continue watching shelf'
    );
  });
});
