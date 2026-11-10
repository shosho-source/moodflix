/**
 * The Movie & TV Cine - Retro Brutalist Edition
 */

// State
const state = {
  movies: [],
  tvShows: [],
  anime: [],
  history: [],
  watchlist: [],
  watchlistFilter: 'all',
  watchlistSubTab: 'watchlist', // 'watchlist' | 'diary' | 'custom-lists'
  watchlistFilters: {
    type: 'all',
    status: 'all', // Default: all saved titles
    genre: 'all',
    year: 'all',
    minRating: 0,
    runtime: 'all',
    sort: 'date_desc',
    search: ''
  },
  customLists: [],
  activeCustomListId: 'all',
  diaryEntries: [],
  currentTvItemForEpisodes: null,
  currentDiaryItem: null,
  currentAssignItem: null,
  currentStreamingItem: null,
  currentStreamingRegion: 'US',
  pendingImportItems: [],
  settings: {},
  activeTab: 'diagnostic-view',
  lastFeedTab: 'movies-view',
  previousTab: 'diagnostic-view',
  currentMediaForModal: null,
  currentTorrents: [],
  isSharedPage: false,
  user: null
};

// Global HTML entity escaping helper to prevent XSS
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// DOM Elements
const elements = {
  mainNav: document.getElementById('mainNav'),
  movieGrid: document.getElementById('movieGrid'),
  movieSearchInput: document.getElementById('movieSearchInput'),
  btnClearMovieSearch: document.getElementById('btnClearMovieSearch'),
  btnExecuteMovieSearch: document.getElementById('btnExecuteMovieSearch'),
  movieTypeSelect: document.getElementById('movieTypeSelect'),
  movieCategorySelect: document.getElementById('movieCategorySelect'),
  movieYearSelect: document.getElementById('movieYearSelect'),

  animeGrid: document.getElementById('animeGrid'),
  animeSearchInput: document.getElementById('animeSearchInput'),
  btnClearAnimeSearch: document.getElementById('btnClearAnimeSearch'),
  btnExecuteAnimeSearch: document.getElementById('btnExecuteAnimeSearch'),
  animeTypeSelect: document.getElementById('animeTypeSelect'),
  animeCategorySelect: document.getElementById('animeCategorySelect'),
  animeYearSelect: document.getElementById('animeYearSelect'),

  tvGrid: document.getElementById('tvGrid'),
  tvSearchInput: document.getElementById('tvSearchInput'),
  btnClearTvSearch: document.getElementById('btnClearTvSearch'),
  btnExecuteTvSearch: document.getElementById('btnExecuteTvSearch'),
  tvCategorySelect: document.getElementById('tvCategorySelect'),

  directSearchForm: document.getElementById('directSearchForm'),
  directSearchInput: document.getElementById('directSearchInput'),
  directSearchResults: document.getElementById('directSearchResults'),

  torrentModal: document.getElementById('torrentModal'),
  modalMovieTitle: document.getElementById('modalMovieTitle'),
  modalTorrentFilterBar: document.getElementById('modalTorrentFilterBar'),
  modalTorrentList: document.getElementById('modalTorrentList'),
  btnCloseModal: document.getElementById('btnCloseModal'),

  cycleModal: document.getElementById('cycleModal'),
  cycleTerminalLog: document.getElementById('cycleTerminalLog'),
  btnCloseCycleModal: document.getElementById('btnCloseCycleModal'),

  toastContainer: document.getElementById('toastContainer'),

  // Detail View
  btnBackToFeed: document.getElementById('back-to-feed-btn'),
  detailPoster: document.getElementById('detailPoster'),
  detailTitle: document.getElementById('detailTitle'),
  detailMeta: document.getElementById('detailMeta'),
  detailSynopsis: document.getElementById('detailSynopsis'),
  modalTorrentHeader: document.getElementById('modalTorrentHeader'),
  modalBodyContent: document.getElementById('modalBodyContent'),
  detailTorrentsBtn: document.getElementById('detailTorrentsBtn'),
  detailTrailerBtn: document.getElementById('detailTrailerBtn'),
  detailWatchedBtn: document.getElementById('detailWatchedBtn'),
  detailWatchlistBtn: document.getElementById('detailWatchlistBtn'),
  detailAddToListBtn: document.getElementById('detailAddToListBtn'),
  detailShareBtn: document.getElementById('detailShareBtn'),

  // Profile & Watchlist Elements
  profileView: document.getElementById('profile-view'),
  profileGuestCard: document.getElementById('profileGuestCard'),
  profileUserCard: document.getElementById('profileUserCard'),
  profileUserName: document.getElementById('profileUserName'),
  profileUserEmail: document.getElementById('profileUserEmail'),
  profileAvatarWrap: document.getElementById('profileAvatarWrap'),
  profileLogoutBtn: document.getElementById('profileLogoutBtn'),
  watchlistGrid: document.getElementById('watchlistGrid'),
  wlYearSelect: document.getElementById('wlYearSelect'),
  watchlistEmptyState: document.getElementById('watchlistEmptyState'),
  watchlistCountBadge: document.getElementById('watchlistCountBadge'),
  btnClearWatchlist: document.getElementById('btnClearWatchlist'),
  profileHistoryList: document.getElementById('profileHistoryList'),
  historyCountBadge: document.getElementById('historyCountBadge')
};

let supabaseClient = null;

// Preloader Status & Progress Update Helper
function updatePreloaderStatus(message, progressPercent = null) {
  const statusEl = document.getElementById('loader-status');
  if (statusEl && message) {
    statusEl.textContent = message;
  }
  const barEl = document.getElementById('loader-progress-bar');
  if (barEl && progressPercent !== null) {
    barEl.style.width = `${Math.min(100, Math.max(0, progressPercent))}%`;
  }
}

// Initial Loader Screen Dismissal Helper
function hideInitialLoader() {
  const loader = document.getElementById('loader');
  if (loader && !loader.classList.contains('fade-out')) {
    const barEl = document.getElementById('loader-progress-bar');
    if (barEl) barEl.style.width = '100%';
    loader.classList.add('fade-out');
    setTimeout(() => {
      loader.style.display = 'none';
    }, 450);
  }
}

// Visual Torrent Swarm Scanner Loading Template
function getTorrentLoadingHtml(title = 'SCANNING SWARM RELEASES...', subtitle = 'Querying The Cine Bay & DHT indexers for verified seeds...') {
  return `
    <div class="torrent-fetch-loader retro-box">
      <div class="torrent-radar-wrap">
        <div class="torrent-radar">
          <div class="radar-sweep"></div>
          <div class="radar-circle rc-1"></div>
          <div class="radar-circle rc-2"></div>
          <div class="radar-circle rc-3"></div>
          <div class="radar-crosshair-h"></div>
          <div class="radar-crosshair-v"></div>
          <div class="radar-blip b-1"></div>
          <div class="radar-blip b-2"></div>
          <div class="radar-blip b-3"></div>
        </div>
      </div>
      <div class="torrent-loader-info">
        <div class="torrent-loader-badge">
          <span class="live-pulse-dot"></span>
          <span>THE CINE BAY P2P INDEXER</span>
        </div>
        <div class="torrent-loader-title scramble-text">${escapeHtml(title)}</div>
        <div class="torrent-loader-sub">${escapeHtml(subtitle)}</div>
        <div class="torrent-signal-bars">
          <span class="sig-bar bar-1"></span>
          <span class="sig-bar bar-2"></span>
          <span class="sig-bar bar-3"></span>
          <span class="sig-bar bar-4"></span>
          <span class="sig-bar bar-5"></span>
          <span class="sig-bar bar-6"></span>
          <span class="sig-bar bar-7"></span>
        </div>
        <div class="torrent-loader-status-stream">
          <span class="stream-tag">[SWARM: ACTIVE]</span>
          <span class="stream-sep">•</span>
          <span class="stream-tag">[DHT: RESOLVING]</span>
          <span class="stream-sep">•</span>
          <span class="stream-tag">[SORT: SEEDS]</span>
        </div>
      </div>
    </div>
  `;
}

// Retro-Brutalist Toast System
function showToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type}`;

  let iconName = 'info';
  if (type === 'success') iconName = 'check_circle';
  else if (type === 'error') iconName = 'error';

  toast.innerHTML = `
    <span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle;">${iconName}</span>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, duration);
}

document.addEventListener('DOMContentLoaded', async () => {
  const startTime = Date.now();
  const MIN_LOADER_DURATION = 800; // Guarantees a polished, non-flickering preloader transition

  initFluid();
  setupEventListeners();

  // Create Promise for complete window resources with a 1.5s fallback to prevent cross-browser freeze
  const timeoutPromise = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const windowLoadPromise = (document.readyState === 'complete')
    ? Promise.resolve()
    : Promise.race([
      new Promise(resolve => window.addEventListener('load', resolve, { once: true })),
      timeoutPromise(1500)
    ]);

  // Create Promise for web font rendering with fallback
  const fontsPromise = (document.fonts && document.fonts.ready)
    ? Promise.race([document.fonts.ready, timeoutPromise(1500)])
    : Promise.resolve();

  // Fail-safe maximum timeout (4 seconds) to prevent infinite screen lock
  let isDismissed = false;
  const safetyTimeout = setTimeout(() => {
    if (!isDismissed) {
      console.warn('Initial loader dismissed by safety timeout');
      hideInitialLoader();
    }
  }, 4000);

  try {
    updatePreloaderStatus('INITIALIZING MOODFLIX CORE...', 25);
    await Promise.allSettled([windowLoadPromise, fontsPromise]);

    updatePreloaderStatus('AUTHENTICATING ARCHIVE SESSION...', 50);
    await initSupabaseClient();

    updatePreloaderStatus('SYNCHRONIZING INTERFACE...', 90);
  } catch (err) {
    console.warn('Initialization notice:', err);
    if (!checkShareUrl()) {
      await showDashboardView(null);
    }
  } finally {
    clearTimeout(safetyTimeout);
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADER_DURATION - elapsed);
    setTimeout(() => {
      updatePreloaderStatus('SYSTEM READY', 100);
      setTimeout(() => {
        isDismissed = true;
        hideInitialLoader();
      }, 200);
    }, remainingTime);
  }
});

async function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (supabaseClient) {
    try {
      const { data } = await supabaseClient.auth.getSession();
      if (data?.session?.access_token) {
        headers['Authorization'] = `Bearer ${data.session.access_token}`;
      }
    } catch (e) {}
  }
  return headers;
}

async function initSupabaseClient() {
  const isShared = checkShareUrl();

  try {
    const res = await fetch('/api/config');
    const config = await res.json();
    if (config.supabaseUrl && config.supabaseAnonKey && window.supabase) {
      supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
      supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (session && session.user) {
          await showDashboardView(session.user);
        } else if (event === 'SIGNED_OUT') {
          await showDashboardView(null);
        }
      });
      await checkSession();
      return;
    }
  } catch (err) {
    console.warn('Failed to load backend config:', err);
  }

  if (isShared) {
    switchTab('share-view');
  } else {
    await showDashboardView(null);
  }
}

async function checkSession() {
  if (supabaseClient) {
    try {
      const { data } = await supabaseClient.auth.getSession();
      if (data && data.session && data.session.user) {
        await showDashboardView(data.session.user);
        return;
      }
    } catch (e) {
      console.warn('Session check warning:', e);
    }
  }

  if (state.isSharedPage) {
    switchTab('share-view');
  } else {
    await showDashboardView(null);
  }
}

async function showAuthView() {
  switchTab('profile-view');
}

async function showDashboardView(user) {
  state.user = user;

  // Header, nav tabs, and mobile navigation are always visible
  if (elements.mainNav) elements.mainNav.style.display = 'flex';
  document.getElementById('mobileBottomNav')?.classList.remove('hidden');
  document.querySelector('.site-header')?.classList.remove('hidden');

  // Update header profile display
  const userProfileEl = document.getElementById('user-profile');
  const userEmailEl = document.getElementById('user-email');
  const signoutBtn = document.getElementById('signout-btn');
  if (user) {
    const userDisplay = (user?.user_metadata?.full_name || (user?.email ? user.email.split('@')[0] : (user?.id ? user.id.slice(0, 8) : 'USER'))).toUpperCase();
    if (userEmailEl) userEmailEl.textContent = userDisplay;
    if (signoutBtn) signoutBtn.classList.remove('hidden');
    if (userProfileEl) userProfileEl.title = `Signed in as ${user.email} - Open Watchlist`;
  } else {
    if (userEmailEl) userEmailEl.textContent = 'GUEST';
    if (signoutBtn) signoutBtn.classList.add('hidden');
    if (userProfileEl) userProfileEl.title = 'Browse as Guest (Click to Open Watchlist)';
  }

  // Ensure active view is immediately displayed (fixes blank screen on initial load)
  switchTab(state.activeTab || 'diagnostic-view');

  // Sync profile view state & watchlist
  renderProfileView();
  await loadWatchlist();
  loadCustomLists();
  loadDiaryEntries();

  // Background non-blocking load for catalog so Explore appears instantly
  if (state.movies.length === 0) {
    loadMovies();
  }
  if (!state.anime || state.anime.length === 0) {
    loadAnime();
  }
  if (state.tvShows.length === 0) {
    loadTVShows();
  }
}

async function handleGoogleLogin() {
  const btnText = document.getElementById('login-btn-text');
  if (btnText) btnText.textContent = 'LOGGING IN...';

  try {
    if (!supabaseClient) {
      showToast('Authentication service is currently unavailable. Please try again later.', 'error');
      return;
    }
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href }
    });
    if (error) {
      showToast('Google OAuth: ' + error.message, 'error');
    }
  } catch (err) {
    showToast('Login encountered an issue', 'error');
  } finally {
    if (btnText) {
      btnText.textContent = 'CONTINUE WITH GOOGLE';
    }
  }
}

async function handleSignOut() {
  if (supabaseClient) {
    try {
      await supabaseClient.auth.signOut();
    } catch (e) {
      console.warn('Sign out warning:', e);
    }
  }
  try {
    localStorage.removeItem('moodflix_watchlist');
  } catch (e) {}
  state.watchlist = [];
  showToast('Signed out of session (Reverted to Guest)', 'info');
  await showDashboardView(null);
}

window.showDashboardView = showDashboardView;
window.showAuthView = showAuthView;

// ==========================================================================
// Profile & Watchlist Manager
// ==========================================================================

function renderProfileView() {
  const guestCard = document.getElementById('profileGuestCard');
  const userCard = document.getElementById('profileUserCard');
  const userName = document.getElementById('profileUserName');
  const userEmail = document.getElementById('profileUserEmail');
  const avatarWrap = document.getElementById('profileAvatarWrap');
  const authTag = document.getElementById('profileAuthTag');
  const authTagText = document.getElementById('profileAuthTagText');

  if (state.user) {
    if (guestCard) guestCard.classList.add('hidden');
    if (userCard) userCard.classList.remove('hidden');

    const fullName = state.user.user_metadata?.full_name || (state.user.email ? state.user.email.split('@')[0] : 'ARCHIVE OPERATOR');
    const email = state.user.email || '';
    const avatarUrl = state.user.user_metadata?.avatar_url || state.user.user_metadata?.picture;

    if (userName) userName.textContent = fullName.toUpperCase();
    if (userEmail) userEmail.textContent = email;

    if (authTagText) {
      authTagText.textContent = 'GOOGLE AUTHENTICATED';
    }
    if (authTag) {
      authTag.className = 'retro-tag-pill verified-tag';
    }

    if (avatarWrap) {
      if (avatarUrl) {
        avatarWrap.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(fullName)}" class="profile-avatar-img" onerror="this.parentElement.innerHTML='<span class=\\'material-symbols-outlined profile-avatar-icon\\'>account_circle</span>';" />`;
      } else {
        avatarWrap.innerHTML = `<span class="material-symbols-outlined profile-avatar-icon">account_circle</span>`;
      }
    }
  } else {
    if (guestCard) guestCard.classList.remove('hidden');
    if (userCard) userCard.classList.add('hidden');
  }

  renderWatchlistStats();
  renderWatchlist();
  loadProfileHistory();
}

// Release Year Filter Matching Helper
function matchesYearFilter(itemYear, filterValue) {
  if (!filterValue || filterValue === 'all') return true;
  if (!itemYear) return false;
  const yearStr = String(itemYear).trim();
  const y = parseInt(yearStr.slice(0, 4), 10);
  if (!y || isNaN(y)) return false;

  // Exact 4-digit year like '2024'
  if (/^\d{4}$/.test(filterValue)) {
    return y === parseInt(filterValue, 10);
  }

  // Decades like '2020s', '2010s', '2000s', '1990s', '1980s', '1970s'
  const decadeMatch = filterValue.match(/^(\d{4})s$/i);
  if (decadeMatch) {
    const start = parseInt(decadeMatch[1], 10);
    return y >= start && y <= start + 9;
  }

  // Classics / Historical periods
  if (filterValue === 'classic' || filterValue === 'pre_1970') {
    return y < 1970;
  }
  if (filterValue === 'pre_1980') {
    return y < 1980;
  }

  return true;
}

// Watchlist Item Normalizer
function normalizeWatchlistItem(item = {}) {
  const mediaType = (item.mediaType || item.media_type || (item.Season || item.totalSeasons ? 'tv' : 'movie')).toLowerCase();
  const title = item.title || item.Title || item.name || '';
  const year = parseInt(item.year || item.Year || (item.releaseDate ? item.releaseDate.slice(0, 4) : 0), 10) || null;
  const rating = parseFloat(item.rating || item.Rating || item.vote_average || 0) || 0;
  const totalSeasons = parseInt(item.totalSeasons || item.total_seasons || item.numberOfSeasons || 1, 10);
  const totalEpisodes = parseInt(item.totalEpisodes || item.total_episodes || item.numberOfEpisodes || 0, 10);
  const currentSeason = parseInt(item.currentSeason || item.current_season || (item.seasonNumber || item.season_number || 1), 10);
  const currentEpisode = parseInt(item.currentEpisode || item.current_episode || 0, 10);
  const progressPct = totalEpisodes > 0 ? Math.min(100, Math.round((currentEpisode / totalEpisodes) * 100)) : (item.progressPct || item.progress_pct || 0);

  const isSeason = Boolean(item.isSeason || item.is_season || item.seasonNumber || item.season_number);
  const seasonNumber = (item.seasonNumber != null ? parseInt(item.seasonNumber, 10) : (item.season_number != null ? parseInt(item.season_number, 10) : (isSeason ? currentSeason : null)));
  const seriesTitle = item.seriesTitle || item.series_title || (isSeason ? title.replace(/\s*-\s*Season\s*\d+.*$/i, '').trim() : title);
  const seasonPoster = item.seasonPoster || item.season_poster || null;

  return {
    id: item.id || (item.tmdb_id ? String(item.tmdb_id) : Date.now().toString()),
    tmdbId: item.tmdbId || item.tmdb_id || (item.id && !isNaN(item.id) ? parseInt(item.id, 10) : null),
    mediaType,
    title,
    seriesTitle,
    isSeason,
    seasonNumber,
    seasonPoster,
    year,
    poster: item.poster || item.poster_path || 'images/hero.webp',
    backdrop: item.backdrop || item.backdrop_path || '',
    rating,
    voteCount: item.voteCount || item.vote_count || 0,
    overview: item.overview || item.synopsis || '',
    genres: Array.isArray(item.genres) ? item.genres : [],
    runtime: parseInt(item.runtime || 0, 10),
    status: item.status || 'plan_to_watch',
    currentSeason,
    currentEpisode,
    totalSeasons,
    totalEpisodes,
    progressPct,
    userRating: item.userRating || item.user_rating || null,
    diaryNotes: item.diaryNotes || item.diary_notes || '',
    watchedDate: item.watchedDate || item.watched_date || '',
    nextAirDate: item.nextAirDate || item.next_air_date || '',
    streamingInfo: Array.isArray(item.streamingInfo || item.streaming_info) ? (item.streamingInfo || item.streaming_info) : [],
    customLists: Array.isArray(item.customLists || item.custom_lists) ? (item.customLists || item.custom_lists) : [],
    createdAt: item.createdAt || item.created_at || new Date().toISOString()
  };
}

// ============================================================================
// Mechanical Split-Flap Board Engine
// ============================================================================

function createFlipTile(char) {
  const tile = document.createElement('div');
  tile.className = 'flip-tile';
  if (/[a-zA-Z]/.test(char)) {
    tile.classList.add('unit-tile');
  }
  tile.dataset.char = char;

  const topBg = document.createElement('div');
  topBg.className = 'flip-leaf flip-leaf-top-bg';
  const topBgSpan = document.createElement('span');
  topBgSpan.className = 'flip-char';
  topBgSpan.textContent = char;
  topBg.appendChild(topBgSpan);

  const bottomBg = document.createElement('div');
  bottomBg.className = 'flip-leaf flip-leaf-bottom-bg';
  const bottomBgSpan = document.createElement('span');
  bottomBgSpan.className = 'flip-char';
  bottomBgSpan.textContent = char;
  bottomBg.appendChild(bottomBgSpan);

  const hinge = document.createElement('div');
  hinge.className = 'flip-hinge-line';

  tile.appendChild(topBg);
  tile.appendChild(bottomBg);
  tile.appendChild(hinge);

  return tile;
}

function animateFlipTile(tile, prevChar, nextChar, delayMs = 0) {
  setTimeout(() => {
    if (!tile || !tile.isConnected) return;
    tile.dataset.char = nextChar;
    tile.classList.remove('is-flipping');
    tile.classList.toggle('unit-tile', /[a-zA-Z]/.test(nextChar));
    tile.querySelectorAll('.flip-leaf-top-flap, .flip-leaf-bottom-flap').forEach(el => el.remove());

    const topBgSpan = tile.querySelector('.flip-leaf-top-bg .flip-char');
    const bottomBgSpan = tile.querySelector('.flip-leaf-bottom-bg .flip-char');

    if (topBgSpan) topBgSpan.textContent = nextChar;
    if (bottomBgSpan) bottomBgSpan.textContent = prevChar;

    const topFlap = document.createElement('div');
    topFlap.className = 'flip-leaf flip-leaf-top-flap';
    const topFlapSpan = document.createElement('span');
    topFlapSpan.className = 'flip-char';
    topFlapSpan.textContent = prevChar;
    topFlap.appendChild(topFlapSpan);

    const bottomFlap = document.createElement('div');
    bottomFlap.className = 'flip-leaf flip-leaf-bottom-flap';
    const bottomFlapSpan = document.createElement('span');
    bottomFlapSpan.className = 'flip-char';
    bottomFlapSpan.textContent = nextChar;
    bottomFlap.appendChild(bottomFlapSpan);

    tile.appendChild(topFlap);
    tile.appendChild(bottomFlap);

    void tile.offsetWidth;
    tile.classList.add('is-flipping');

    setTimeout(() => {
      if (bottomBgSpan) bottomBgSpan.textContent = nextChar;
      topFlap.remove();
      bottomFlap.remove();
      tile.classList.remove('is-flipping');
    }, 260);
  }, delayMs);
}

function updateSplitFlap(containerEl, targetVal, minSlots = 2, cascadeOffset = 0) {
  if (!containerEl) return;

  const rawStr = String(targetVal ?? '0').trim();
  let formattedStr = rawStr;
  if (/^\d+$/.test(rawStr) && rawStr.length < minSlots) {
    formattedStr = rawStr.padStart(minSlots, '0');
  } else if (/^\d+h$/i.test(rawStr)) {
    const numPart = rawStr.slice(0, -1);
    const unit = rawStr.slice(-1).toUpperCase();
    formattedStr = numPart.padStart(minSlots, '0') + unit;
  }

  const chars = formattedStr.split('');
  const numDigits = chars.length;
  containerEl.dataset.digits = String(numDigits);
  containerEl.setAttribute('data-digits', String(numDigits));
  containerEl.className = `stat-value flip-digit-cluster digits-${numDigits}`;
  const parentCell = containerEl.closest('.stat-cell');
  if (parentCell) {
    parentCell.dataset.digits = String(numDigits);
    parentCell.setAttribute('data-digits', String(numDigits));
  }
  const oldVal = containerEl.dataset.value;
  containerEl.dataset.value = formattedStr;

  const existingTiles = Array.from(containerEl.querySelectorAll('.flip-tile'));
  if (existingTiles.length !== chars.length) {
    containerEl.innerHTML = '';
    chars.forEach((char, idx) => {
      const tile = createFlipTile(char);
      containerEl.appendChild(tile);
      if (oldVal !== undefined) {
        animateFlipTile(tile, '0', char, cascadeOffset + idx * 50);
      }
    });
    return;
  }

  chars.forEach((nextChar, idx) => {
    const tile = existingTiles[idx];
    const prevChar = tile.dataset.char || '0';
    if (prevChar !== nextChar) {
      animateFlipTile(tile, prevChar, nextChar, cascadeOffset + idx * 50);
    }
  });
}

function syncFlipBoardActiveFilter() {
  const type = state.watchlistFilters?.type || 'all';
  const status = state.watchlistFilters?.status || 'all';

  document.querySelectorAll('.stat-cell.flip-stat-cell').forEach(cell => {
    const filterType = cell.dataset.filterType;
    let isActive = false;
    if (status === 'completed' && filterType === 'completed') {
      isActive = true;
    } else if (status !== 'completed') {
      if (filterType === 'movie' && type === 'movie') isActive = true;
      else if (filterType === 'tv' && type === 'tv') isActive = true;
      else if (filterType === 'all' && type === 'all') isActive = true;
    }
    cell.classList.toggle('is-active-filter', isActive);
  });
}

// Watchlist Stats Ribbon Calculator (Split-Flap Display)
function renderWatchlistStats() {
  const total = state.watchlist.length;
  const movies = state.watchlist.filter(i => (i.mediaType || i.media_type) === 'movie').length;
  const shows = state.watchlist.filter(i => (i.mediaType || i.media_type) === 'tv').length;
  const completed = state.watchlist.filter(i => i.status === 'completed').length;

  let totalMinutes = 0;
  state.watchlist.forEach(i => {
    const isMovie = (i.mediaType || i.media_type) === 'movie';
    if (isMovie) {
      if (i.status === 'completed') {
        totalMinutes += (i.runtime || 110);
      }
    } else {
      if (i.status === 'completed') {
        const eps = i.totalEpisodes || i.currentEpisode || 10;
        totalMinutes += eps * (i.runtime || 45);
      } else {
        const eps = parseInt(i.currentEpisode, 10) || 0;
        if (eps > 0) {
          totalMinutes += eps * (i.runtime || 45);
        }
      }
    }
  });
  const totalHours = Math.round(totalMinutes / 60);

  const elTotal = document.getElementById('wlStatTotal');
  const elMovies = document.getElementById('wlStatMovies');
  const elShows = document.getElementById('wlStatShows');
  const elCompleted = document.getElementById('wlStatCompleted');
  const elTime = document.getElementById('wlStatTime');

  updateSplitFlap(elTotal, total, 2, 0);
  updateSplitFlap(elMovies, movies, 2, 50);
  updateSplitFlap(elShows, shows, 2, 100);
  updateSplitFlap(elCompleted, completed, 2, 150);
  updateSplitFlap(elTime, `${totalHours}h`, 2, 200);

  syncFlipBoardActiveFilter();
}

async function loadWatchlist() {
  const userId = state.user ? state.user.id : 'guest';

  // 1. Read from localStorage first (isolated per user)
  try {
    const raw = state.user
      ? localStorage.getItem(`moodflix_watchlist_${userId}`)
      : (localStorage.getItem(`moodflix_watchlist_${userId}`) || localStorage.getItem('moodflix_watchlist'));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        state.watchlist = parsed.map(normalizeWatchlistItem);
      }
    }
  } catch (e) {}

  // 2. Fetch server / Supabase watchlist
  try {
    const res = await fetch(`/api/user/watchlist?userId=${encodeURIComponent(userId)}`);
    const data = await res.json();
    if (data.success && Array.isArray(data.watchlist)) {
      const map = new Map();
      // Server items take precedence
      data.watchlist.forEach(item => {
        const norm = normalizeWatchlistItem(item);
        const key = (norm.isSeason && norm.seasonNumber)
          ? `tmdb_${norm.tmdbId}_${norm.mediaType}_s${norm.seasonNumber}`
          : (norm.tmdbId ? `tmdb_${norm.tmdbId}_${norm.mediaType}` : (norm.title || '').toLowerCase());
        map.set(key, norm);
      });
      // Merge local items not in server
      state.watchlist.forEach(item => {
        const norm = normalizeWatchlistItem(item);
        const key = (norm.isSeason && norm.seasonNumber)
          ? `tmdb_${norm.tmdbId}_${norm.mediaType}_s${norm.seasonNumber}`
          : (norm.tmdbId ? `tmdb_${norm.tmdbId}_${norm.mediaType}` : (norm.title || '').toLowerCase());
        if (!map.has(key)) {
          map.set(key, norm);
          // Sync to server in background
          if (state.user) {
            getAuthHeaders().then(authHeaders => {
              fetch('/api/user/watchlist', {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({ item: norm, userId })
              }).catch(() => {});
            });
          }
        }
      });
      state.watchlist = Array.from(map.values());
      localStorage.setItem(`moodflix_watchlist_${userId}`, JSON.stringify(state.watchlist));
      if (!state.user) {
        localStorage.setItem('moodflix_watchlist', JSON.stringify(state.watchlist));
      }
    }
  } catch (e) {}

  renderWatchlistStats();
  renderWatchlist();
}

async function saveWatchlist() {
  const userId = state.user ? state.user.id : 'guest';
  try {
    localStorage.setItem(`moodflix_watchlist_${userId}`, JSON.stringify(state.watchlist));
    if (!state.user) {
      localStorage.setItem('moodflix_watchlist', JSON.stringify(state.watchlist));
    }
  } catch (e) {}
  renderWatchlistStats();
  renderWatchlist();
}

function isItemInWatchlist(mediaOrTitle) {
  if (!mediaOrTitle) return false;
  return Boolean(findWatchlistItem(mediaOrTitle));
}

async function removeWatchlistItem(item) {
  if (!item) return;
  const userId = state.user ? state.user.id : 'guest';
  const targetId = item.id ? String(item.id) : null;
  const targetTitle = item.title || '';

  // Filter out ONLY this specific item (do not delete other seasons of the same show!)
  state.watchlist = state.watchlist.filter(w => {
    if (w === item) return false;
    if (targetId && w.id && String(w.id) === targetId) return false;
    if (item.isSeason && w.isSeason) {
      if (item.tmdbId && w.tmdbId === item.tmdbId && item.seasonNumber != null && w.seasonNumber != null) {
        return (item.seasonNumber !== w.seasonNumber);
      }
    }
    return true;
  });

  showToast(`Removed "${targetTitle}" from Watchlist`, 'info');
  await saveWatchlist();

  const deleteParam = targetId || encodeURIComponent(targetTitle);
  getAuthHeaders().then(authHeaders => {
    fetch(`/api/user/watchlist/${encodeURIComponent(deleteParam)}?userId=${encodeURIComponent(userId)}&title=${encodeURIComponent(targetTitle)}`, {
      method: 'DELETE',
      headers: authHeaders
    }).catch(() => {});
  });
}

const _pendingToggleWatchlist = new Set();
async function toggleWatchlistItem(media, mediaType = 'movie') {
  if (!media) return;
  const title = (media.title || media.name || '').trim();
  if (!title) return;
  const userId = state.user ? state.user.id : 'guest';

  // Mutual exclusion guard to prevent concurrent race duplicates
  const toggleKey = String(media.tmdbId || media.id || title).toLowerCase();
  if (_pendingToggleWatchlist.has(toggleKey)) return;
  _pendingToggleWatchlist.add(toggleKey);

  try {
    const targetItem = findWatchlistItem(media);

    if (targetItem) {
      await removeWatchlistItem(targetItem);
    } else {
      let enriched = { ...media };
      // Fetch complete metadata if not present
      if (media.id && (!media.runtime || !media.seasons)) {
        try {
          const detailsRes = await fetch(`/api/details?id=${media.id}&type=${mediaType || media.mediaType || 'movie'}&title=${encodeURIComponent(title)}`);
          const detailsData = await detailsRes.json();
          if (detailsData?.details) {
            enriched = { ...media, ...detailsData.details };
          }
        } catch (e) {}
      }

      const entry = normalizeWatchlistItem({
        id: enriched.id || Date.now().toString(),
        tmdbId: enriched.tmdbId || enriched.id || null,
        title: title,
        year: enriched.year || (enriched.releaseDate ? enriched.releaseDate.slice(0, 4) : ''),
        poster: enriched.poster || '',
        backdrop: enriched.backdrop || '',
        rating: enriched.rating || 0,
        voteCount: enriched.voteCount || 0,
        mediaType: mediaType || enriched.mediaType || 'movie',
        overview: enriched.synopsis || enriched.overview || '',
        genres: enriched.genres || [],
        runtime: enriched.runtime || 0,
        status: 'plan_to_watch',
        currentSeason: 1,
        currentEpisode: 0,
        totalSeasons: enriched.numberOfSeasons || (enriched.seasons ? enriched.seasons.length : 1),
        totalEpisodes: enriched.numberOfEpisodes || 0,
        progressPct: 0,
        nextAirDate: enriched.nextEpisodeToAir?.airDate || ''
      });

      state.watchlist.unshift(entry);
      showToast(`Added "${title}" to Watchlist (Cloud Synced)`, 'success');

      getAuthHeaders().then(authHeaders => {
        fetch('/api/user/watchlist', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ item: entry, userId })
        })
          .then(r => r.json())
          .then(data => {
            if (data.success && data.item?.id) {
              entry.id = data.item.id;
              saveWatchlist();
            }
          })
          .catch(() => {});
      });

      await saveWatchlist();
    }
  } finally {
    _pendingToggleWatchlist.delete(toggleKey);
  }

  updateDetailButtons(media);
}

function findWatchlistItem(mediaOrTitle) {
  if (!mediaOrTitle) return null;
  const targetTitle = typeof mediaOrTitle === 'string' ? mediaOrTitle.trim().toLowerCase() : (mediaOrTitle.title || mediaOrTitle.name || '').trim().toLowerCase();
  const targetId = typeof mediaOrTitle === 'object' && mediaOrTitle.id ? String(mediaOrTitle.id) : null;
  const targetTmdb = typeof mediaOrTitle === 'object' ? String(mediaOrTitle.tmdbId || mediaOrTitle.tmdb_id || mediaOrTitle.id || '') : null;
  const targetSeason = typeof mediaOrTitle === 'object' ? (mediaOrTitle.seasonNumber || mediaOrTitle.season_number || null) : null;

  return state.watchlist.find(w => {
    const wTitle = (w.title || '').trim().toLowerCase();
    const wId = w.id ? String(w.id) : null;
    const wTmdb = (w.tmdbId || w.tmdb_id) ? String(w.tmdbId || w.tmdb_id) : (w.id && !isNaN(w.id) ? String(w.id) : null);

    if (wId && targetId && wId === targetId) return true;
    if (wTmdb && targetTmdb && wTmdb === targetTmdb) {
      if (w.isSeason && targetSeason != null) {
        return (w.seasonNumber == targetSeason);
      }
      return (!w.isSeason || targetSeason == null);
    }
    if (w.isSeason && targetSeason != null && wTitle === targetTitle) {
      return (w.seasonNumber == targetSeason);
    }
    return targetTitle && (wTitle === targetTitle || (w.seriesTitle && targetTitle.length >= 4 && w.seriesTitle.toLowerCase() === targetTitle));
  }) || null;
}

function updateDetailButtons(media) {
  const targetMedia = media || state.currentDetailMedia;
  if (!targetMedia) return;
  if (media && (!state.currentDetailMedia || state.currentDetailMedia.id === media.id || state.currentDetailMedia.title === media.title)) {
    state.currentDetailMedia = { ...state.currentDetailMedia, ...media };
  }
  const item = findWatchlistItem(targetMedia);
  const isWatched = item && item.status === 'completed';
  const isWatchLater = item && item.status !== 'completed';
  const customListCount = (item && Array.isArray(item.customLists)) ? item.customLists.length : 0;

  // 1. WATCHED button
  const watchedBtn = document.getElementById('detailWatchedBtn');
  if (watchedBtn) {
    if (isWatched) {
      watchedBtn.textContent = '✓ WATCHED';
      watchedBtn.classList.add('active-watched');
      watchedBtn.classList.remove('not-watched');
      watchedBtn.title = 'Watched — click to mark as unwatched';
    } else {
      watchedBtn.textContent = 'UNWATCHED';
      watchedBtn.classList.remove('active-watched');
      watchedBtn.classList.add('not-watched');
      watchedBtn.title = 'Unwatched (default) — click to mark as watched';
    }
  }

  // 2. WATCH LATER button
  const wlBtn = document.getElementById('detailWatchlistBtn');
  if (wlBtn) {
    if (isWatchLater) {
      wlBtn.textContent = '✓ IN WATCH LATER';
      wlBtn.classList.add('active-watchlist');
      wlBtn.title = 'In Watch Later — click to remove';
    } else {
      wlBtn.textContent = '+ WATCH LATER';
      wlBtn.classList.remove('active-watchlist');
      wlBtn.title = 'Click to save to Watch Later';
    }
  }

  // 3. ADD TO LIST button
  const addToListBtn = document.getElementById('detailAddToListBtn');
  if (addToListBtn) {
    if (customListCount > 0) {
      addToListBtn.textContent = `✓ IN LISTS (${customListCount})`;
      addToListBtn.classList.add('active-in-list');
      addToListBtn.title = `Assigned to ${customListCount} custom list${customListCount === 1 ? '' : 's'} — click to edit`;
    } else {
      addToListBtn.textContent = '+ ADD TO LIST';
      addToListBtn.classList.remove('active-in-list');
      addToListBtn.title = 'Add to custom list or collection';
    }
  }
}

function updateDetailWatchlistButton(media) {
  updateDetailButtons(media);
}

async function handleDetailWatched(media, mediaType = 'movie') {
  let target = findWatchlistItem(media);
  const title = (media.title || media.name || 'Title').trim();
  const userId = state.user ? state.user.id : 'guest';

  if (!target) {
    let enriched = { ...media };
    if (media.id && (!media.runtime || !media.seasons)) {
      try {
        const detailsRes = await fetch(`/api/details?id=${media.id}&type=${mediaType || media.mediaType || 'movie'}&title=${encodeURIComponent(title)}`);
        const detailsData = await detailsRes.json();
        if (detailsData?.details) {
          enriched = { ...media, ...detailsData.details };
        }
      } catch (e) {}
    }

    const isTv = (mediaType || enriched.mediaType || 'movie').toLowerCase() === 'tv';
    const totalEpisodes = enriched.numberOfEpisodes || (enriched.seasons ? enriched.seasons.reduce((acc, s) => acc + (s.episode_count || 0), 0) : 0);

    target = normalizeWatchlistItem({
      id: enriched.id || Date.now().toString(),
      tmdbId: enriched.tmdbId || enriched.id || null,
      title: title,
      year: enriched.year || (enriched.releaseDate ? enriched.releaseDate.slice(0, 4) : ''),
      poster: enriched.poster || '',
      backdrop: enriched.backdrop || '',
      rating: enriched.rating || 0,
      voteCount: enriched.voteCount || 0,
      mediaType: mediaType || enriched.mediaType || 'movie',
      overview: enriched.synopsis || enriched.overview || '',
      genres: enriched.genres || [],
      runtime: enriched.runtime || 0,
      status: 'completed',
      currentSeason: enriched.seasonNumber != null ? parseInt(enriched.seasonNumber, 10) : 1,
      currentEpisode: totalEpisodes,
      totalSeasons: enriched.numberOfSeasons || (enriched.seasons ? enriched.seasons.length : 1),
      totalEpisodes: totalEpisodes,
      progressPct: 100,
      nextAirDate: ''
    });

    state.watchlist.unshift(target);
    showToast(`Marked "${title}" as Watched`, 'success');

    getAuthHeaders().then(authHeaders => {
      fetch('/api/user/watchlist', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ item: target, userId })
      })
        .then(r => r.json())
        .then(data => {
          if (data.success && data.item?.id) {
            target.id = data.item.id;
            saveWatchlist();
          }
        })
        .catch(() => {});
    });
  } else {
    const isCurrentlyWatched = target.status === 'completed';
    const newStatus = isCurrentlyWatched ? 'plan_to_watch' : 'completed';
    target.status = newStatus;
    const isTv = (target.mediaType || 'movie').toLowerCase() === 'tv';
    if (isTv && target.totalEpisodes) {
      if (newStatus === 'completed') {
        target.currentEpisode = target.totalEpisodes;
        target.progressPct = 100;
      } else if (target.currentEpisode === target.totalEpisodes) {
        target.currentEpisode = 0;
        target.progressPct = 0;
      }
    }
    getAuthHeaders().then(authHeaders => {
      fetch(`/api/user/watchlist/${target.id}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({
          userId,
          updates: {
            status: newStatus,
            current_episode: target.currentEpisode,
            progress_pct: target.progressPct
          }
        })
      }).catch(() => {});
    });
    showToast(newStatus === 'completed' ? `Marked "${target.title}" as Watched` : `Marked "${target.title}" as Unwatched`, 'info');
  }

  await saveWatchlist();
  updateDetailButtons(media);
  renderWatchlist();
  renderWatchlistStats();
}

async function handleDetailWatchLater(media, mediaType = 'movie') {
  let target = findWatchlistItem(media);
  const title = (media.title || media.name || 'Title').trim();

  if (target && target.status === 'plan_to_watch') {
    await removeWatchlistItem(target);
  } else if (target && target.status === 'completed') {
    target.status = 'plan_to_watch';
    const userId = state.user ? state.user.id : 'guest';
    fetch(`/api/user/watchlist/${target.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, updates: { status: 'plan_to_watch' } })
    }).catch(() => {});
    await saveWatchlist();
    showToast(`Moved "${title}" to Watch Later`, 'success');
  } else {
    await toggleWatchlistItem(media, mediaType);
  }

  updateDetailButtons(media);
  renderWatchlist();
  renderWatchlistStats();
}

async function handleDetailAddToList(media, mediaType = 'movie') {
  let target = findWatchlistItem(media);
  if (!target) {
    await toggleWatchlistItem(media, mediaType);
    target = findWatchlistItem(media);
  }
  if (target) {
    openAssignToListModal(target);
  } else {
    const fallbackItem = normalizeWatchlistItem({
      id: media.id || Date.now().toString(),
      tmdbId: media.tmdbId || media.id || null,
      title: media.title || media.name || 'Title',
      mediaType: mediaType || media.mediaType || 'movie',
      poster: media.poster || '',
      customLists: []
    });
    state.watchlist.unshift(fallbackItem);
    await saveWatchlist();
    openAssignToListModal(fallbackItem);
  }
}

// Adjust Episode Progress (+1 / -1 EP)
async function adjustEpisodeProgress(item, delta) {
  const target = state.watchlist.find(w => {
    if (w.id === item.id) return true;
    if (item.isSeason && w.isSeason && w.tmdbId && w.tmdbId === item.tmdbId && w.seasonNumber === item.seasonNumber) return true;
    if (!item.isSeason && !w.isSeason && w.tmdbId && w.tmdbId === item.tmdbId) return true;
    return false;
  });
  if (!target) return;

  const totalEp = target.totalEpisodes || 0;
  const currentEp = Math.max(0, Math.min(totalEp || 9999, (target.currentEpisode || 0) + delta));
  target.currentEpisode = currentEp;
  target.progressPct = totalEp > 0 ? Math.min(100, Math.round((currentEp / totalEp) * 100)) : 0;

  if (totalEp > 0 && currentEp >= totalEp) {
    target.status = 'completed';
    showToast(`🎉 Marked "${target.title}" as Completed!`, 'success');
  } else if (currentEp > 0) {
    target.status = 'watching';
  } else {
    target.status = 'plan_to_watch';
  }

  saveWatchlist();

  const userId = state.user ? state.user.id : 'guest';
  fetch(`/api/user/watchlist/${target.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      updates: {
        current_episode: target.currentEpisode,
        progress_pct: target.progressPct,
        status: target.status
      }
    })
  }).catch(() => {});
}

// Render Watchlist Grid with Advanced Filters & Unified Tracking
function renderWatchlist() {
  const grid = document.getElementById('watchlistGrid');
  const emptyState = document.getElementById('watchlistEmptyState');
  const countBadge = document.getElementById('watchlistCountBadge');
  const clearBtn = document.getElementById('btnClearWatchlist');

  const totalCount = state.watchlist.length;
  if (countBadge) {
    countBadge.textContent = `${totalCount} TITLE${totalCount === 1 ? '' : 'S'}`;
  }

  const moreWrap = document.getElementById('wlMoreActionsWrap');
  if (moreWrap) {
    moreWrap.classList.toggle('hidden', totalCount === 0);
  }
  if (clearBtn) {
    clearBtn.classList.toggle('hidden', totalCount === 0);
  }

  // Filter Pipeline
  const { type, status, genre, year, minRating, runtime, sort, search } = state.watchlistFilters;
  const legacyFilter = state.watchlistFilter || 'all';

  let filtered = state.watchlist.filter(item => {
    // Media Type Filter
    const itemType = (item.mediaType || 'movie').toLowerCase();
    if (type !== 'all' && itemType !== type) return false;
    if (legacyFilter !== 'all' && itemType !== legacyFilter) return false;

    // Watch Status Filter
    if (status !== 'all' && (item.status || 'plan_to_watch') !== status) return false;

    // Genre Filter
    if (genre !== 'all') {
      const genres = Array.isArray(item.genres) ? item.genres : [];
      if (!genres.some(g => String(g).toLowerCase() === genre.toLowerCase())) return false;
    }

    // Release Year Filter
    if (year && year !== 'all' && !matchesYearFilter(item.year, year)) return false;

    // Min Rating Filter
    if (minRating > 0 && (parseFloat(item.rating) || 0) < minRating) return false;

    // Runtime Filter
    if (runtime !== 'all') {
      const r = parseInt(item.runtime || 0, 10);
      if (runtime === 'under_90' && (r === 0 || r >= 90)) return false;
      if (runtime === 'under_120' && (r === 0 || r >= 120)) return false;
      if (runtime === 'over_120' && r < 120) return false;
    }

    // Custom List Filter
    if (state.activeCustomListId !== 'all') {
      const lists = Array.isArray(item.customLists) ? item.customLists : [];
      if (!lists.includes(state.activeCustomListId)) return false;
    }

    // Text Search Filter
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      const matchTitle = (item.title || '').toLowerCase().includes(q);
      const matchOverview = (item.overview || '').toLowerCase().includes(q);
      if (!matchTitle && !matchOverview) return false;
    }

    return true;
  });

  // Sorting Pipeline (Immutable)
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'date_asc') return (new Date(a.createdAt || 0)) - (new Date(b.createdAt || 0));
    if (sort === 'rating_desc') return (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0);
    if (sort === 'year_desc') return (parseInt(b.year) || 0) - (parseInt(a.year) || 0);
    if (sort === 'year_asc') return (parseInt(a.year) || 0) - (parseInt(b.year) || 0);
    if (sort === 'title_asc') return (a.title || '').localeCompare(b.title || '');
    if (sort === 'runtime_desc') return (parseInt(b.runtime) || 0) - (parseInt(a.runtime) || 0);
    // default: date_desc
    return (new Date(b.createdAt || 0)) - (new Date(a.createdAt || 0));
  });

  if (!grid || !emptyState) return;

  if (sorted.length === 0) {
    grid.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  grid.innerHTML = sorted.map((item, idx) => {
    const safeTitle = escapeHtml(item.title);
    const safeYear = escapeHtml(item.year || '');
    const safePoster = escapeHtml(item.poster || 'images/hero.webp');
    const safeRating = item.rating ? Number(item.rating).toFixed(1) : '—';
    const isTv = (item.mediaType || 'movie').toLowerCase() === 'tv';
    const safeType = isTv ? 'TV SERIES' : 'MOVIE';
    const statusVal = item.status || 'plan_to_watch';
    const isWatched = statusVal === 'completed';
    const watchedIcon = isWatched ? 'visibility' : 'visibility_off';
    const watchedTitle = isWatched ? 'Watched — click to mark as unwatched' : 'Unwatched — click to mark as watched';

    let statusClass = 'wl-status-plan';
    let statusLabel = 'UNWATCHED';
    if (statusVal === 'watching') { statusClass = 'wl-status-watching'; statusLabel = 'IN PROGRESS'; }
    else if (statusVal === 'completed') { statusClass = 'wl-status-completed'; statusLabel = 'WATCHED'; }
    else if (statusVal === 'dropped') { statusClass = 'wl-status-dropped'; statusLabel = 'DROPPED'; }

    // TV Progress Tracker snippet
    let tvProgressHtml = '';
    if (isTv) {
      const epCount = item.currentEpisode || 0;
      const totalEp = item.totalEpisodes || item.total_episodes || 0;
      const pct = item.progressPct || 0;
      const isSeparatedSeason = Boolean(item.isSeason);
      const canSeparate = !isSeparatedSeason && ((item.totalSeasons && item.totalSeasons > 1) || (totalEp > 25) || (!totalEp));

      tvProgressHtml = `
        <div class="wl-tv-progress-box">
          <div class="wl-tv-progress-header">
            <span class="wl-tv-ep-text">${isSeparatedSeason ? `S${item.seasonNumber || item.currentSeason || 1}` : `S${item.currentSeason || 1}`} • E${epCount} / ${totalEp ? totalEp + ' EPS' : 'ONGOING'}</span>
            <span class="wl-tv-pct-text">${pct}%</span>
          </div>
          <div class="wl-progress-track">
            <div class="wl-progress-fill" style="width: ${pct}%;"></div>
          </div>
          <div class="wl-tv-step-buttons">
            <button type="button" class="wl-step-btn btn-wl-step-down" title="Previous episode">-1</button>
            <button type="button" class="wl-step-btn btn-wl-step-up" title="Next episode">+1 EP</button>
            <button type="button" class="wl-step-btn btn-wl-episodes" title="Episode checklist">EPISODES</button>
          </div>
          ${canSeparate ? `
            <button type="button" class="retro-btn btn-wl-separate" title="Separate ${safeTitle} into individual season cards">
              <span class="material-symbols-outlined" style="font-size: 13px; vertical-align: middle; margin-right: 3px;">view_agenda</span>
              SEPARATE SEASONS
            </button>
          ` : ''}
        </div>
      `;
    }

    return `
      <div class="watchlist-item-card" data-idx="${idx}" data-id="${item.id}">
        <div class="watchlist-poster-wrap" role="button" tabindex="0" title="View details for ${safeTitle}">
          <div class="wl-card-header-tags">
            <div class="wl-tags-left">
              <span class="watchlist-type-badge ${item.isSeason ? 'badge-tv badge-tv-season' : (isTv ? 'badge-tv' : 'badge-movie')}">${item.isSeason ? `SEASON ${item.seasonNumber || item.currentSeason || 1}` : (isTv ? 'TV' : 'MOVIE')}</span>
              ${isWatched ? `<span class="wl-status-badge wl-status-completed"><span class="material-symbols-outlined" style="font-size:11px; vertical-align:middle; margin-right:2px;">check</span>WATCHED</span>` : (statusVal === 'watching' ? `<span class="wl-status-badge wl-status-watching">WATCHING</span>` : '')}
            </div>
            <div class="wl-tags-right">
              <span class="watchlist-rating-badge">★ ${safeRating}</span>
            </div>
          </div>
          <img src="${safePoster}" alt="${safeTitle}" onerror="this.src='images/hero.webp'" loading="lazy" />
        </div>
        <div class="watchlist-item-info">
          <div class="watchlist-item-header">
            <h3 class="watchlist-item-title" title="${safeTitle}">${safeTitle}</h3>
            <div class="watchlist-item-meta">${safeYear ? safeYear + ' • ' : ''}${item.isSeason ? `SEASON ${item.seasonNumber || 1}` : safeType}${item.runtime ? ' • ' + item.runtime + 'm' : ''}</div>
          </div>
          
          ${tvProgressHtml}

          <div class="watchlist-item-actions">
            <!-- Row 1: Primary Stream/Download Actions -->
            <div class="watchlist-action-row">
              <button type="button" class="retro-btn watchlist-action-btn btn-wl-torrent" title="Search verified torrents">
                <span class="material-symbols-outlined">download</span>
                <span>TORRENTS</span>
              </button>
              <button type="button" class="retro-btn watchlist-action-btn btn-wl-trailer" title="Watch trailer">
                <span class="material-symbols-outlined">play_arrow</span>
                <span>TRAILER</span>
              </button>
            </div>

            <!-- Row 2: Secondary Quick Utilities -->
            <div class="wl-extra-actions-row">
              <button type="button" class="wl-pill-btn wl-stream-btn btn-wl-stream" title="Where to stream">
                <span class="material-symbols-outlined" style="font-size: 13px;">play_circle</span>
                <span>STREAM</span>
              </button>
              <button type="button" class="wl-pill-btn wl-diary-btn btn-wl-diary" title="Log rating & review">
                <span class="material-symbols-outlined" style="font-size: 13px;">history_edu</span>
                <span>DIARY</span>
              </button>
            </div>

            <!-- Row 3: Management Controls -->
            <div class="wl-card-icons-row">
              <button type="button" class="retro-btn wl-card-icon-btn btn-wl-assign-list" title="Add to custom list">
                <span class="material-symbols-outlined">playlist_add</span>
                <span class="wl-btn-label">LIST</span>
              </button>
              <button type="button" class="retro-btn wl-card-icon-btn btn-wl-toggle-watched ${isWatched ? 'is-watched' : ''}" title="${watchedTitle}">
                <span class="material-symbols-outlined">${isWatched ? 'check_circle' : 'visibility'}</span>
                <span class="wl-btn-label">${isWatched ? 'WATCHED' : 'UNWATCHED'}</span>
              </button>
              <button type="button" class="retro-btn wl-card-icon-btn wl-delete-icon-btn btn-wl-remove" title="Delete from watchlist">
                <span class="material-symbols-outlined">delete</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Wire event handlers for every watchlist card
  grid.querySelectorAll('.watchlist-item-card').forEach((card, i) => {
    const item = filtered[i];
    if (!item) return;
    const isTv = (item.mediaType || 'movie').toLowerCase() === 'tv';
    card.querySelector('.watchlist-poster-wrap')?.addEventListener('click', (e) => {
      openDetailView(item, item.mediaType || 'movie');
    });
    card.querySelector('.watchlist-item-title')?.addEventListener('click', () => {
      openDetailView(item, item.mediaType || 'movie');
    });
    card.querySelector('.btn-wl-torrent')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (item.isSeason) {
        openTorrentModal(item, 'tv', false, item.seasonNumber || 1);
      } else {
        openTorrentModal(item, item.mediaType || 'movie', false);
      }
    });

    card.querySelector('.btn-wl-separate')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await splitTvShowIntoSeasons(item);
    });
    card.querySelector('.btn-wl-trailer')?.addEventListener('click', (e) => {
      e.stopPropagation();
      playTrailer(item.id, item.mediaType || 'movie', item.title, item.year);
    });
    card.querySelector('.btn-wl-remove')?.addEventListener('click', (e) => {
      e.stopPropagation();
      removeWatchlistItem(item);
    });

    // Episode Tracker Controls
    card.querySelector('.btn-wl-step-up')?.addEventListener('click', (e) => {
      e.stopPropagation();
      adjustEpisodeProgress(item, 1);
    });
    card.querySelector('.btn-wl-step-down')?.addEventListener('click', (e) => {
      e.stopPropagation();
      adjustEpisodeProgress(item, -1);
    });
    card.querySelector('.btn-wl-episodes')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openEpisodeModal(item);
    });


    // Streaming Providers
    card.querySelector('.btn-wl-stream')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openStreamingModal(item);
    });

    // Log to Watch Diary
    card.querySelector('.btn-wl-diary')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openDiaryModal(item);
    });

    // Assign to Custom Lists
    card.querySelector('.btn-wl-assign-list')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openAssignToListModal(item);
    });

    // Toggle Watched (Eye on and off)
    card.querySelector('.btn-wl-toggle-watched')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isCurrentlyWatched = item.status === 'completed';
      const newStatus = isCurrentlyWatched ? 'plan_to_watch' : 'completed';
      item.status = newStatus;

      // Update TV show progress if applicable
      if (isTv && item.totalEpisodes) {
        if (newStatus === 'completed') {
          item.currentEpisode = item.totalEpisodes;
          item.progressPct = 100;
        } else if (item.currentEpisode === item.totalEpisodes) {
          item.currentEpisode = 0;
          item.progressPct = 0;
        }
      }

      saveWatchlist();
      const userId = state.user ? state.user.id : 'guest';
      fetch(`/api/user/watchlist/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          updates: {
            status: newStatus,
            current_episode: item.currentEpisode,
            progress_pct: item.progressPct
          }
        })
      }).catch(() => {});

      const itemTitle = item.title || 'Title';
      showToast(newStatus === 'completed' ? `Watched "${itemTitle}"` : `Marked "${itemTitle}" as Unwatched`, 'info');
      renderWatchlist();
    });
  });
}
// ==========================================================================
// Watchlist Studio: TV Season & Episode Checklist Tracker
// ==========================================================================
async function openEpisodeModal(item) {
  if (!item) return;
  state.currentTvItemForEpisodes = item;
  const modal = document.getElementById('episodeModal');
  const modalTitle = document.getElementById('episodeModalTitle');
  const seasonSelect = document.getElementById('episodeSeasonSelect');
  if (!modal || !seasonSelect) return;

  const displayTitle = item.isSeason ? (item.seriesTitle || item.title) : item.title;
  if (modalTitle) {
    modalTitle.textContent = `${(displayTitle || 'SERIES').toUpperCase()} - EPISODES`;
  }

  // Populate seasons dropdown
  const totalSeasons = Math.max(1, item.totalSeasons || 1);
  seasonSelect.innerHTML = '';
  for (let s = 1; s <= totalSeasons; s++) {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = `SEASON ${s}`;
    if (item.isSeason && s === (item.seasonNumber || 1)) {
      opt.selected = true;
    } else if (!item.isSeason && s === (item.currentSeason || 1)) {
      opt.selected = true;
    }
    seasonSelect.appendChild(opt);
  }

  modal.classList.remove('hidden');
  await loadSeasonEpisodes(parseInt(seasonSelect.value, 10));
}

function closeEpisodeModal() {
  const modal = document.getElementById('episodeModal');
  if (modal) modal.classList.add('hidden');
  state.currentTvItemForEpisodes = null;
}

async function loadSeasonEpisodes(seasonNum) {
  const item = state.currentTvItemForEpisodes;
  const listEl = document.getElementById('episodeModalList');
  const progressText = document.getElementById('episodeProgressText');
  const progressBar = document.getElementById('episodeProgressBar');
  if (!item || !listEl) return;

  listEl.innerHTML = `<div class="episode-loading"><span class="material-symbols-outlined spin-icon">sync</span> Loading Season ${seasonNum} episodes...</div>`;

  try {
    const tmdbId = item.tmdbId || item.id;
    const res = await fetch(`/api/tv/episodes?id=${tmdbId}&season=${seasonNum}`);
    const data = await res.json();
    const rawEpisodes = Array.isArray(data.episodes) ? data.episodes : (data.episodes?.episodes || data.season?.episodes || []);
    const episodes = rawEpisodes.map(ep => ({
      episodeNumber: ep.episode_number || ep.episodeNumber || 1,
      name: ep.name || ep.title || `Episode ${ep.episode_number || ep.episodeNumber || 1}`,
      overview: ep.overview || '',
      airDate: ep.air_date || ep.airDate || ''
    }));

    if (episodes.length === 0) {
      listEl.innerHTML = `<div class="episode-empty-state">No episode metadata found for Season ${seasonNum}.</div>`;
      return;
    }

    const activeItem = (item.isSeason && (item.seasonNumber === seasonNum))
      ? item
      : (item.isSeason
          ? (state.watchlist.find(w => w.isSeason && (w.tmdbId === item.tmdbId || (w.seriesTitle && w.seriesTitle === item.seriesTitle)) && w.seasonNumber === seasonNum) || item)
          : item);

    const currentSeason = activeItem.isSeason ? (activeItem.seasonNumber || seasonNum) : (activeItem.currentSeason || 1);
    const currentEpisode = activeItem.currentEpisode || 0;

    // Update progress indicator
    const totalEpisodes = activeItem.totalEpisodes || episodes.length;
    const currentProgressPct = totalEpisodes > 0 ? Math.min(100, Math.round((currentEpisode / totalEpisodes) * 100)) : 0;
    if (progressText) {
      progressText.textContent = `${currentEpisode} / ${totalEpisodes} EPISODES WATCHED (${currentProgressPct}%)`;
    }
    if (progressBar) {
      progressBar.style.width = `${currentProgressPct}%`;
    }

    listEl.innerHTML = episodes.map(ep => {
      const epNum = ep.episodeNumber;
      const safeEpTitle = escapeHtml(ep.name || `Episode ${epNum}`);
      const safeOverview = escapeHtml(ep.overview || '');
      const safeAirDate = escapeHtml(ep.airDate || '');
      const isWatched = activeItem.isSeason
        ? (currentEpisode >= epNum)
        : ((currentSeason > seasonNum) || (currentSeason === seasonNum && currentEpisode >= epNum));

      return `
        <div class="episode-item-row ${isWatched ? 'episode-watched' : ''}" data-ep="${epNum}">
          <button type="button" class="retro-check-btn ${isWatched ? 'checked' : ''}" title="Toggle episode watched">
            ${isWatched ? '✓' : ''}
          </button>
          <div class="episode-row-meta">
            <div class="episode-row-title-bar">
              <span class="episode-tag">E${epNum}</span>
              <strong class="episode-row-title">${safeEpTitle}</strong>
              ${safeAirDate ? `<span class="episode-row-date">${safeAirDate}</span>` : ''}
            </div>
            ${safeOverview ? `<p class="episode-row-desc">${safeOverview}</p>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Wire checkbox clicks
    listEl.querySelectorAll('.episode-item-row').forEach(row => {
      const epNum = parseInt(row.dataset.ep, 10);
      row.querySelector('.retro-check-btn')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const isWatched = row.classList.contains('episode-watched');
        if (isWatched) {
          // Unmark down to previous episode
          activeItem.currentSeason = seasonNum;
          activeItem.currentEpisode = Math.max(0, epNum - 1);
        } else {
          // Mark watched up to this episode
          activeItem.currentSeason = seasonNum;
          activeItem.currentEpisode = epNum;
        }

        const totalEps = activeItem.totalEpisodes || episodes.length;
        activeItem.progressPct = totalEps > 0 ? Math.min(100, Math.round((activeItem.currentEpisode / totalEps) * 100)) : 0;
        if (activeItem.currentEpisode > 0 && activeItem.status === 'plan_to_watch') {
          activeItem.status = 'watching';
        }
        if (totalEps > 0 && activeItem.currentEpisode >= totalEps) {
          activeItem.status = 'completed';
          showToast(`🎉 You completed "${activeItem.title}"!`, 'success');
        } else if (activeItem.currentEpisode === 0 && activeItem.status === 'completed') {
          activeItem.status = 'plan_to_watch';
        }

        await saveWatchlist();
        const userId = state.user ? state.user.id : 'guest';
        fetch(`/api/user/watchlist/${activeItem.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            updates: {
              current_season: activeItem.currentSeason,
              current_episode: activeItem.currentEpisode,
              progress_pct: activeItem.progressPct,
              status: activeItem.status
            }
          })
        }).catch(() => {});

        await loadSeasonEpisodes(seasonNum);
      });
    });

  } catch (err) {
    listEl.innerHTML = `<div class="episode-empty-state">Failed to load episodes. Please try again.</div>`;
  }
}

async function markSeasonCompleted(seasonNum) {
  const item = state.currentTvItemForEpisodes;
  if (!item) return;

  try {
    const tmdbId = item.tmdbId || item.id;
    const res = await fetch(`/api/tv/episodes?id=${tmdbId}&season=${seasonNum}`);
    const data = await res.json();
    const rawEpisodes = Array.isArray(data.episodes) ? data.episodes : (data.episodes?.episodes || data.season?.episodes || []);
    const lastEp = rawEpisodes.length > 0 ? (rawEpisodes[rawEpisodes.length - 1].episode_number || rawEpisodes[rawEpisodes.length - 1].episodeNumber || rawEpisodes.length) : 10;

    item.currentSeason = seasonNum;
    item.currentEpisode = lastEp;
    const isFinalSeason = seasonNum >= (item.totalSeasons || 1);
    if (item.isSeason) {
      item.progressPct = 100;
      item.status = 'completed';
    } else if (isFinalSeason) {
      item.progressPct = 100;
      item.status = 'completed';
    } else {
      const seasonFraction = (seasonNum / Math.max(1, item.totalSeasons || 1));
      item.progressPct = Math.min(99, Math.round(seasonFraction * 100));
      item.status = 'watching';
    }

    showToast(`✓ Marked Season ${seasonNum} of "${item.title}" as Watched!`, 'success');
    await saveWatchlist();

    const userId = state.user ? state.user.id : 'guest';
    const authHeaders = await getAuthHeaders();
    fetch(`/api/user/watchlist/${item.id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        userId,
        updates: {
          current_season: item.currentSeason,
          current_episode: item.currentEpisode,
          progress_pct: item.progressPct,
          status: item.status
        }
      })
    }).catch(() => {});

    await loadSeasonEpisodes(seasonNum);
  } catch (e) {}
}

// ==========================================================================
// Watchlist Studio: Personal Watch Diary System
// ==========================================================================
function formatDiaryDate(dateStr) {
  if (!dateStr) return '';
  try {
    const parts = String(dateStr).split('T')[0].split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
      }
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
    }
  } catch (e) {}
  return String(dateStr).toUpperCase();
}

async function loadDiaryEntries() {
  const userId = state.user ? state.user.id : 'guest';
  try {
    const raw = localStorage.getItem(`moodflix_diary_${userId}`);
    if (raw) {
      state.diaryEntries = JSON.parse(raw);
    }
  } catch (e) {}

  try {
    const res = await fetch(`/api/user/diary?userId=${encodeURIComponent(userId)}`);
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data.diary) ? data.diary : (Array.isArray(data.entries) ? data.entries : null);
      if (data.success && Array.isArray(list)) {
        state.diaryEntries = list;
        localStorage.setItem(`moodflix_diary_${userId}`, JSON.stringify(list));
      }
    }
  } catch (e) {
    console.warn('Failed to fetch diary entries from database:', e);
  }

  renderDiaryEntries();
}

function renderDiaryEntries() {
  const container = document.getElementById('diaryList');
  const emptyState = document.getElementById('diaryEmptyState');
  const countBadge = document.getElementById('diaryCountBadge');
  if (!container || !emptyState) return;

  const entriesCount = state.diaryEntries.length;
  if (countBadge) {
    countBadge.textContent = `${entriesCount} ${entriesCount === 1 ? 'ENTRY' : 'ENTRIES'}`;
  }

  if (entriesCount === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  container.innerHTML = state.diaryEntries.map((entry, idx) => {
    const safeTitle = escapeHtml(entry.title || entry.movie_title || 'Untitled');
    const safePoster = escapeHtml(entry.poster || entry.poster_path || 'images/hero.webp');
    const rawDate = entry.watch_date || entry.watched_date || entry.watchedDate || '';
    const formattedDate = formatDiaryDate(rawDate) || 'RECENT';
    const safeRating = entry.rating ? Number(entry.rating).toFixed(1) : '—';
    const safeYear = entry.year ? escapeHtml(String(entry.year)) : '';
    const isRewatch = Boolean(entry.rewatch);
    const safeReview = escapeHtml(entry.review || entry.diaryNotes || entry.diary_notes || entry.notes || '');

    return `
      <div class="diary-entry-card" data-idx="${idx}" data-id="${entry.id}">
        <div class="diary-card-poster-wrap" title="View details for ${safeTitle}">
          <img src="${safePoster}" alt="${safeTitle}" class="diary-card-poster" onerror="this.src='images/hero.webp'" loading="lazy">
        </div>
        <div class="diary-card-body">
          <div class="diary-card-top">
            <div class="diary-card-date-badge" title="Watch date">
              <span class="material-symbols-outlined" style="font-size: 15px;">event</span>
              <span>${formattedDate}</span>
            </div>
            <div class="diary-card-top-right">
              ${isRewatch ? '<span class="retro-tag-pill rewatch-tag" title="Rewatch"><span class="material-symbols-outlined" style="font-size: 13px;">replay</span> REWATCH</span>' : ''}
              <button type="button" class="btn-delete-diary" title="Delete diary entry" aria-label="Delete diary entry">
                <span class="material-symbols-outlined">delete</span>
              </button>
            </div>
          </div>
          <div class="diary-card-title-row">
            <h4 class="diary-card-title" title="Click to view details for ${safeTitle}" role="button" tabindex="0">${safeTitle}</h4>
            ${safeYear ? `<span class="diary-card-year">(${safeYear})</span>` : ''}
          </div>
          <div class="diary-card-rating-row">
            <span class="diary-rating-badge">
              <span class="diary-rating-star">★</span>
              <span class="diary-rating-num">${safeRating}</span>
              <span class="diary-rating-max">/10</span>
            </span>
          </div>
          ${safeReview ? `
            <div class="diary-card-review-box">
              <span class="material-symbols-outlined diary-quote-icon">format_quote</span>
              <p class="diary-card-review">${safeReview}</p>
            </div>
          ` : `
            <div class="diary-card-no-review">
              <span class="material-symbols-outlined">notes</span>
              <span>No written notes logged.</span>
            </div>
          `}
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.diary-entry-card').forEach((card, i) => {
    const entry = state.diaryEntries[i];
    if (!entry) return;

    card.querySelector('.btn-delete-diary')?.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteDiaryEntry(entry.id);
    });

    const openItemDetail = async (e) => {
      if (e) e.stopPropagation();
      const match = state.watchlist.find(w =>
        (entry.tmdb_id && (String(w.id) === String(entry.tmdb_id) || String(w.tmdbId) === String(entry.tmdb_id))) ||
        (w.title && entry.title && w.title.toLowerCase() === entry.title.toLowerCase())
      );
      if (match) {
        openDetailView(match, match.mediaType || entry.media_type || 'movie');
        return;
      }
      if (entry.tmdb_id && !isNaN(entry.tmdb_id)) {
        openDetailView({
          id: entry.tmdb_id,
          tmdbId: entry.tmdb_id,
          title: entry.title,
          poster: entry.poster,
          mediaType: entry.media_type || 'movie',
          year: entry.year
        }, entry.media_type || 'movie');
        return;
      }
      try {
        const sRes = await fetch(`/api/media/rapid-search?q=${encodeURIComponent(entry.title || '')}`);
        const sData = await sRes.json();
        if (sData.results && sData.results.length > 0) {
          const top = sData.results[0];
          openDetailView(top, top.mediaType || entry.media_type || 'movie');
          return;
        }
      } catch (err) {}
      openDetailView({
        id: entry.tmdb_id || entry.id,
        title: entry.title,
        poster: entry.poster,
        mediaType: entry.media_type || 'movie',
        year: entry.year
      }, entry.media_type || 'movie');
    };

    card.querySelector('.diary-card-poster-wrap')?.addEventListener('click', openItemDetail);
    card.querySelector('.diary-card-title')?.addEventListener('click', openItemDetail);
    card.querySelector('.diary-card-title')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openItemDetail(e);
      }
    });
  });
}

function openDiaryModal(item = null) {
  state.currentDiaryItem = item;
  const modal = document.getElementById('diaryModal');
  const titleEl = document.getElementById('diaryModalMediaTitle');
  const yearEl = document.getElementById('diaryModalMediaYear');
  const posterEl = document.getElementById('diaryModalPoster');
  const previewBox = document.querySelector('.diary-modal-preview');
  const directTitleGroup = document.getElementById('diaryDirectTitleGroup');
  const directTitleInput = document.getElementById('diaryMovieTitleInput');
  const dateInput = document.getElementById('diaryWatchDate');
  const ratingSlider = document.getElementById('diaryRatingSlider');
  const ratingDisplay = document.getElementById('diaryRatingDisplay');
  const reviewText = document.getElementById('diaryReviewText');
  const rewatchCheck = document.getElementById('diaryRewatchCheck');

  if (!modal) return;

  if (item) {
    if (previewBox) previewBox.style.display = 'flex';
    if (directTitleGroup) directTitleGroup.style.display = 'none';
    if (directTitleInput) directTitleInput.value = item.title || '';
    if (titleEl) titleEl.textContent = item.title;
    if (yearEl) yearEl.textContent = item.year || '';
    if (posterEl) posterEl.src = item.poster || 'images/hero.webp';
    if (reviewText) reviewText.value = item.diaryNotes || item.diary_notes || '';
    if (ratingSlider) {
      ratingSlider.value = item.userRating || 8;
      if (ratingDisplay) ratingDisplay.textContent = item.userRating ? Number(item.userRating).toFixed(1) : '8.0';
    }
  } else {
    if (previewBox) previewBox.style.display = 'none';
    if (directTitleGroup) directTitleGroup.style.display = 'block';
    if (directTitleInput) {
      directTitleInput.value = '';
      setTimeout(() => directTitleInput.focus(), 60);
    }
    if (titleEl) titleEl.textContent = 'LOG RECENT SCREENING';
    if (yearEl) yearEl.textContent = '';
    if (posterEl) posterEl.src = 'images/hero.webp';
    if (reviewText) reviewText.value = '';
    if (ratingSlider) {
      ratingSlider.value = 8;
      if (ratingDisplay) ratingDisplay.textContent = '8.0';
    }
  }

  if (dateInput) {
    dateInput.value = (item?.watchedDate) || new Date().toISOString().slice(0, 10);
  }
  if (rewatchCheck) rewatchCheck.checked = false;

  modal.classList.remove('hidden');
}

function closeDiaryModal() {
  const modal = document.getElementById('diaryModal');
  if (modal) modal.classList.add('hidden');
  state.currentDiaryItem = null;
  const directTitleInput = document.getElementById('diaryMovieTitleInput');
  if (directTitleInput) directTitleInput.value = '';
}

async function saveDiaryEntry(e) {
  if (e && e.preventDefault) e.preventDefault();
  const dateInput = document.getElementById('diaryWatchDate');
  const ratingSlider = document.getElementById('diaryRatingSlider');
  const reviewText = document.getElementById('diaryReviewText');
  const rewatchCheck = document.getElementById('diaryRewatchCheck');
  const directTitleInput = document.getElementById('diaryMovieTitleInput');

  const item = state.currentDiaryItem || {};
  const directTitle = directTitleInput ? directTitleInput.value.trim() : '';
  const chosenTitle = item.title || item.movie_title || directTitle;

  if (!chosenTitle) {
    showToast('Please enter a movie or show title', 'error');
    if (directTitleInput) directTitleInput.focus();
    return;
  }

  const date = dateInput?.value || new Date().toISOString().slice(0, 10);
  const rating = parseFloat(ratingSlider?.value || 8);
  const review = reviewText?.value?.trim() || '';
  const rewatch = Boolean(rewatchCheck?.checked);
  const userId = state.user ? state.user.id : 'guest';

  // Generate database-compatible UUID
  const entryId = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : (`${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);

  let tmdbId = item.tmdbId || item.id || null;
  let poster = item.poster || 'images/hero.webp';
  let mediaType = item.mediaType || 'movie';
  let year = item.year || null;

  if (!tmdbId && chosenTitle) {
    try {
      const sRes = await fetch(`/api/media/rapid-search?q=${encodeURIComponent(chosenTitle)}`);
      const sData = await sRes.json();
      if (sData.results && sData.results.length > 0) {
        const top = sData.results[0];
        tmdbId = top.id;
        if (!poster || poster === 'images/hero.webp') poster = top.poster || poster;
        mediaType = top.mediaType || mediaType;
        year = year || top.year;
      }
    } catch (e) {}
  }

  const entryPayload = {
    id: entryId,
    user_id: userId,
    watchlist_item_id: (item && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(item.id))) ? item.id : null,
    tmdb_id: tmdbId,
    media_type: mediaType,
    title: chosenTitle,
    year: year,
    poster: poster,
    watch_date: date,
    watched_date: date,
    rating: rating,
    review: review,
    rewatch: rewatch,
    created_at: new Date().toISOString()
  };

  // Optimistic UI update
  state.diaryEntries = [entryPayload, ...state.diaryEntries.filter(d => d.id !== entryId)];
  localStorage.setItem(`moodflix_diary_${userId}`, JSON.stringify(state.diaryEntries));
  closeDiaryModal();
  renderDiaryEntries();
  showToast(`Logged "${entryPayload.title}" to Watch Diary ✍️`, 'success');

  // If item is in watchlist, update item completed status and user rating
  if (item && item.id) {
    const target = state.watchlist.find(w => w.id === item.id);
    if (target) {
      target.status = 'completed';
      target.userRating = rating;
      target.watchedDate = date;
      target.diaryNotes = review;
      await saveWatchlist();
      fetch(`/api/user/watchlist/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          updates: {
            status: 'completed',
            user_rating: rating,
            watched_date: date,
            diary_notes: review
          }
        })
      }).catch(() => {});
    }
  }

  // Persist to database & backend
  try {
    const authHeaders = await getAuthHeaders();
    const res = await fetch('/api/user/diary', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ userId, entry: entryPayload })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.entry) {
        const idx = state.diaryEntries.findIndex(d => d.id === entryId || (d.title === chosenTitle && (d.watch_date === date || d.watched_date === date)));
        if (idx !== -1) {
          state.diaryEntries[idx] = { ...state.diaryEntries[idx], ...data.entry };
          localStorage.setItem(`moodflix_diary_${userId}`, JSON.stringify(state.diaryEntries));
          renderDiaryEntries();
        }
      }
    }
  } catch (err) {
    console.warn('Failed to sync diary entry to database:', err);
  }
}

async function deleteDiaryEntry(entryId) {
  let confirmed = false;
  try {
    confirmed = typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm('Delete this diary entry?') : true;
  } catch (e) {
    confirmed = true;
  }
  if (!confirmed) return;
  state.diaryEntries = state.diaryEntries.filter(d => d.id !== entryId);
  const userId = state.user ? state.user.id : 'guest';
  localStorage.setItem(`moodflix_diary_${userId}`, JSON.stringify(state.diaryEntries));
  renderDiaryEntries();

  try {
    const authHeaders = await getAuthHeaders();
    await fetch(`/api/user/diary/${encodeURIComponent(entryId)}?userId=${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: authHeaders
    });
  } catch (err) {
    console.warn('Failed to delete diary entry from database:', err);
  }
  showToast('Diary entry deleted', 'info');
}

// ==========================================================================
// Watchlist Studio: Curated Custom Lists
// ==========================================================================
async function loadCustomLists() {
  const userId = state.user ? state.user.id : 'guest';

  // 1. Read from localStorage first for instant UI response
  try {
    const raw = localStorage.getItem(`moodflix_custom_lists_${userId}`) || localStorage.getItem('moodflix_custom_lists');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) state.customLists = parsed;
    }
  } catch (e) {}

  // 2. Fetch server / Supabase custom lists
  try {
    const res = await fetch(`/api/user/custom-lists?userId=${encodeURIComponent(userId)}`);
    const data = await res.json();
    if (data.success && Array.isArray(data.lists)) {
      const serverMap = new Map();
      data.lists.forEach(l => { if (l && l.id) serverMap.set(l.id, l); });

      // Merge local lists that may not be on the server yet
      const merged = [...data.lists];
      state.customLists.forEach(localList => {
        if (localList && localList.name && !serverMap.has(localList.id)) {
          const nameExists = data.lists.some(sl => (sl.name || '').toLowerCase() === (localList.name || '').toLowerCase());
          if (!nameExists) {
            merged.push(localList);
            // Sync to server in background
            fetch('/api/user/custom-lists', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId,
                name: localList.name,
                description: localList.description,
                color: localList.color,
                icon: localList.icon,
                id: localList.id
              })
            }).catch(() => {});
          }
        }
      });

      state.customLists = merged;
      localStorage.setItem(`moodflix_custom_lists_${userId}`, JSON.stringify(state.customLists));
      localStorage.setItem('moodflix_custom_lists', JSON.stringify(state.customLists));
    }
  } catch (e) {
    console.warn('Failed to fetch custom lists from server:', e);
  }

  renderCustomLists();
}

function renderCustomLists() {
  const pillsBar = document.getElementById('customListPills');
  const grid = document.getElementById('customListsGrid');
  const emptyState = document.getElementById('customListsEmptyState');
  if (!pillsBar || !grid || !emptyState) return;

  // Render filter pills
  pillsBar.innerHTML = `
    <button type="button" class="custom-list-pill ${state.activeCustomListId === 'all' ? 'active' : ''}" data-list-id="all">
      ALL COLLECTIONS (${state.watchlist.length})
    </button>
  ` + state.customLists.map(list => {
    const count = state.watchlist.filter(w => Array.isArray(w.customLists) && w.customLists.includes(list.id)).length;
    const isActive = state.activeCustomListId === list.id;
    return `
      <button type="button" class="custom-list-pill ${isActive ? 'active' : ''}" data-list-id="${list.id}" style="border-left: 3px solid ${list.color || '#ff2a5f'};">
        ${escapeHtml(list.name.toUpperCase())} (${count})
      </button>
    `;
  }).join('');

  pillsBar.querySelectorAll('.custom-list-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      state.activeCustomListId = pill.dataset.listId || 'all';
      renderCustomLists();
      renderWatchlist();
    });
  });

  // Render Collection Cards
  if (state.customLists.length === 0) {
    grid.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  grid.innerHTML = state.customLists.map(list => {
    const safeName = escapeHtml(list.name);
    const safeDesc = escapeHtml(list.description || 'No description provided.');
    const color = list.color || '#ff2a5f';
    const items = state.watchlist.filter(w => Array.isArray(w.customLists) && w.customLists.includes(list.id));

    return `
      <div class="custom-list-card" style="border-top: 4px solid ${color};">
        <div class="custom-list-card-header">
          <h3 class="custom-list-card-title">${safeName}</h3>
          <span class="custom-list-count-badge">${items.length} TITLES</span>
        </div>
        <p class="custom-list-card-desc">${safeDesc}</p>
        <div class="custom-list-thumbs-row">
          ${items.slice(0, 4).map(item => `
            <img src="${escapeHtml(item.poster || 'images/hero.webp')}" alt="${escapeHtml(item.title)}" class="custom-list-mini-thumb" onerror="this.src='images/hero.webp'" loading="lazy">
          `).join('')}
        </div>
        <div class="custom-list-card-actions">
          <button type="button" class="retro-btn btn-view-list" data-id="${list.id}">VIEW LIST</button>
          <button type="button" class="retro-btn btn-delete-list" data-id="${list.id}">DELETE</button>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.btn-view-list').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeCustomListId = btn.dataset.id;
      switchWatchlistSubTab('watchlist');
    });
  });

  grid.querySelectorAll('.btn-delete-list').forEach(btn => {
    btn.addEventListener('click', () => deleteCustomList(btn.dataset.id));
  });
}

function openCustomListModal() {
  const modal = document.getElementById('customListModal');
  if (modal) modal.classList.remove('hidden');
}

function closeCustomListModal() {
  const modal = document.getElementById('customListModal');
  if (modal) modal.classList.add('hidden');
}

async function createCustomList(e) {
  if (e && e.preventDefault) e.preventDefault();
  const nameInput = document.getElementById('customListNameInput');
  const descInput = document.getElementById('customListDescInput');
  const colorInput = document.querySelector('input[name="listColor"]:checked');

  const name = nameInput?.value?.trim();
  if (!name) return;

  const desc = descInput?.value?.trim() || '';
  const color = colorInput?.value || '#ff2a5f';
  const userId = state.user ? state.user.id : 'guest';

  // Generate valid RFC4122 v4 UUID
  const listId = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });

  const listPayload = {
    id: listId,
    name: name,
    description: desc,
    color: color,
    icon: 'bookmark',
    user_id: userId,
    created_at: new Date().toISOString()
  };

  // Optimistic UI update
  state.customLists.push(listPayload);
  localStorage.setItem(`moodflix_custom_lists_${userId}`, JSON.stringify(state.customLists));
  localStorage.setItem('moodflix_custom_lists', JSON.stringify(state.customLists));

  if (nameInput) nameInput.value = '';
  if (descInput) descInput.value = '';
  closeCustomListModal();
  renderCustomLists();

  try {
    const authHeaders = await getAuthHeaders();
    const res = await fetch('/api/user/custom-lists', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        userId,
        name: listPayload.name,
        description: listPayload.description,
        color: listPayload.color,
        icon: listPayload.icon,
        id: listPayload.id
      })
    });
    const data = await res.json();
    if (data.success && data.list) {
      const idx = state.customLists.findIndex(l => l.id === listId);
      if (idx !== -1) {
        state.customLists[idx] = data.list;
      }
      localStorage.setItem(`moodflix_custom_lists_${userId}`, JSON.stringify(state.customLists));
      renderCustomLists();
      showToast(`Created collection "${name}" 📂`, 'success');
    }
  } catch (err) {
    console.warn('Failed to sync custom list to database:', err);
    showToast(`Created collection "${name}" (offline)`, 'warning');
  }
}

async function deleteCustomList(listId) {
  if (!confirm('Delete this curated collection? (Titles will remain in your general watchlist)')) return;
  state.customLists = state.customLists.filter(l => l.id !== listId);
  if (state.activeCustomListId === listId) state.activeCustomListId = 'all';

  // Remove list tag from items
  const affected = state.watchlist.filter(w => Array.isArray(w.customLists) && w.customLists.includes(listId));
  state.watchlist.forEach(w => {
    if (Array.isArray(w.customLists)) {
      w.customLists = w.customLists.filter(id => id !== listId);
    }
  });
  await saveWatchlist();

  const userId = state.user ? state.user.id : 'guest';
  localStorage.setItem(`moodflix_custom_lists_${userId}`, JSON.stringify(state.customLists));
  if (!state.user) {
    localStorage.setItem('moodflix_custom_lists', JSON.stringify(state.customLists));
  }
  renderCustomLists();

  try {
    const authHeaders = await getAuthHeaders();
    await fetch(`/api/user/custom-lists/${encodeURIComponent(listId)}?userId=${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: authHeaders
    });

    if (state.user) {
      for (const item of affected) {
        fetch(`/api/user/watchlist/${encodeURIComponent(item.id)}`, {
          method: 'PATCH',
          headers: authHeaders,
          body: JSON.stringify({ userId, updates: { custom_lists: item.customLists } })
        }).catch(() => {});
      }
    }
  } catch (e) {
    console.warn('Failed to delete custom list from server:', e);
  }
  showToast('Collection deleted', 'info');
}

function openAssignToListModal(item) {
  state.currentAssignItem = item;
  const modal = document.getElementById('assignToListModal');
  const titleEl = document.getElementById('assignModalTitle');
  const checklist = document.getElementById('assignModalChecklist');
  if (!modal || !checklist) return;

  if (titleEl) titleEl.textContent = `ADD "${(item.title || 'TITLE').toUpperCase()}" TO COLLECTIONS`;

  if (state.customLists.length === 0) {
    checklist.innerHTML = `
      <div class="assign-empty-prompt">
        <p>No curated collections created yet.</p>
        <button type="button" class="retro-btn" id="btnAssignNewListShortcut">+ CREATE FIRST COLLECTION</button>
      </div>
    `;
    document.getElementById('btnAssignNewListShortcut')?.addEventListener('click', () => {
      closeAssignToListModal();
      openCustomListModal();
    });
  } else {
    const assignedIds = Array.isArray(item.customLists) ? item.customLists : [];
    checklist.innerHTML = state.customLists.map(list => {
      const isChecked = assignedIds.includes(list.id);
      return `
        <label class="assign-list-row" style="border-left: 4px solid ${list.color || '#ff2a5f'};">
          <input type="checkbox" class="retro-toggle" data-list-id="${list.id}" ${isChecked ? 'checked' : ''}>
          <div class="assign-list-info">
            <strong>${escapeHtml(list.name)}</strong>
            <span>${escapeHtml(list.description || '')}</span>
          </div>
        </label>
      `;
    }).join('');
  }

  modal.classList.remove('hidden');
}

function closeAssignToListModal() {
  const modal = document.getElementById('assignToListModal');
  if (modal) modal.classList.add('hidden');
  state.currentAssignItem = null;
}

async function saveAssignLists() {
  const item = state.currentAssignItem;
  if (!item) return;

  const checklist = document.getElementById('assignModalChecklist');
  const checkedBoxes = checklist?.querySelectorAll('input[type="checkbox"]:checked') || [];
  const selectedListIds = Array.from(checkedBoxes).map(cb => cb.dataset.listId);

  item.customLists = selectedListIds;
  await saveWatchlist();

  const userId = state.user ? state.user.id : 'guest';
  try {
    await fetch(`/api/user/watchlist/${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, updates: { custom_lists: selectedListIds } })
    });
  } catch (e) {
    console.warn('Failed to sync custom lists to database:', e);
  }

  closeAssignToListModal();
  renderCustomLists();
  renderWatchlist();
  if (state.currentDetailMedia) {
    updateDetailButtons(state.currentDetailMedia);
  }
  showToast(`Updated collections for "${item.title || 'Title'}"`, 'success');
}

// ==========================================================================
// Watchlist Studio: Regional Streaming Availability
// ==========================================================================
// Watchlist Studio: Streaming Availability Modal
// ==========================================================================
async function openStreamingModal(item) {
  if (!item) return;
  state.currentStreamingItem = item;
  const modal = document.getElementById('streamingModal');
  const titleEl = document.getElementById('streamingModalTitle');
  const regionSelect = document.getElementById('streamingRegionSelect');
  if (!modal) return;

  if (titleEl) {
    titleEl.textContent = `WHERE TO STREAM: ${(item.title || 'TITLE').toUpperCase()}`;
  }
  if (regionSelect) {
    regionSelect.value = state.currentStreamingRegion || 'US';
    syncRetroCustomSelect(regionSelect);
  }

  modal.classList.remove('hidden');
  await loadStreamingProviders(regionSelect?.value || 'US');
}

function closeStreamingModal() {
  const modal = document.getElementById('streamingModal');
  if (modal) modal.classList.add('hidden');
  state.currentStreamingItem = null;
}

async function loadStreamingProviders(region = 'US') {
  state.currentStreamingRegion = region;
  const item = state.currentStreamingItem;
  const container = document.getElementById('streamingModalContent');
  if (!item || !container) return;

  container.innerHTML = `<div class="streaming-loading"><span class="material-symbols-outlined spin-icon">sync</span> Fetching live streaming providers for ${region}...</div>`;

  try {
    const tmdbId = item.tmdbId || item.id;
    const mediaType = item.mediaType || 'movie';
    const res = await fetch(`/api/providers?id=${tmdbId}&type=${mediaType}&region=${region}`);
    const data = await res.json();
    const prov = data.providers;

    if (!prov || (!prov.flatrate?.length && !prov.rent?.length && !prov.buy?.length && !prov.free?.length)) {
      container.innerHTML = `
        <div class="streaming-empty-box">
          <span class="material-symbols-outlined" style="font-size: 36px; margin-bottom: 8px;">tv_off</span>
          <h4>NO SUBSCRIPTION STREAMING RECORDED</h4>
          <p>This title does not currently have active flatrate streaming catalog availability in ${region}. You can check torrent releases or purchase digitally.</p>
        </div>
      `;
      return;
    }

    const renderProviderRow = (title, items) => {
      if (!items || items.length === 0) return '';
      return `
        <div class="streaming-category-block">
          <h4 class="streaming-category-title">${title}</h4>
          <div class="streaming-provider-pills">
            ${items.map(p => {
              const logoUrl = p.logo || (p.logo_path ? (p.logo_path.startsWith('http') ? p.logo_path : `https://image.tmdb.org/t/p/original${p.logo_path}`) : '');
              return `
                <div class="streaming-provider-badge">
                  ${logoUrl ? `<img src="${logoUrl}" alt="${escapeHtml(p.provider_name)}" class="provider-logo-img" loading="lazy">` : ''}
                  <span class="provider-name">${escapeHtml(p.provider_name)}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    };

    container.innerHTML = `
      <div class="streaming-results-grid">
        ${renderProviderRow('🍿 SUBSCRIPTION (WATCH ANYTIME)', prov.flatrate)}
        ${renderProviderRow('🆓 FREE WITH ADS', prov.free)}
        ${renderProviderRow('🎟️ RENT DIGITALLY', prov.rent)}
        ${renderProviderRow('🛒 BUY / OWN', prov.buy)}
      </div>
      <div class="streaming-attribution">
        Powered by JustWatch & TMDB regional catalogs. Availability subject to live licensing changes.
      </div>
    `;

  } catch (err) {
    container.innerHTML = `<div class="streaming-empty-box">Failed to fetch streaming availability.</div>`;
  }
}

// ==========================================================================
// Watchlist Studio: Rapid Title Entry
// ==========================================================================
let rapidSearchDebounceTimer = null;

async function handleRapidSearchInput(query) {
  const dropdown = document.getElementById('rapidSearchResults');
  const clearBtn = document.getElementById('btnClearRapidTitle');
  const rapidInput = document.getElementById('rapidTitleInput');
  if (!dropdown) return;

  const trimmed = query.trim();
  if (clearBtn) clearBtn.classList.toggle('hidden', !trimmed);

  if (!trimmed || trimmed.length < 2) {
    dropdown.innerHTML = '';
    dropdown.classList.add('hidden');
    return;
  }

  // Live feedback while querying
  dropdown.innerHTML = `
    <div class="rapid-result-loading">
      <span class="rapid-spinner"></span>
      <span>SEARCHING LIVE CATALOG...</span>
    </div>
  `;
  dropdown.classList.remove('hidden');

  try {
    const res = await fetch(`/api/media/rapid-search?q=${encodeURIComponent(trimmed)}`);
    const data = await res.json();
    const results = data.results || [];

    if (results.length === 0) {
      dropdown.innerHTML = `
        <div class="rapid-result-empty">
          <span class="material-symbols-outlined" style="font-size: 18px; color: #d97706;">search_off</span>
          <div>No matching titles found. Press <strong>QUICK ADD</strong> to save anyway.</div>
        </div>
      `;
      dropdown.classList.remove('hidden');
      return;
    }

    const headerHtml = `
      <div class="rapid-dropdown-header">
        <span class="rapid-header-hint">⚡ MATCHING TITLES (${results.length})</span>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="rapid-header-sub">TAP TO ADD</span>
          <button type="button" class="rapid-header-close-btn" title="Close results" aria-label="Close search results">✕</button>
        </div>
      </div>
    `;

    const itemsHtml = results.map((item, idx) => {
      const safeTitle = escapeHtml(item.title);
      const safeYear = escapeHtml(item.year || '');
      const safePoster = escapeHtml(item.poster || 'images/hero.webp');
      const isTv = item.mediaType === 'tv';
      const safeType = isTv ? 'TV SERIES' : 'MOVIE';
      const safeRating = item.rating ? Number(item.rating).toFixed(1) : '—';
      const genres = Array.isArray(item.genres) ? item.genres.slice(0, 2).join(' / ') : '';
      const inList = isItemInWatchlist(item);

      return `
        <div class="rapid-result-row ${inList ? 'in-watchlist' : ''}" data-id="${item.id}" data-type="${item.mediaType}" data-index="${idx}" role="button" tabindex="0">
          <img src="${safePoster}" alt="${safeTitle}" class="rapid-result-thumb" onerror="this.src='images/hero.webp'">
          <div class="rapid-result-info">
            <div class="rapid-result-title-bar">
              <span class="rapid-result-badge ${isTv ? 'rapid-badge-tv badge-tv' : 'rapid-badge-movie badge-movie'}">${safeType}</span>
              <strong class="rapid-result-title" title="${safeTitle}">${safeTitle}</strong>
            </div>
            <div class="rapid-result-meta">
              ${safeYear ? `<span>${safeYear}</span><span>•</span>` : ''}
              <span class="rapid-meta-star">★ ${safeRating}</span>
              ${genres ? `<span>•</span><span class="rapid-meta-genres">${escapeHtml(genres)}</span>` : ''}
            </div>
          </div>
          <button type="button" class="retro-btn rapid-btn-add ${inList ? 'is-added' : ''}" data-index="${idx}" title="${inList ? 'Already in Watchlist' : 'Add to Watchlist'}">
            <span class="material-symbols-outlined" style="font-size: 14px;">${inList ? 'check' : 'add'}</span>
            <span>${inList ? 'IN LIST' : 'ADD'}</span>
          </button>
        </div>
      `;
    }).join('');

    dropdown.innerHTML = headerHtml + itemsHtml;
    dropdown.classList.remove('hidden');

    dropdown.querySelector('.rapid-header-close-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.add('hidden');
    });

    // On mobile devices, ensure the dropdown doesn't get obscured
    if (window.innerWidth <= 768 && rapidInput) {
      const rect = rapidInput.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - 70;
      if (spaceBelow < 240) {
        rapidInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    // Attach click listeners to rows
    dropdown.querySelectorAll('.rapid-result-row').forEach((row) => {
      const idx = parseInt(row.dataset.index, 10);
      const item = results[idx];
      if (!item) return;

      row.addEventListener('click', async () => {
        if (isItemInWatchlist(item)) {
          showToast(`"${item.title}" is already in your Watchlist`, 'info');
          return;
        }

        const addBtn = row.querySelector('.rapid-btn-add');
        if (addBtn) {
          addBtn.classList.add('is-added');
          addBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size: 14px;">check</span><span>ADDED</span>`;
          addBtn.setAttribute('title', 'Already in Watchlist');
        }
        row.classList.add('in-watchlist');

        await toggleWatchlistItem(item, item.mediaType);
        showToast(`Added "${item.title}" to Watchlist`, 'success');
        // Do not collapse dropdown; keep it open so user can add multiples of choice
      });
    });

  } catch (err) {
    dropdown.classList.add('hidden');
  }
}

async function executeRapidAdd() {
  const input = document.getElementById('rapidTitleInput');
  const title = input?.value?.trim();
  if (!title) return;

  // Search top match from TMDB
  try {
    const res = await fetch(`/api/media/rapid-search?q=${encodeURIComponent(title)}`);
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      const topMatch = data.results[0];
      if (isItemInWatchlist(topMatch)) {
        showToast(`"${topMatch.title}" is already in your Watchlist`, 'info');
      } else {
        await toggleWatchlistItem(topMatch, topMatch.mediaType);
      }
    } else {
      // Fallback manual title entry
      await toggleWatchlistItem({
        id: Date.now().toString(),
        title: title,
        mediaType: 'movie',
        poster: 'images/hero.webp',
        rating: 0,
        status: 'plan_to_watch'
      }, 'movie');
    }
  } catch (e) {
    await toggleWatchlistItem({ title, mediaType: 'movie' }, 'movie');
  }

  if (input) input.value = '';
  document.getElementById('rapidSearchResults')?.classList.add('hidden');
  document.getElementById('btnClearRapidTitle')?.classList.add('hidden');
}

// ==========================================================================
// Watchlist Studio: Sub-Tabs & Advanced Filters
// ==========================================================================
function switchWatchlistSubTab(subTab) {
  state.watchlistSubTab = subTab;

  document.querySelectorAll('.wl-subnav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.subtab === subTab);
  });

  const paneWatchlist = document.getElementById('wlTabContentWatchlist');
  const paneDiary = document.getElementById('wlTabContentDiary');
  const paneCustom = document.getElementById('wlTabContentCustomLists');
  if (paneWatchlist) paneWatchlist.classList.toggle('hidden', subTab !== 'watchlist');
  if (paneDiary) paneDiary.classList.toggle('hidden', subTab !== 'diary');
  if (paneCustom) paneCustom.classList.toggle('hidden', subTab !== 'custom-lists');
  if (subTab === 'watchlist') {
    renderWatchlist();
  } else if (subTab === 'diary') {
    if (!state.diaryEntries || state.diaryEntries.length === 0) {
      loadDiaryEntries();
    } else {
      renderDiaryEntries();
    }
  } else if (subTab === 'custom-lists') {
    if (!state.customLists || state.customLists.length === 0) {
      loadCustomLists();
    } else {
      renderCustomLists();
    }
  }
}

function updateActiveFilterIndicator() {
  const badge = document.getElementById('activeFilterBadge');
  const btn = document.getElementById('btnToggleFilters');
  if (!badge) return;
  const { genre, year, minRating, runtime } = state.watchlistFilters;
  const hasAdvanced = genre !== 'all' || (year && year !== 'all') || minRating > 0 || runtime !== 'all';
  badge.classList.toggle('hidden', !hasAdvanced);
  if (btn) btn.classList.toggle('active', hasAdvanced);
}

// --- Watchlist Retro Custom Select Components ---
function syncRetroCustomSelect(selectEl) {
  if (!selectEl) return;
  const container = selectEl.closest('.retro-select-container') || selectEl.parentElement;
  if (!container) return;
  const label = container.querySelector('.retro-select-label');
  const menu = container.querySelector('.retro-select-menu');
  const selectedOpt = selectEl.options[selectEl.selectedIndex] || selectEl.options[0];
  if (label && selectedOpt) {
    label.textContent = selectedOpt.textContent;
  }
  if (menu) {
    menu.querySelectorAll('.retro-select-option').forEach(item => {
      const isSelected = item.dataset.value === selectEl.value;
      item.classList.toggle('active', isSelected);
      item.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    });
  }
}

function initRetroCustomSelect(selectEl) {
  if (!selectEl || selectEl.dataset.retroSelectInit === 'true') return;
  selectEl.dataset.retroSelectInit = 'true';

  const container = selectEl.closest('.retro-select-container') || selectEl.parentElement;
  if (!container) return;
  container.classList.add('retro-select-container');

  // Visually hide native select element while keeping it functional for events and tests
  selectEl.classList.add('retro-hidden-select');
  selectEl.setAttribute('tabindex', '-1');
  selectEl.setAttribute('aria-hidden', 'true');

  let trigger = container.querySelector('.retro-select-trigger');
  let label = container.querySelector('.retro-select-label');
  let menu = container.querySelector('.retro-select-menu');

  if (!trigger) {
    trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'retro-select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    label = document.createElement('span');
    label.className = 'retro-select-label';
    const selectedOpt = selectEl.options[selectEl.selectedIndex] || selectEl.options[0];
    label.textContent = selectedOpt ? selectedOpt.textContent : '';

    const chevron = document.createElement('span');
    chevron.className = 'retro-select-chevron';
    chevron.textContent = '▼';

    trigger.appendChild(label);
    trigger.appendChild(chevron);
    container.appendChild(trigger);
  }

  if (!menu) {
    menu = document.createElement('div');
    menu.className = 'retro-select-menu hidden';
    menu.setAttribute('role', 'listbox');

    Array.from(selectEl.options).forEach(opt => {
      const optEl = document.createElement('div');
      optEl.className = 'retro-select-option' + (opt.value === selectEl.value ? ' active' : '');
      optEl.dataset.value = opt.value;
      optEl.setAttribute('role', 'option');
      optEl.setAttribute('aria-selected', opt.value === selectEl.value ? 'true' : 'false');

      const textSpan = document.createElement('span');
      textSpan.className = 'retro-option-text';
      textSpan.textContent = opt.textContent;

      const checkSpan = document.createElement('span');
      checkSpan.className = 'retro-option-check';
      checkSpan.textContent = '✓';

      optEl.appendChild(textSpan);
      optEl.appendChild(checkSpan);
      menu.appendChild(optEl);
    });

    container.appendChild(menu);
  }

  function openMenu() {
    document.querySelectorAll('.retro-select-menu:not(.hidden)').forEach(m => {
      if (m !== menu) {
        m.classList.add('hidden');
        const t = m.parentElement?.querySelector('.retro-select-trigger');
        if (t) {
          t.setAttribute('aria-expanded', 'false');
          t.classList.remove('open');
        }
        m.parentElement?.classList.remove('open');
      }
    });

    menu.classList.remove('hidden');
    trigger.setAttribute('aria-expanded', 'true');
    trigger.classList.add('open');
    container.classList.add('open');

    const activeItem = menu.querySelector('.retro-select-option.active');
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  }

  function closeMenu() {
    menu.classList.add('hidden');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.classList.remove('open');
    container.classList.remove('open');
  }

  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (menu.classList.contains('hidden')) {
      openMenu();
    } else {
      closeMenu();
    }
  });

  menu.addEventListener('click', (e) => {
    const optEl = e.target.closest('.retro-select-option');
    if (!optEl) return;
    e.stopPropagation();
    const val = optEl.dataset.value;
    if (selectEl.value !== val) {
      selectEl.value = val;
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
    syncRetroCustomSelect(selectEl);
    closeMenu();
    trigger.focus();
  });

  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (menu.classList.contains('hidden')) {
        openMenu();
      } else {
        const options = Array.from(menu.querySelectorAll('.retro-select-option'));
        const currentIndex = options.findIndex(o => o.dataset.value === selectEl.value);
        let nextIndex = e.key === 'ArrowDown' ? currentIndex + 1 : currentIndex - 1;
        if (nextIndex < 0) nextIndex = options.length - 1;
        if (nextIndex >= options.length) nextIndex = 0;
        const targetOpt = options[nextIndex];
        if (targetOpt) {
          selectEl.value = targetOpt.dataset.value;
          selectEl.dispatchEvent(new Event('change', { bubbles: true }));
          syncRetroCustomSelect(selectEl);
          targetOpt.scrollIntoView({ block: 'nearest' });
        }
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (menu.classList.contains('hidden')) {
        openMenu();
      } else {
        closeMenu();
      }
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      closeMenu();
    }
  });

  selectEl.addEventListener('change', () => {
    syncRetroCustomSelect(selectEl);
  });

  syncRetroCustomSelect(selectEl);
}

function resetWatchlistFilters() {
  state.watchlistFilters = {
    type: 'all',
    status: 'all',
    genre: 'all',
    year: 'all',
    minRating: 0,
    runtime: 'all',
    sort: 'date_desc',
    search: ''
  };
  state.watchlistFilter = 'all';
  state.activeCustomListId = 'all';

  document.querySelectorAll('.filter-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.filterType === 'all');
  });
  const elStatus = document.getElementById('wlStatusSelect');
  const elGenre = document.getElementById('wlGenreSelect');
  const elYear = document.getElementById('wlYearSelect');
  const elSlider = document.getElementById('wlRatingSlider');
  const elSliderVal = document.getElementById('ratingSliderVal');
  const elRuntime = document.getElementById('wlRuntimeSelect');
  const elSort = document.getElementById('wlSortSelect');
  const elSearch = document.getElementById('wlSearchFilterInput');

  if (elStatus) elStatus.value = 'all';
  if (elGenre) elGenre.value = 'all';
  if (elYear) elYear.value = 'all';
  if (elSlider) elSlider.value = 0;
  if (elSliderVal) elSliderVal.textContent = '0.0';
  if (elRuntime) elRuntime.value = 'all';
  if (elSort) elSort.value = 'date_desc';
  if (elSearch) elSearch.value = '';

  syncRetroCustomSelect(elStatus);
  syncRetroCustomSelect(elGenre);
  syncRetroCustomSelect(elYear);
  syncRetroCustomSelect(elRuntime);
  syncRetroCustomSelect(elSort);

  updateActiveFilterIndicator();
  renderWatchlist();
  showToast('Filters reset to default', 'info');
}

// ==========================================================================
// Watchlist Studio: Data Import & Export (Letterboxd, Trakt, CSV)
// ==========================================================================
function openImportExportModal() {
  const modal = document.getElementById('importExportModal');
  if (modal) modal.classList.remove('hidden');
}

function closeImportExportModal() {
  const modal = document.getElementById('importExportModal');
  if (modal) modal.classList.add('hidden');
  state.pendingImportItems = [];
  const previewWrap = document.getElementById('importPreviewWrap');
  if (previewWrap) previewWrap.classList.add('hidden');
  const fileInput = document.getElementById('importFileInput');
  if (fileInput) fileInput.value = '';
  state.pendingImportItems = [];
}

// Helper: trigger direct browser file download from string content
function triggerFileDownload(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 120);
}

// Watchlist Studio: Universal Data Export (CSV, Letterboxd, Trakt)
function exportData(format = 'csv') {
  const items = Array.isArray(state.watchlist) ? state.watchlist : [];
  if (items.length === 0) {
    showToast('Your watchlist is currently empty. Add titles before exporting!', 'info');
    return;
  }

  const dateStr = new Date().toISOString().slice(0, 10);

  if (format === 'trakt') {
    const traktData = {
      movies: items.filter(i => (i.mediaType || i.media_type) !== 'tv').map(i => {
        const entry = { title: i.title, year: i.year || null };
        if (i.tmdbId) entry.ids = { tmdb: parseInt(i.tmdbId, 10) || i.tmdbId };
        return entry;
      }),
      shows: items.filter(i => (i.mediaType || i.media_type) === 'tv').map(i => {
        const entry = { title: i.title, year: i.year || null };
        if (i.tmdbId) entry.ids = { tmdb: parseInt(i.tmdbId, 10) || i.tmdbId };
        return entry;
      })
    };
    triggerFileDownload(JSON.stringify(traktData, null, 2), `moodflix_trakt_${dateStr}.json`, 'application/json;charset=utf-8;');
    showToast(`✓ Exported ${items.length} titles to Trakt JSON!`, 'success');
    return;
  }

  if (format === 'letterboxd') {
    let csv = 'Title,Year,Rating10,WatchedDate,Review\n';
    items.forEach(i => {
      const titleSafe = `"${(i.title || '').replace(/"/g, '""')}"`;
      const reviewSafe = `"${(i.diaryNotes || i.diary_notes || '').replace(/"/g, '""')}"`;
      const watched = i.watchedDate || (i.status === 'completed' ? (i.dateAdded ? i.dateAdded.slice(0, 10) : '') : '');
      const userR = i.userRating || '';
      csv += `${titleSafe},${i.year || ''},${userR},${watched},${reviewSafe}\n`;
    });
    triggerFileDownload(csv, `moodflix_letterboxd_${dateStr}.csv`, 'text/csv;charset=utf-8;');
    showToast(`✓ Exported ${items.length} titles to Letterboxd CSV!`, 'success');
    return;
  }

  // Standard CSV Export
  let csv = 'Title,Year,MediaType,Status,Rating,UserRating,Runtime,DateAdded,TMDB_ID,Genres,DiaryNotes\n';
  items.forEach(i => {
    const titleSafe = `"${(i.title || '').replace(/"/g, '""')}"`;
    const genres = Array.isArray(i.genres) ? i.genres.join(';') : '';
    const genresSafe = `"${genres.replace(/"/g, '""')}"`;
    const notesSafe = `"${(i.diaryNotes || i.diary_notes || '').replace(/"/g, '""')}"`;
    csv += `${titleSafe},${i.year || ''},${i.mediaType || i.media_type || 'movie'},${i.status || 'plan_to_watch'},${i.rating || ''},${i.userRating || ''},${i.runtime || ''},${i.dateAdded || i.created_at || ''},${i.tmdbId || i.tmdb_id || ''},${genresSafe},${notesSafe}\n`;
  });
  triggerFileDownload(csv, `moodflix_watchlist_${dateStr}.csv`, 'text/csv;charset=utf-8;');
  showToast(`✓ Exported ${items.length} titles to CSV!`, 'success');
}

// Robust CSV Line Parser that respects quotes, commas within quotes, and escaped quotes
function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Watchlist Studio: Handle File Import (Letterboxd, Trakt, IMDb, CSV)
function handleImportFile(file) {
  if (!file) return;
  const previewWrap = document.getElementById('importPreviewWrap');
  const previewCount = document.getElementById('importPreviewCount');
  const previewList = document.getElementById('importPreviewList');

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    let items = [];

    if (file.name.endsWith('.json')) {
      try {
        const parsed = JSON.parse(text);
        // Combine movies, shows, and generic watchlist arrays (fixes bug where shows were ignored)
        const rawList = Array.isArray(parsed)
          ? parsed
          : [...(parsed.movies || []), ...(parsed.shows || []), ...(parsed.watchlist || []), ...(parsed.items || [])];

        items = rawList.map(item => {
          const m = item.movie || item.show || item;
          const isShow = Boolean(item.show || m.show || item.type === 'show' || item.media_type === 'tv' || item.mediaType === 'tv');
          return {
            title: m.title || m.name,
            year: m.year ? parseInt(m.year, 10) : null,
            mediaType: isShow ? 'tv' : 'movie',
            tmdbId: m.ids?.tmdb || m.tmdb_id || m.tmdbId || null,
            rating: m.rating || 0
          };
        }).filter(i => i.title && i.title.trim().length > 0);
      } catch (err) {
        showToast('Failed to parse JSON file', 'error');
        return;
      }
    } else {
      // Parse CSV (Letterboxd format, IMDb export, or standard CSV)
      const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
      if (lines.length > 1) {
        const headerRow = parseCsvLine(lines[0]);
        const headers = headerRow.map(h => h.replace(/^["']|["']$/g, '').toLowerCase().trim());

        const titleIdx = headers.findIndex(h => h === 'name' || h === 'title' || h === 'film' || h.includes('title'));
        const yearIdx = headers.findIndex(h => h === 'year' || h === 'release year' || h.includes('release_date'));
        const ratingIdx = headers.findIndex(h => h === 'rating' || h === 'rating10' || h === 'your rating' || h === 'imdb rating');
        const typeIdx = headers.findIndex(h => h === 'mediatype' || h === 'media_type' || h === 'type' || h === 'title type');
        const statusIdx = headers.findIndex(h => h === 'status');
        const watchedDateIdx = headers.findIndex(h => h === 'watcheddate' || h === 'watched date' || h === 'date rated');
        const reviewIdx = headers.findIndex(h => h === 'review' || h === 'diarynotes' || h === 'diary_notes' || h === 'notes');

        for (let i = 1; i < lines.length; i++) {
          const parts = parseCsvLine(lines[i]);
          const rawTitle = titleIdx >= 0 ? parts[titleIdx] : parts[0];
          const rawYear = yearIdx >= 0 ? parts[yearIdx] : '';
          const rawRating = ratingIdx >= 0 ? parseFloat(parts[ratingIdx]) : 0;
          const rawType = typeIdx >= 0 ? parts[typeIdx]?.toLowerCase() : '';
          const rawStatus = statusIdx >= 0 ? parts[statusIdx]?.toLowerCase() : '';
          const rawWatchedDate = watchedDateIdx >= 0 ? parts[watchedDateIdx] : '';
          const rawReview = reviewIdx >= 0 ? parts[reviewIdx] : '';

          const cleanTitle = (rawTitle || '').replace(/^["']|["']$/g, '').trim();
          if (cleanTitle) {
            const isTv = rawType.includes('tv') || rawType.includes('series') || rawType.includes('show');
            const status = rawStatus || (rawWatchedDate ? 'completed' : 'plan_to_watch');

            items.push({
              title: cleanTitle,
              year: rawYear ? parseInt(rawYear, 10) : null,
              rating: !isNaN(rawRating) ? rawRating : 0,
              mediaType: isTv ? 'tv' : 'movie',
              status: status === 'completed' || status === 'watching' || status === 'dropped' ? status : 'plan_to_watch',
              watchedDate: rawWatchedDate || null,
              diaryNotes: rawReview || ''
            });
          }
        }
      }
    }

    if (items.length === 0) {
      showToast('No valid titles found in this file', 'error');
      return;
    }

    state.pendingImportItems = items;
    if (previewCount) {
      previewCount.textContent = `${items.length} TITLE${items.length === 1 ? '' : 'S'} FOUND`;
    }

    if (previewList) {
      previewList.innerHTML = items.slice(0, 15).map(i => `
        <div class="import-preview-item">
          <strong>${escapeHtml(i.title)}</strong>
          <span class="import-preview-badge">${i.mediaType === 'tv' ? 'TV' : 'MOVIE'}${i.year ? ` • ${i.year}` : ''}</span>
        </div>
      `).join('') + (items.length > 15 ? `<div style="font-family:var(--font-mono); font-size:0.72rem; padding:6px 10px; opacity:0.75; text-align:center;">+ ${items.length - 15} more titles queued</div>` : '');
    }

    if (previewWrap) {
      previewWrap.classList.remove('hidden');
    }
  };

  reader.onerror = () => {
    showToast('Error reading uploaded file', 'error');
  };

  reader.readAsText(file);
}

// Watchlist Studio: Execute Import and Merge into Watchlist Immediately
async function executeImport() {
  const itemsToImport = state.pendingImportItems;
  if (!itemsToImport || itemsToImport.length === 0) {
    showToast('No items selected for import', 'error');
    return;
  }

  const userId = state.user ? state.user.id : 'guest';
  showToast(`Importing ${itemsToImport.length} titles into your watchlist...`, 'info');

  // 1. Immediately enrich local watchlist with zero duplicate entries
  let newAddedCount = 0;
  const existingKeys = new Set(
    state.watchlist.map(w => w.tmdbId ? `tmdb_${w.tmdbId}` : (w.title || '').toLowerCase().trim())
  );

  itemsToImport.forEach(item => {
    const key = item.tmdbId ? `tmdb_${item.tmdbId}` : (item.title || '').toLowerCase().trim();
    if (!existingKeys.has(key)) {
      existingKeys.add(key);
      const newEntry = normalizeWatchlistItem({
        id: 'wl_imp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        title: item.title,
        year: item.year || null,
        mediaType: item.mediaType || 'movie',
        poster: item.poster || 'images/hero.webp',
        rating: item.rating || 0,
        status: item.status || 'plan_to_watch',
        userRating: item.userRating || (item.rating > 0 ? item.rating : null),
        watchedDate: item.watchedDate || null,
        diaryNotes: item.diaryNotes || '',
        created_at: new Date().toISOString()
      });
      state.watchlist.unshift(newEntry);
      newAddedCount++;
    }
  });

  await saveWatchlist();
  renderWatchlistStats();
  renderWatchlist();
  closeImportExportModal();

  showToast(`🎉 Successfully imported ${newAddedCount} new title${newAddedCount === 1 ? '' : 's'} into your watchlist!`, 'success');

  // 2. Sync to server / Supabase in background
  try {
    fetch('/api/user/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, items: itemsToImport })
    }).catch(() => {});
  } catch (err) {}

  // 3. Asynchronously enrich first 25 imported titles with real TMDB posters
  itemsToImport.slice(0, 25).forEach(async (imp) => {
    try {
      const match = state.watchlist.find(w => (w.title || '').toLowerCase().trim() === (imp.title || '').toLowerCase().trim());
      if (match && (!match.poster || match.poster === 'images/hero.webp')) {
        const res = await fetch(`/api/media/rapid-search?q=${encodeURIComponent(imp.title)}`);
        const searchData = await res.json();
        const found = searchData.results?.[0];
        if (found && found.poster && found.poster !== 'images/hero.webp') {
          match.poster = found.poster;
          if (!match.year && found.year) match.year = found.year;
          if (!match.tmdbId && found.id) match.tmdbId = found.id;
          saveWatchlist();
        }
      }
    } catch (e) {}
  });
}

async function loadProfileHistory() {
  const container = document.getElementById('profileHistoryList');
  const countBadge = document.getElementById('historyCountBadge');
  if (!container) return;

  try {
    const res = await fetch('/api/history');
    const data = await res.json();
    const list = data.downloads || [];

    if (countBadge) {
      countBadge.textContent = `${list.length} DOWNLOAD${list.length === 1 ? '' : 'S'}`;
    }

    if (list.length === 0) {
      container.innerHTML = `<div style="font-family: var(--font-mono); font-size: 0.8rem; opacity: 0.7; padding: 12px 0;">NO RECENT DOWNLOADS RECORDED.</div>`;
      return;
    }

    container.innerHTML = list.slice(0, 10).map(d => {
      const safeTitle = escapeHtml(d.movieTitle || d.torrentName || 'Download');
      const safeSize = escapeHtml(d.sizeFormatted || 'N/A');
      const safeSeeds = d.seeders || 0;
      const safeDate = d.downloadedAt ? new Date(d.downloadedAt).toLocaleDateString() : '';
      return `
        <div class="profile-history-item">
          <div class="history-item-left">
            <span class="history-item-title">${safeTitle}</span>
            <span class="history-item-meta">${safeDate ? safeDate + ' • ' : ''}${safeSize} • ${safeSeeds} seeds</span>
          </div>
          <div class="history-item-right">
            ${d.magnet ? `<a href="${escapeHtml(d.magnet)}" class="retro-btn" style="font-size: 10px; padding: 4px 8px; text-decoration: none;">MAGNET</a>` : ''}
            <button type="button" class="retro-btn btn-history-del" data-id="${escapeHtml(d.id)}" style="font-size: 10px; padding: 4px 8px; color: #e74c3c; border-color: #e74c3c;" title="Remove record">✕</button>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.btn-history-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (id) {
          await fetch(`/api/history/${encodeURIComponent(id)}`, { method: 'DELETE' });
          loadProfileHistory();
        }
      });
    });
  } catch (e) {
    if (container) container.innerHTML = `<div style="font-family: var(--font-mono); font-size: 0.8rem; opacity: 0.7;">History unavailable</div>`;
  }
}


function renderSharedMovieView(data = {}) {
  const {
    title,
    year,
    poster,
    magnet,
    torrentName,
    size,
    quality,
    seeds,
    trailer,
    mediaId,
    mediaType
  } = data;

  const titleEl = document.getElementById('shareMovieTitle');
  if (titleEl) titleEl.innerText = (title || 'MOVIE TITLE').toUpperCase();

  const subEl = document.getElementById('shareSubtitle');
  if (subEl) {
    subEl.innerText = `${(title || 'Movie').toUpperCase()}${year ? ` (${year})` : ''} WAS SHARED WITH YOU.\nCLICK BELOW TO DOWNLOAD THE TORRENT AND START WATCHING.`;
  }

  const posterEl = document.getElementById('sharePosterImg');
  if (posterEl) {
    posterEl.src = poster || 'images/hero.webp';
    posterEl.alt = `${title || 'Movie'} VHS Tape`;
  }

  const specName = document.getElementById('shareTorrentName');
  if (specName) specName.innerText = torrentName || title || 'Verified Release';

  const specQuality = document.getElementById('shareTorrentQuality');
  if (specQuality) specQuality.innerText = quality || '1080P HD';

  const specSize = document.getElementById('shareTorrentSize');
  if (specSize) specSize.innerText = size || 'HD';

  const specSeeds = document.getElementById('shareTorrentSeeds');
  if (specSeeds) specSeeds.innerText = seeds ? `🌱 ${seeds} Seeds` : '🌱 Healthy Seeds';

  // Wire Download Button
  const downloadBtn = document.getElementById('shareDownloadBtn');
  if (downloadBtn) {
    downloadBtn.onclick = () => {
      if (magnet) {
        copyMagnetLink(encodeURIComponent(magnet));
        const torrentObj = { name: torrentName || title, magnet, sizeFormatted: size, qualityBadge: quality };
        triggerDownloadDirect(title, torrentObj);
      } else {
        openTorrentModal({ title, id: mediaId, poster }, mediaType || 'movie');
      }
    };
  }

  // Wire Trailer Button
  const trailerBtn = document.getElementById('shareTrailerBtn');
  if (trailerBtn) {
    trailerBtn.onclick = () => {
      if (trailer && /^[a-zA-Z0-9_-]{11}$/.test(trailer)) {
        const modal = document.getElementById('trailer-modal');
        const iframe = document.getElementById('trailer-iframe');
        const loader = document.getElementById('trailer-loader');
        modal?.classList.remove('hidden');
        loader?.classList.add('hidden');
        if (iframe) {
          iframe.classList.remove('hidden');
          iframe.src = `https://www.youtube.com/embed/${encodeURIComponent(trailer)}?autoplay=1`;
        }
      } else if (mediaId || title) {
        playTrailer(mediaId, mediaType || 'movie', title, year);
      } else {
        showToast('Searching trailer...', 'info');
      }
    };
  }

  // Wire Explore Button to Log In Page
  const exploreBtn = document.getElementById('shareExploreBtn');
  if (exploreBtn) {
    exploreBtn.onclick = () => {
      state.isSharedPage = false;
      try {
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (e) { }
      showAuthView();
    };
  }
}

function checkShareUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('share')) {
    state.isSharedPage = true;
    const cleanStr = (s) => (s ? decodeURIComponent(s).trim().slice(0, 500) : '');
    const title = cleanStr(params.get('title')) || 'Movie';
    const year = cleanStr(params.get('year'));
    let poster = cleanStr(params.get('poster'));
    if (!/^(https?:\/\/|\/|images\/)/i.test(poster)) {
      poster = 'images/hero.webp';
    }
    let magnet = cleanStr(params.get('magnet'));
    if (magnet && !magnet.toLowerCase().startsWith('magnet:?xt=urn:btih:')) {
      magnet = '';
    }
    const torrentName = cleanStr(params.get('name')) || title;
    const size = cleanStr(params.get('size'));
    const quality = cleanStr(params.get('quality')) || '1080P HD';
    const seeds = cleanStr(params.get('seeds'));
    let trailer = cleanStr(params.get('trailer'));
    if (trailer && !/^[a-zA-Z0-9_-]{11}$/.test(trailer)) {
      trailer = '';
    }
    const mediaId = cleanStr(params.get('mediaId'));
    const mediaType = cleanStr(params.get('mediaType')) || 'movie';

    renderSharedMovieView({
      title,
      year,
      poster,
      magnet,
      torrentName,
      size,
      quality,
      seeds,
      trailer,
      mediaId,
      mediaType
    });

    switchTab('share-view');
    return true;
  }
  return false;
}


// --- QUIZ ASSESSMENT LOGIC ---
const quizSteps = [
  {
    key: 'mood',
    title: 'How are you today?',
    hint: '',
    options: [
      { value: 'happy', label: 'Happy', sub: 'In the mood for something upbeat' },
      { value: 'neutral', label: 'Neutral', sub: 'Open to anything' },
      { value: 'sad', label: 'Sad', sub: 'Could use something that meets me there' }
    ]
  },
  {
    key: 'occasion',
    title: "What's closest to your occasion?",
    hint: '',
    options: [
      { value: 'solo', label: 'Just watching a movie by myself.' },
      { value: 'date', label: 'Movie date.' },
      { value: 'friends', label: 'Movie night with friends.' },
      { value: 'partner', label: 'Date night with a partner.' },
      { value: 'family', label: 'Watching with family or relatives.' }
    ]
  },
  {
    key: 'mediaPreference',
    title: 'Movies or TV Series?',
    hint: '',
    options: [
      { value: 'movies', label: 'Movies only' },
      { value: 'tv', label: 'TV Series only' },
      { value: 'both', label: 'Both' }
    ]
  },
  {
    key: 'genres',
    title: "Pick any genres you're into",
    hint: 'Multiple answers are possible — leave it empty to consider all genres.',
    multi: true,
    options: [
      { value: 'Action', label: 'Action' },
      { value: 'Adventure', label: 'Adventure' },
      { value: 'Animation', label: 'Animation' },
      { value: 'Comedy', label: 'Comedy' },
      { value: 'Crime', label: 'Crime' },
      { value: 'Documentary', label: 'Documentary' },
      { value: 'Drama', label: 'Drama' },
      { value: 'Family', label: 'Family' },
      { value: 'Fantasy', label: 'Fantasy' },
      { value: 'History', label: 'History' },
      { value: 'Horror', label: 'Horror' },
      { value: 'Music', label: 'Music' },
      { value: 'Mystery', label: 'Mystery' },
      { value: 'Romance', label: 'Romance' },
      { value: 'Science Fiction', label: 'Science Fiction' },
      { value: 'Thriller', label: 'Thriller' },
      { value: 'War', label: 'War' },
      { value: 'Western', label: 'Western' }
    ]
  },
  {
    key: 'recency',
    title: 'How old can the movie be?',
    hint: '',
    options: [
      { value: 'any', label: "Doesn't matter." },
      { value: '5', label: 'Published in the last 5 years.' },
      { value: '10', label: 'Published in the last 10 years.' },
      { value: '25', label: 'Published in the last 25 years.' }
    ]
  }
];

let currentQuizStep = 0;
let quizAnswers = {
  mood: null,
  occasion: null,
  mediaPreference: null,
  genres: [],
  recency: null
};

function initQuiz() {
  currentQuizStep = 0;
  quizAnswers = {
    mood: null,
    occasion: null,
    mediaPreference: null,
    genres: [],
    recency: null
  };
  switchTab('quiz-view');
  renderQuizStep();
}

function renderQuizStep() {
  const step = quizSteps[currentQuizStep];
  document.getElementById('quizStepIndicator').innerText = `STEP ${currentQuizStep + 1}/${quizSteps.length}`;
  document.getElementById('quizTitle').innerText = step.title;
  document.getElementById('quizHint').innerText = step.hint;

  const grid = document.getElementById('quizOptionsGrid');
  grid.innerHTML = '';

  step.options.forEach(opt => {
    const isSelected = step.multi ? quizAnswers[step.key].includes(opt.value) : quizAnswers[step.key] === opt.value;

    const div = document.createElement('div');
    div.className = `quiz-option ${isSelected ? 'selected' : ''}`;
    div.innerHTML = `
      <div class="quiz-option-title">${opt.label}</div>
      ${opt.sub ? `<div class="quiz-option-sub">${opt.sub}</div>` : ''}
    `;

    div.addEventListener('click', () => {
      if (step.multi) {
        if (isSelected) {
          quizAnswers[step.key] = quizAnswers[step.key].filter(v => v !== opt.value);
        } else {
          quizAnswers[step.key].push(opt.value);
        }
      } else {
        quizAnswers[step.key] = opt.value;
      }
      renderQuizStep();
    });

    grid.appendChild(div);
  });

  const canAdvance = step.multi ? true : quizAnswers[step.key] !== null;
  document.getElementById('btnQuizNext').disabled = !canAdvance;
  const backBtn = document.getElementById('btnQuizBack');
  backBtn.disabled = currentQuizStep === 0;
  backBtn.style.visibility = currentQuizStep === 0 ? 'hidden' : 'visible';
}

document.getElementById('btnQuizNext')?.addEventListener('click', () => {
  if (currentQuizStep < quizSteps.length - 1) {
    currentQuizStep++;
    renderQuizStep();
  } else {
    submitQuiz();
  }
});

document.getElementById('btnQuizBack')?.addEventListener('click', () => {
  if (currentQuizStep > 0) {
    currentQuizStep--;
    renderQuizStep();
  }
});



async function submitQuiz() {
  document.getElementById('btnQuizNext').innerText = 'COMPUTING...';
  document.getElementById('btnQuizNext').disabled = true;

  try {
    const res = await fetch('/api/quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(quizAnswers)
    });
    const data = await res.json();

    if (data.results && data.results.length > 0) {
      state.diagnosticResults = data.results;
      state.diagnosticIndex = 0;

      const diagnosticNav = document.getElementById('diagnosticNav');
      if (diagnosticNav) {
        diagnosticNav.style.display = 'flex';
        document.getElementById('diagMatchIndex').innerText = 1;
        document.getElementById('diagMatchTotal').innerText = data.results.length;
        const btnPrev = document.getElementById('btnDiagPrev');
        const btnNext = document.getElementById('btnDiagNext');
        if (btnPrev) btnPrev.disabled = true;
        if (btnNext) btnNext.disabled = data.results.length <= 1;
      }

      const firstMatch = data.results[0];
      openDetailView(firstMatch, firstMatch.mediaType || 'movie', true);
    } else {
      showToast('No recommendations found for your exact parameters.', 'error');
      switchTab('diagnostic-view');
    }
  } catch (err) {
    console.error('Quiz submit error:', err);
    showToast('Failed to fetch recommendations', 'error');
  } finally {
    const btnNext = document.getElementById('btnQuizNext');
    if (btnNext) {
      btnNext.innerText = 'NEXT >>';
      btnNext.disabled = false;
    }
  }
}

// --- Scrambler (Disabled) ---
function initScrambler() {
  // Scramble animation disabled for static typography and zero DOM layout thrashing
}
window.initScrambler = initScrambler;

// --- Fluid Animation (Imported from live fluid_sim repo & optimized for all devices) ---
let fluidInstance = null;
function initFluid(retryCount = 0) {
  if (!window.WebGLFluidCustom) {
    if (retryCount < 30) {
      setTimeout(() => initFluid(retryCount + 1), 100);
    }
    return;
  }

  try {
    const canvas = document.getElementById('fluid-canvas');
    if (!canvas) return;

    // Device performance profiling without changing any visible behavior
    const isMobile = window.innerWidth < 768 || (navigator.maxTouchPoints && navigator.maxTouchPoints > 1);
    const isLowPower = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ||
      (navigator.deviceMemory && navigator.deviceMemory <= 4);

    // Exact cartoon fluid parameters from fluid_sim repo with device-scaled resolutions
    fluidInstance = window.WebGLFluidCustom(canvas, {
      IMMEDIATE: true,        // Start immediately
      TRIGGER: 'hover',       // React to mouse hover & touch
      SIM_RESOLUTION: isMobile ? (isLowPower ? 48 : 64) : (isLowPower ? 96 : 128),
      DYE_RESOLUTION: isMobile ? (isLowPower ? 384 : 512) : (isLowPower ? 768 : 1024),
      CAPTURE_RESOLUTION: 512,
      DENSITY_DISSIPATION: 3.0,
      VELOCITY_DISSIPATION: 0.9,
      PRESSURE: 0.8,
      PRESSURE_ITERATIONS: isLowPower ? 8 : 10,
      CURL: 35,
      SPLAT_RADIUS: isMobile ? 0.15 : 0.1,
      SPLAT_FORCE: isMobile ? 1500 : 1200,
      SHADING: false,
      COLORFUL: true,
      GUI: false,
      PAUSED: false,
      BACK_COLOR: { r: 0, g: 0, b: 0 },
      TRANSPARENT: false,
      BLOOM: false,
      SUNRAYS: false,
    });

    let hasEntered = false;
    let cachedRect = null;
    let rectPending = false;

    const updateCachedRect = () => {
      cachedRect = canvas.getBoundingClientRect();
      rectPending = false;
    };
    updateCachedRect();

    // Cache resize and debounce URL bar height oscillations on mobile Chrome
    let lastWidth = window.innerWidth;
    let lastHeight = window.innerHeight;
    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // On mobile Chrome, scrolling past the bottom bar or top bar only alters height by ~56px.
      // Ignore tiny height changes to prevent costly WebGL texture re-allocations during address bar scroll
      if (w === lastWidth && Math.abs(h - lastHeight) < 80) {
        return;
      }
      lastWidth = w;
      lastHeight = h;
      if (!rectPending) {
        rectPending = true;
        requestAnimationFrame(updateCachedRect);
      }
    }, { passive: true });

    const dispatchFluidMouse = (type, x, y) => {
      if (!cachedRect) updateCachedRect();
      const offsetX = x - cachedRect.left;
      const offsetY = y - cachedRect.top;

      const evt = new MouseEvent(type, {
        clientX: x,
        clientY: y,
        bubbles: false,
        cancelable: false
      });
      // WebGLFluidCustom specifically reads e.offsetX and e.offsetY
      Object.defineProperty(evt, 'offsetX', { value: offsetX });
      Object.defineProperty(evt, 'offsetY', { value: offsetY });

      if (!hasEntered) {
        hasEntered = true;
        const enterEvt = new MouseEvent('mouseenter', {
          clientX: x,
          clientY: y,
          bubbles: false,
          cancelable: false
        });
        Object.defineProperty(enterEvt, 'offsetX', { value: offsetX });
        Object.defineProperty(enterEvt, 'offsetY', { value: offsetY });
        canvas.dispatchEvent(enterEvt);
      }
      canvas.dispatchEvent(evt);
    };

    // Coalesce high-frequency move/touch events with requestAnimationFrame for smooth 60fps on all devices
    let rafScheduled = false;
    let pendingMoves = [];

    const flushFluidEvents = () => {
      rafScheduled = false;
      for (let i = 0; i < pendingMoves.length; i++) {
        const item = pendingMoves[i];
        dispatchFluidMouse(item.type, item.x, item.y);
      }
      pendingMoves.length = 0;
    };

    const scheduleFluidMove = (type, x, y) => {
      if (type === 'mousemove') {
        let found = false;
        for (let i = 0; i < pendingMoves.length; i++) {
          if (pendingMoves[i].type === 'mousemove') {
            pendingMoves[i].x = x;
            pendingMoves[i].y = y;
            found = true;
            break;
          }
        }
        if (!found) pendingMoves.push({ type, x, y });
      } else {
        pendingMoves.push({ type, x, y });
      }
      if (!rafScheduled) {
        rafScheduled = true;
        requestAnimationFrame(flushFluidEvents);
      }
    };

    // Touch event listeners for seamless Mobile fluid interaction with rAF batching
    const forwardTouch = (e) => {
      if (!e.touches || e.touches.length === 0) return;
      for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];
        scheduleFluidMove('mousemove', touch.clientX, touch.clientY);
      }
    };

    const forwardMouse = (e) => {
      if (e.target !== canvas) {
        scheduleFluidMove(e.type, e.clientX, e.clientY);
      }
    };

    window.addEventListener('mousemove', forwardMouse, { passive: true });
    window.addEventListener('mousedown', forwardMouse, { passive: true });
    window.addEventListener('mouseup', forwardMouse, { passive: true });
    window.addEventListener('touchstart', forwardTouch, { passive: true });
    window.addEventListener('touchmove', forwardTouch, { passive: true });

    // Initial gesture after webgl-fluid listener is active (500ms delay internally)
    setTimeout(() => {
      const rect = canvas.getBoundingClientRect();
      const clientX = rect.width * 0.5;
      const clientY = rect.height * 0.35;
      dispatchFluidMouse('mouseenter', clientX, clientY);
      dispatchFluidMouse('mousemove', clientX + 25, clientY + 25);
      dispatchFluidMouse('mousemove', clientX + 60, clientY + 45);
    }, 600);
  } catch (e) {
    console.warn('Fluid simulation init failed:', e);
  }
}

// Optimize background tab resources
document.addEventListener('visibilitychange', () => {
  if (fluidInstance && typeof fluidInstance.pause === 'function') {
    if (document.hidden || state.activeTab === 'tutorial-view') fluidInstance.pause();
    else fluidInstance.resume();
  }
});

// --- Listeners ---
function setupEventListeners() {
  document.getElementById('settingsForm')?.addEventListener('submit', saveSettings);

  document.getElementById('google-login-btn')?.addEventListener('click', handleGoogleLogin);
  document.getElementById('signout-btn')?.addEventListener('click', handleSignOut);
  document.getElementById('profileLogoutBtn')?.addEventListener('click', handleSignOut);

  // User Profile header click opens Profile & Watchlist view
  document.getElementById('user-profile')?.addEventListener('click', (e) => {
    if (e.target.closest('#signout-btn')) return;
    switchTab('profile-view');
  });

  document.getElementById('btnStartDiagnostic')?.addEventListener('click', () => {
    initQuiz();
    renderQuizStep();
  });

  document.getElementById('btnCancelQuiz')?.addEventListener('click', () => {
    switchTab('diagnostic-view');
  });

  const overrideBtn = document.getElementById('btnOverrideDiagnostic');
  if (overrideBtn) {
    overrideBtn.addEventListener('click', () => {
      const tabs = ['movies-view', 'anime-view'];
      const randomTab = tabs[Math.floor(Math.random() * tabs.length)];
      switchTab(randomTab);
    });
  }

  // Quick Mood Starter Cards in Explore View
  document.querySelectorAll('.mood-card').forEach(card => {
    const trigger = () => {
      const mood = card.dataset.mood;
      handleQuickMoodSelect(mood);
    };
    card.addEventListener('click', trigger);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        trigger();
      }
    });
  });

  // Desktop Navigation
  elements.mainNav.addEventListener('click', e => {
    const btn = e.target.closest('.nav-tab');
    if (!btn) return;
    switchTab(btn.dataset.tab);
  });

  // Mobile Bottom Navigation Bar
  const mobileNav = document.getElementById('mobileBottomNav');
  if (mobileNav) {
    mobileNav.addEventListener('click', e => {
      const btn = e.target.closest('.mobile-nav-item');
      if (!btn) return;
      switchTab(btn.dataset.tab);
    });
  }

  // Header Quick Action Buttons
  document.getElementById('header-tutorial-btn')?.addEventListener('click', () => {
    if (state.activeTab === 'tutorial-view') {
      switchTab(state.previousTab || state.lastFeedTab || 'movies-view');
    } else {
      switchTab('tutorial-view');
    }
  });

  document.getElementById('header-profile-btn')?.addEventListener('click', () => {
    switchTab('profile-view');
  });

  document.getElementById('header-settings-btn')?.addEventListener('click', () => {
    switchTab('profile-view');
  });

  document.getElementById('btn-close-settings')?.addEventListener('click', () => {
    switchTab(state.previousTab || state.lastFeedTab || 'movies-view');
  });

  // Watchlist UI Listeners
  document.getElementById('btnBrowseFromWatchlist')?.addEventListener('click', () => {
    switchTab('movies-view');
  });

  document.querySelectorAll('.watchlist-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.watchlist-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.watchlistFilter = btn.dataset.filter || 'all';
      renderWatchlist();
    });
  });

  // --- Watchlist Studio: 3-Dot Overflow Menu & Clear All ---
  document.getElementById('btnWatchlistMore')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = document.getElementById('wlMoreDropdown');
    const trigger = document.getElementById('btnWatchlistMore');
    if (dropdown) {
      const isHidden = dropdown.classList.toggle('hidden');
      trigger?.setAttribute('aria-expanded', !isHidden ? 'true' : 'false');
      trigger?.classList.toggle('active', !isHidden);
    }
  });

  document.getElementById('btnClearWatchlist')?.addEventListener('click', async () => {
    const dropdown = document.getElementById('wlMoreDropdown');
    dropdown?.classList.add('hidden');
    const trigger = document.getElementById('btnWatchlistMore');
    trigger?.setAttribute('aria-expanded', 'false');
    trigger?.classList.remove('active');

    if (confirm('Are you sure you want to clear your entire watchlist?')) {
      state.watchlist = [];
      await saveWatchlist();
      const userId = state.user ? state.user.id : 'guest';
      getAuthHeaders().then(authHeaders => {
        fetch(`/api/user/watchlist?userId=${encodeURIComponent(userId)}`, { method: 'DELETE', headers: authHeaders }).catch(() => {});
      });
      showToast('Watchlist cleared', 'info');
    }
  });

  // --- Watchlist Studio: Rapid Title Entry ---
  const rapidInput = document.getElementById('rapidTitleInput');
  const rapidClearBtn = document.getElementById('btnClearRapidTitle');
  const rapidAddBtn = document.getElementById('btnRapidAdd');

  rapidInput?.addEventListener('input', (e) => {
    clearTimeout(rapidSearchDebounceTimer);
    rapidSearchDebounceTimer = setTimeout(() => {
      handleRapidSearchInput(e.target.value);
    }, 250);
  });

  rapidInput?.addEventListener('focus', () => {
    if (rapidInput.value.trim().length >= 2) {
      handleRapidSearchInput(rapidInput.value);
    }
  });

  rapidInput?.addEventListener('keydown', (e) => {
    const dropdown = document.getElementById('rapidSearchResults');
    const isVisible = dropdown && !dropdown.classList.contains('hidden');
    const rows = dropdown ? Array.from(dropdown.querySelectorAll('.rapid-result-row')) : [];

    if (e.key === 'ArrowDown' && isVisible && rows.length > 0) {
      e.preventDefault();
      const currentIndex = rows.findIndex(r => r.classList.contains('selected'));
      if (currentIndex >= 0) rows[currentIndex].classList.remove('selected');
      const nextIndex = currentIndex < rows.length - 1 ? currentIndex + 1 : 0;
      rows[nextIndex].classList.add('selected');
      rows[nextIndex].scrollIntoView({ block: 'nearest' });
      return;
    }

    if (e.key === 'ArrowUp' && isVisible && rows.length > 0) {
      e.preventDefault();
      const currentIndex = rows.findIndex(r => r.classList.contains('selected'));
      if (currentIndex >= 0) rows[currentIndex].classList.remove('selected');
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : rows.length - 1;
      rows[prevIndex].classList.add('selected');
      rows[prevIndex].scrollIntoView({ block: 'nearest' });
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const selectedRow = dropdown?.querySelector('.rapid-result-row.selected');
      if (selectedRow) {
        selectedRow.click();
      } else {
        executeRapidAdd();
      }
    } else if (e.key === 'Escape') {
      dropdown?.classList.add('hidden');
    }
  });

  rapidClearBtn?.addEventListener('click', () => {
    if (rapidInput) rapidInput.value = '';
    handleRapidSearchInput('');
  });

  rapidAddBtn?.addEventListener('click', () => {
    executeRapidAdd();
  });

  // Close rapid dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.rapid-entry-container')) {
      document.getElementById('rapidSearchResults')?.classList.add('hidden');
    }
  });

  // --- Watchlist Studio: Stats Ribbon Quick Filters ---
  document.getElementById('wlStatTotal')?.closest('.stat-cell')?.addEventListener('click', () => {
    state.watchlistFilters.type = 'all';
    state.watchlistFilters.status = 'all';
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.toggle('active', p.dataset.filterType === 'all'));
    const elStatus = document.getElementById('wlStatusSelect');
    if (elStatus) elStatus.value = 'all';
    syncRetroCustomSelect(elStatus);
    renderWatchlist();
  });
  document.getElementById('wlStatMovies')?.closest('.stat-cell')?.addEventListener('click', () => {
    state.watchlistFilters.type = 'movie';
    state.watchlistFilters.status = 'all';
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.toggle('active', p.dataset.filterType === 'movie'));
    renderWatchlist();
  });
  document.getElementById('wlStatShows')?.closest('.stat-cell')?.addEventListener('click', () => {
    state.watchlistFilters.type = 'tv';
    state.watchlistFilters.status = 'all';
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.toggle('active', p.dataset.filterType === 'tv'));
    renderWatchlist();
  });
  document.getElementById('wlStatCompleted')?.closest('.stat-cell')?.addEventListener('click', () => {
    state.watchlistFilters.status = 'completed';
    state.watchlistFilters.type = 'all';
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.toggle('active', p.dataset.filterStatus === 'completed'));
    const elStatus = document.getElementById('wlStatusSelect');
    if (elStatus) elStatus.value = 'completed';
    syncRetroCustomSelect(elStatus);
    renderWatchlist();
  });

  // --- Watchlist Studio: Sub-Tabs Navigation ---
  document.querySelectorAll('.wl-subnav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchWatchlistSubTab(btn.dataset.subtab);
    });
  });

  // --- Watchlist Studio: Advanced Filter Drawer & Controls ---
  document.getElementById('btnToggleFilters')?.addEventListener('click', () => {
    const drawer = document.getElementById('watchlistFilterDrawer');
    if (drawer) drawer.classList.toggle('hidden');
  });

  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');

      const filterKind = pill.dataset.filterKind;
      if (filterKind === 'status') {
        state.watchlistFilters.status = pill.dataset.filterStatus || 'all';
        state.watchlistFilters.type = 'all';
      } else {
        state.watchlistFilters.type = pill.dataset.filterType || 'all';
        state.watchlistFilters.status = 'all';
      }

      const elStatus = document.getElementById('wlStatusSelect');
      if (elStatus) elStatus.value = state.watchlistFilters.status;
      syncRetroCustomSelect(elStatus);

      updateActiveFilterIndicator();
      renderWatchlist();
    });
  });

  document.getElementById('wlStatusSelect')?.addEventListener('change', (e) => {
    state.watchlistFilters.status = e.target.value;
    updateActiveFilterIndicator();
    renderWatchlist();
  });

  document.getElementById('wlGenreSelect')?.addEventListener('change', (e) => {
    state.watchlistFilters.genre = e.target.value;
    updateActiveFilterIndicator();
    renderWatchlist();
  });

  document.getElementById('wlYearSelect')?.addEventListener('change', (e) => {
    state.watchlistFilters.year = e.target.value;
    updateActiveFilterIndicator();
    renderWatchlist();
  });

  const ratingSlider = document.getElementById('wlRatingSlider');
  const ratingSliderVal = document.getElementById('ratingSliderVal');
  ratingSlider?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (ratingSliderVal) ratingSliderVal.textContent = val.toFixed(1);
    state.watchlistFilters.minRating = val;
    updateActiveFilterIndicator();
    renderWatchlist();
  });

  document.getElementById('wlRuntimeSelect')?.addEventListener('change', (e) => {
    state.watchlistFilters.runtime = e.target.value;
    updateActiveFilterIndicator();
    renderWatchlist();
  });

  document.getElementById('wlSortSelect')?.addEventListener('change', (e) => {
    state.watchlistFilters.sort = e.target.value;
    renderWatchlist();
  });

  document.getElementById('wlSearchFilterInput')?.addEventListener('input', (e) => {
    state.watchlistFilters.search = e.target.value;
    renderWatchlist();
  });

  document.getElementById('btnResetFilters')?.addEventListener('click', () => {
    resetWatchlistFilters();
  });

  // Initialize custom retro select components for watchlist controls
  ['wlSortSelect', 'wlGenreSelect', 'wlYearSelect', 'wlRuntimeSelect', 'wlStatusSelect', 'streamingRegionSelect'].forEach(id => {
    const el = document.getElementById(id);
    if (el) initRetroCustomSelect(el);
  });

  // Global dismiss listeners for open retro select menus & 3-dot overflow menus
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.retro-select-container')) {
      document.querySelectorAll('.retro-select-menu:not(.hidden)').forEach(m => {
        m.classList.add('hidden');
        const t = m.parentElement?.querySelector('.retro-select-trigger');
        if (t) {
          t.setAttribute('aria-expanded', 'false');
          t.classList.remove('open');
        }
        m.parentElement?.classList.remove('open');
      });
    }
    if (!e.target.closest('#wlMoreActionsWrap')) {
      const dropdown = document.getElementById('wlMoreDropdown');
      if (dropdown && !dropdown.classList.contains('hidden')) {
        dropdown.classList.add('hidden');
        const trigger = document.getElementById('btnWatchlistMore');
        trigger?.setAttribute('aria-expanded', 'false');
        trigger?.classList.remove('active');
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.retro-select-menu:not(.hidden)').forEach(m => {
        m.classList.add('hidden');
        const t = m.parentElement?.querySelector('.retro-select-trigger');
        if (t) {
          t.setAttribute('aria-expanded', 'false');
          t.classList.remove('open');
          t.focus();
        }
        m.parentElement?.classList.remove('open');
      });
      const dropdown = document.getElementById('wlMoreDropdown');
      if (dropdown && !dropdown.classList.contains('hidden')) {
        dropdown.classList.add('hidden');
        const trigger = document.getElementById('btnWatchlistMore');
        trigger?.setAttribute('aria-expanded', 'false');
        trigger?.classList.remove('active');
        trigger?.focus();
      }
    }
  });

  // --- TV Episode Modal ---
  document.getElementById('btnCloseEpisodeModal')?.addEventListener('click', closeEpisodeModal);
  document.getElementById('episodeSeasonSelect')?.addEventListener('change', (e) => {
    loadSeasonEpisodes(parseInt(e.target.value, 10));
  });
  document.getElementById('btnMarkSeasonComplete')?.addEventListener('click', () => {
    const seasonSelect = document.getElementById('episodeSeasonSelect');
    if (seasonSelect) markSeasonCompleted(parseInt(seasonSelect.value, 10));
  });

  // --- Watch Diary Modal ---
  document.getElementById('btnAddDiaryEntryDirect')?.addEventListener('click', () => openDiaryModal(null));
  document.getElementById('btnCloseDiaryModal')?.addEventListener('click', closeDiaryModal);
  document.getElementById('diaryRatingSlider')?.addEventListener('input', (e) => {
    const display = document.getElementById('diaryRatingDisplay');
    if (display) display.textContent = parseFloat(e.target.value).toFixed(1);
  });
  document.getElementById('diaryForm')?.addEventListener('submit', saveDiaryEntry);

  // --- Custom Curated Lists Modals ---
  document.getElementById('btnCreateCustomList')?.addEventListener('click', openCustomListModal);
  document.getElementById('btnCloseCustomListModal')?.addEventListener('click', closeCustomListModal);
  document.getElementById('customListForm')?.addEventListener('submit', createCustomList);
  document.getElementById('btnCloseAssignModal')?.addEventListener('click', closeAssignToListModal);
  document.getElementById('btnSaveAssignLists')?.addEventListener('click', saveAssignLists);

  // --- Regional Streaming Availability Modal ---
  document.getElementById('btnCloseStreamingModal')?.addEventListener('click', closeStreamingModal);
  document.getElementById('btnCloseLightbox')?.addEventListener('click', closeFrameLightbox);
  document.getElementById('frameLightboxModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'frameLightboxModal') {
      closeFrameLightbox();
    }
  });
  document.getElementById('streamingRegionSelect')?.addEventListener('change', (e) => {
    loadStreamingProviders(e.target.value);
  });

  // --- Data Import & Export Modal ---
  document.getElementById('btnImportExport')?.addEventListener('click', openImportExportModal);
  document.getElementById('btnCloseImportExportModal')?.addEventListener('click', closeImportExportModal);
  document.getElementById('btnExportCSV')?.addEventListener('click', () => exportData('csv'));
  document.getElementById('btnExportLetterboxd')?.addEventListener('click', () => exportData('letterboxd'));
  document.getElementById('btnExportTrakt')?.addEventListener('click', () => exportData('trakt'));

  const importDropzone = document.getElementById('importDropzone');
  const importFileInput = document.getElementById('importFileInput');
  importDropzone?.addEventListener('click', () => importFileInput?.click());
  importFileInput?.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleImportFile(e.target.files[0]);
    }
  });

  importDropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    importDropzone.classList.add('drag-active');
  });
  importDropzone?.addEventListener('dragleave', () => {
    importDropzone.classList.remove('drag-active');
  });
  importDropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    importDropzone.classList.remove('drag-active');
    if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
      handleImportFile(e.dataTransfer.files[0]);
    }
  });

  document.getElementById('btnExecuteImport')?.addEventListener('click', executeImport);
  document.getElementById('btnClearImportPreview')?.addEventListener('click', () => {
    state.pendingImportItems = [];
    document.getElementById('importPreviewWrap')?.classList.add('hidden');
    const fileInput = document.getElementById('importFileInput');
    if (fileInput) fileInput.value = '';
  });


  // Brand Logos & Tutorial View Nav
  const logoBtn = document.getElementById('logo-btn');
  if (logoBtn) {
    const handleLogoClick = () => switchTab(state.isSharedPage ? 'share-view' : (state.lastFeedTab || 'movies-view'));
    logoBtn.addEventListener('click', handleLogoClick);
    logoBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleLogoClick();
      }
    });
  }
  document.getElementById('shareTutorialBtn')?.addEventListener('click', () => switchTab('tutorial-view'));
  document.getElementById('tutorial-logo-btn')?.addEventListener('click', () => switchTab(state.isSharedPage ? 'share-view' : (state.previousTab || state.lastFeedTab || 'movies-view')));
  document.getElementById('tutorial-back-feed-btn')?.addEventListener('click', () => switchTab(state.isSharedPage ? 'share-view' : (state.previousTab || state.lastFeedTab || 'movies-view')));
  document.getElementById('back-to-share-btn')?.addEventListener('click', () => switchTab('share-view'));

  // Movies & TV Combined
  elements.btnClearMovieSearch?.addEventListener('click', () => {
    elements.movieSearchInput.value = '';
    const b = document.getElementById('movieTypoBanner');
    if (b) { b.innerHTML = ''; b.classList.add('hidden'); }
    loadMovies();
  });
  elements.movieSearchInput?.addEventListener('change', () => loadMovies());
  elements.movieSearchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      loadMovies();
    }
  });
  elements.btnExecuteMovieSearch?.addEventListener('click', () => loadMovies());
  elements.movieTypeSelect?.addEventListener('change', () => loadMovies());
  elements.movieCategorySelect?.addEventListener('change', () => loadMovies());
  elements.movieYearSelect?.addEventListener('change', () => loadMovies());

  // Anime
  elements.btnClearAnimeSearch?.addEventListener('click', () => {
    if (elements.animeSearchInput) elements.animeSearchInput.value = '';
    const b = document.getElementById('animeTypoBanner');
    if (b) { b.innerHTML = ''; b.classList.add('hidden'); }
    loadAnime();
  });
  elements.animeSearchInput?.addEventListener('change', () => loadAnime());
  elements.animeSearchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      loadAnime();
    }
  });
  elements.btnExecuteAnimeSearch?.addEventListener('click', () => loadAnime());
  elements.animeTypeSelect?.addEventListener('change', () => loadAnime());
  elements.animeCategorySelect?.addEventListener('change', () => loadAnime());
  elements.animeYearSelect?.addEventListener('change', () => loadAnime());

  // TV (Fallback preserved)
  elements.btnClearTvSearch?.addEventListener('click', () => {
    if (elements.tvSearchInput) elements.tvSearchInput.value = '';
    const b = document.getElementById('tvTypoBanner');
    if (b) { b.innerHTML = ''; b.classList.add('hidden'); }
    loadTVShows();
  });
  elements.tvSearchInput?.addEventListener('change', () => loadTVShows());
  elements.tvSearchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      loadTVShows();
    }
  });
  elements.btnExecuteTvSearch?.addEventListener('click', () => loadTVShows());
  elements.tvCategorySelect?.addEventListener('change', () => loadTVShows());

  setupArtistSearchSuggestions();

  // Artist Search Form
  elements.directSearchForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const query = elements.directSearchInput?.value || '';
    performDirectSearch(query);
  });

  // Artist search clear button
  const clearArtistBtn = document.getElementById('btnClearArtistSearch') || document.getElementById('btnClearActorSearch');
  if (clearArtistBtn) {
    clearArtistBtn.addEventListener('click', () => {
      if (elements.directSearchInput) {
        elements.directSearchInput.value = '';
        clearArtistBtn.classList.add('hidden');
        elements.directSearchInput.focus();
      }
    });
  }

  if (elements.directSearchInput) {
    elements.directSearchInput.addEventListener('input', () => {
      if (clearArtistBtn) {
        if (elements.directSearchInput.value.trim().length > 0) {
          clearArtistBtn.classList.remove('hidden');
        } else {
          clearArtistBtn.classList.add('hidden');
        }
      }
    });
  }

  // Quick Artist starter chips
  document.querySelectorAll('.actor-chip, .artist-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const artistName = chip.dataset.artist || chip.dataset.actor;
      if (artistName && elements.directSearchInput) {
        elements.directSearchInput.value = artistName;
        if (clearArtistBtn) clearArtistBtn.classList.remove('hidden');
        performDirectSearch(artistName);
      }
    });
  });

  // Modals & Backdrop click-to-close
  elements.btnCloseModal.addEventListener('click', () => { elements.torrentModal.classList.add('hidden'); });
  elements.btnCloseCycleModal.addEventListener('click', () => { elements.cycleModal.classList.add('hidden'); });
  document.getElementById('close-trailer-modal-btn')?.addEventListener('click', () => {
    document.getElementById('trailer-modal').classList.add('hidden');
    document.getElementById('trailer-iframe').src = '';
    trailerPlayerState.sources = [];
    if (fluidInstance && typeof fluidInstance.resume === 'function' && !document.hidden && state.activeTab !== 'tutorial-view') {
      fluidInstance.resume();
    }
  });
  document.getElementById('trailer-alt-btn')?.addEventListener('click', () => {
    if (trailerPlayerState.sources.length > 1) {
      trailerPlayerState.currentIndex = (trailerPlayerState.currentIndex + 1) % trailerPlayerState.sources.length;
      renderActiveTrailerSource();
    }
  });

  // Close modals on clicking overlay backdrop
  [elements.torrentModal, elements.cycleModal, document.getElementById('trailer-modal')].forEach(modal => {
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.add('hidden');
          const trailerIframe = document.getElementById('trailer-iframe');
          if (modal.id === 'trailer-modal' && trailerIframe) {
            trailerIframe.src = '';
            if (fluidInstance && typeof fluidInstance.resume === 'function' && !document.hidden && state.activeTab !== 'tutorial-view') {
              fluidInstance.resume();
            }
          }
        }
      });
    }
  });

  // Global Escape key listener for closing open modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      elements.torrentModal?.classList.add('hidden');
      elements.cycleModal?.classList.add('hidden');
      const trailerModal = document.getElementById('trailer-modal');
      if (trailerModal && !trailerModal.classList.contains('hidden')) {
        trailerModal.classList.add('hidden');
        const trailerIframe = document.getElementById('trailer-iframe');
        if (trailerIframe) trailerIframe.src = '';
        if (fluidInstance && typeof fluidInstance.resume === 'function' && !document.hidden && state.activeTab !== 'tutorial-view') {
          fluidInstance.resume();
        }
      }
    }
  });

  elements.btnBackToFeed?.addEventListener('click', () => switchTab(state.lastFeedTab));

  // Similar Media Scrolling & Horizontal Mouse Wheel Support
  const similarContainer = document.getElementById('similarMediaContainer');
  if (similarContainer) {
    similarContainer.onwheel = (e) => {
      if (e.deltaY !== 0 && similarContainer.scrollWidth > similarContainer.clientWidth) {
        e.preventDefault();
        similarContainer.scrollLeft += e.deltaY;
      }
    };
  }
  document.getElementById('btnSimilarLeft')?.addEventListener('click', () => {
    if (similarContainer) similarContainer.scrollBy({ left: -320, behavior: 'smooth' });
  });
  document.getElementById('btnSimilarRight')?.addEventListener('click', () => {
    if (similarContainer) similarContainer.scrollBy({ left: 320, behavior: 'smooth' });
  });

  // Diagnostic Navigation
  document.getElementById('btnDiagExit')?.addEventListener('click', () => {
    const nav = document.getElementById('diagnosticNav');
    if (nav) nav.style.display = 'none';
    state.diagnosticResults = null;
    switchTab('diagnostic-view');
  });

  document.getElementById('btnDiagPrev')?.addEventListener('click', () => {
    if (state.diagnosticResults && state.diagnosticIndex > 0) {
      state.diagnosticIndex--;
      const idx = state.diagnosticIndex;
      const total = state.diagnosticResults.length;

      const idxEl = document.getElementById('diagMatchIndex');
      if (idxEl) idxEl.innerText = idx + 1;
      const btnPrev = document.getElementById('btnDiagPrev');
      const btnNext = document.getElementById('btnDiagNext');
      if (btnPrev) btnPrev.disabled = idx <= 0;
      if (btnNext) btnNext.disabled = idx >= total - 1;

      const m = state.diagnosticResults[idx];
      openDetailView(m, m.mediaType || 'movie', true);
    }
  });

  document.getElementById('btnDiagNext')?.addEventListener('click', () => {
    if (state.diagnosticResults && state.diagnosticIndex < state.diagnosticResults.length - 1) {
      state.diagnosticIndex++;
      const idx = state.diagnosticIndex;
      const total = state.diagnosticResults.length;

      const idxEl = document.getElementById('diagMatchIndex');
      if (idxEl) idxEl.innerText = idx + 1;
      const btnPrev = document.getElementById('btnDiagPrev');
      const btnNext = document.getElementById('btnDiagNext');
      if (btnPrev) btnPrev.disabled = idx <= 0;
      if (btnNext) btnNext.disabled = idx >= total - 1;

      const m = state.diagnosticResults[idx];
      openDetailView(m, m.mediaType || 'movie', true);
    }
  });
}

// Artist Search & Filmography Engine (Google & TMDB enriched)
// Artist Search & Filmography Engine (Google & TMDB enriched)
window.artistCreditsCache = [];
window.actorCreditsCache = window.artistCreditsCache;

window.handleArtistCardAction = function (index, action, event) {
  if (event && event.stopPropagation) {
    event.stopPropagation();
  }
  const item = (window.artistCreditsCache || window.actorCreditsCache)[index];
  if (!item) return;
  if (action === 'torrent') {
    openTorrentModal(item, item.mediaType || 'movie');
  } else if (action === 'trailer') {
    playTrailer(item.id, item.mediaType || 'movie', item.title, item.year);
  } else if (action === 'detail') {
    openDetailView(item, item.mediaType || 'movie');
  }
};
window.handleActorCardAction = window.handleArtistCardAction;

function isCharacterRoleMatch(creditRole, targetCharacter) {
  if (!creditRole || !targetCharacter) return false;

  const targetNorm = targetCharacter.toLowerCase().trim();
  if (targetNorm.length < 2) return false;

  const cleanRole = creditRole
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleanRole.length < 2) return false;
  if (cleanRole === targetNorm) return true;

  const targetTokens = targetNorm.split(/\s+/).filter(w => w.length >= 3);
  if (targetTokens.length > 1) {
    if (cleanRole.includes(targetNorm)) return true;
    if (targetTokens.every(t => cleanRole.split(/\s+/).some(rw => rw === t || rw.startsWith(t)))) return true;
  }

  if (targetTokens.length === 1) {
    const singleToken = targetTokens[0];
    const roleWords = cleanRole.split(/\s+/);
    if (roleWords.some(rw => rw === singleToken || (rw.length >= 4 && rw.startsWith(singleToken)))) return true;
  }

  const roleWords = cleanRole.split(/\s+/);
  if (roleWords.length === 1 && roleWords[0].length >= 4) {
    if (targetTokens.some(tw => tw === roleWords[0])) return true;
  }

  return false;
}

window.fetchArtistDetailsById = async function (artistId, characterPlayed = '') {
  if (!elements.directSearchResults) return;
  elements.directSearchResults.innerHTML = `
    <div class="actor-search-loading artist-search-loading retro-box">
      <div class="actor-loading-spinner artist-loading-spinner"></div>
      <div class="actor-loading-text artist-loading-text scramble-text">LOADING ARTIST FILMOGRAPHY & GOOGLE KNOWLEDGE...</div>
    </div>
  `;

  try {
    const charParam = characterPlayed ? `?character=${encodeURIComponent(characterPlayed)}` : '';
    const res = await fetch(`/api/artist/${artistId}${charParam}`);
    const data = await res.json();
    const artistData = data.artist || data.actor;
    if (data.success && artistData) {
      if (characterPlayed) {
        artistData.characterPlayed = characterPlayed;
      } else {
        artistData.characterPlayed = null;
        delete artistData.characterPlayed;
      }
      state.currentArtist = artistData;
      state.currentActor = artistData;

      if (!characterPlayed) {
        state.artistMatches = [artistData];
        state.actorMatches = [artistData];
      }

      renderArtistFilmography(
        artistData,
        characterPlayed ? (state.artistMatches || state.actorMatches || []) : [artistData],
        ''
      );
      elements.directSearchResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      showToast('Could not load artist details', 'error');
    }
  } catch (err) {
    showToast('Failed to fetch artist profile', 'error');
  }
};
window.fetchActorDetailsById = window.fetchArtistDetailsById;

function renderFilmographyCards(credits, filter = 'all', sort = 'popularity', activeChar = '') {
  const container = document.getElementById('artistFilmographyGrid') || document.getElementById('actorFilmographyGrid');
  if (!container) return;

  let filtered = [...credits];
  if (filter === 'movie') {
    filtered = filtered.filter(c => c.mediaType === 'movie');
  } else if (filter === 'tv') {
    filtered = filtered.filter(c => c.mediaType === 'tv');
  }

  // Sort
  if (sort === 'popularity') {
    filtered.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  } else if (sort === 'rating') {
    filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  } else if (sort === 'newest') {
    filtered.sort((a, b) => (b.year || 0) - (a.year || 0));
  } else if (sort === 'oldest') {
    filtered.sort((a, b) => (a.year || 9999) - (b.year || 9999));
  }

  // Prioritize matching character role items first when a character query is searched!
  const hasCharMatch = Boolean(activeChar) && filtered.some(c => c.isTargetCharacterMatch);
  if (hasCharMatch) {
    filtered.sort((a, b) => {
      if (a.isTargetCharacterMatch && !b.isTargetCharacterMatch) return -1;
      if (!a.isTargetCharacterMatch && b.isTargetCharacterMatch) return 1;
      return 0;
    });
  }

  window.artistCreditsCache = filtered;
  window.actorCreditsCache = filtered;

  if (filtered.length === 0) {
    container.innerHTML = '<div style="grid-column: 1 / -1; padding: 40px; text-align: center; font-family: var(--font-mono); opacity: 0.8;">No credits found in this category.</div>';
    return;
  }

  container.innerHTML = filtered.map((item, index) => {
    const isTv = item.mediaType === 'tv';
    const typeLabel = isTv ? 'TV' : 'MOVIE';
    const yearDisplay = item.year || 'N/A';
    const ratingDisplay = item.rating > 0 ? `★ ${item.rating.toFixed(1)}` : 'NR';
    const effectiveChar = activeChar || (state.currentArtist?.characterPlayed || '');
    const isCharMatch = Boolean(effectiveChar) && Boolean(item.isTargetCharacterMatch);
    const characterDisplay = item.character && item.character !== 'Self / Featured' ? `as ${escapeHtml(item.character)}` : '';
    const charBadgeHtml = isCharMatch && effectiveChar ? `
      <div class="character-role-badge">
        <span class="material-symbols-outlined" style="font-size:12px;">theater_comedy</span>
        <span>PORTRAYED ${escapeHtml(effectiveChar.toUpperCase())}</span>
      </div>
    ` : '';

    return `
      <div class="movie-card retro-box actor-filmo-card artist-filmo-card ${isCharMatch ? 'is-character-role-card' : ''}" data-index="${index}" data-media-id="${item.id}" data-media-type="${item.mediaType}" tabindex="0" role="button" aria-label="${escapeHtml(item.title)} details" onclick="handleArtistCardAction(${index}, 'detail', event)">
        <div class="movie-poster-wrap">
          <img src="${item.poster || 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=500'}" 
               alt="${escapeHtml(item.title)}" 
               class="movie-poster" 
               loading="lazy" 
               onerror="this.src='https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=500'" />
          <div class="media-type-badge ${isTv ? 'badge-tv' : 'badge-movie'}">${typeLabel}</div>
          <div class="media-rating-pill">${ratingDisplay}</div>
          ${item.isDownloaded ? '<div class="downloaded-badge"><span class="material-symbols-outlined" style="font-size:12px;">check</span> SAVED</div>' : ''}
          ${charBadgeHtml}
        </div>
        <div class="movie-card-info">
          <div class="movie-card-header">
            <h3 class="movie-card-title scramble-text" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h3>
            <span class="movie-card-year">${yearDisplay}</span>
          </div>
          ${characterDisplay ? `<div class="actor-card-role artist-card-role ${isCharMatch ? 'char-role-highlight' : ''}" title="${characterDisplay}">${isCharMatch ? '★ ' : ''}${characterDisplay}</div>` : ''}
          <div class="actor-card-actions artist-card-actions">
            <button type="button" class="retro-btn actor-card-btn artist-card-btn filmo-torrent-btn" onclick="event.stopPropagation(); handleArtistCardAction(${index}, 'torrent', event)">
              <span class="material-symbols-outlined" style="font-size:14px;">download</span>
              <span>TORRENTS</span>
            </button>
            <button type="button" class="retro-btn actor-card-btn artist-card-btn filmo-trailer-btn" onclick="event.stopPropagation(); handleArtistCardAction(${index}, 'trailer', event)" title="Play Trailer">
              <span class="material-symbols-outlined" style="font-size:14px;">play_arrow</span>
              <span>TRAILER</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Wire card click directly to open detail view (while preventing clicks inside buttons)
  container.querySelectorAll('.actor-filmo-card, .artist-filmo-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const index = parseInt(card.dataset.index, 10);
      handleArtistCardAction(index, 'detail', e);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target.closest('button')) return;
        e.preventDefault();
        const index = parseInt(card.dataset.index, 10);
        handleArtistCardAction(index, 'detail', e);
      }
    });
  });
}

function renderArtistFilmography(artist, matches = [], originalQuery = '') {
  if (!elements.directSearchResults) return;

  state.currentArtist = artist;
  state.currentActor = artist;

  const totalCredits = artist.credits?.length || 0;
  const movieCredits = (artist.credits || []).filter(c => c.mediaType === 'movie');
  const tvCredits = (artist.credits || []).filter(c => c.mediaType === 'tv');

  const cleanOriginal = (originalQuery || '').trim();
  const hasTypo = cleanOriginal && artist.name.toLowerCase() !== cleanOriginal.toLowerCase();
  const typoHtml = hasTypo ? `
    <div class="actor-typo-notice artist-typo-notice">
      <span class="material-symbols-outlined" style="font-size: 16px; color: #000;">auto_fix_high</span>
      <span>Spelling mistake tolerated: showing <strong>${escapeHtml(artist.name)}</strong> for "<em>${escapeHtml(cleanOriginal)}</em>"</span>
    </div>
  ` : '';

  const matchingItemInMatches = Array.isArray(matches) ? matches.find(m => m.id === artist.id) : null;
  const characterPlayed = artist.characterPlayed || (matchingItemInMatches ? matchingItemInMatches.characterPlayed : null) || null;

  if (characterPlayed && artist.credits && Array.isArray(artist.credits)) {
    artist.credits.forEach(c => {
      c.isTargetCharacterMatch = isCharacterRoleMatch(c.character, characterPlayed);
    });
  } else if (artist.credits && Array.isArray(artist.credits)) {
    artist.credits.forEach(c => {
      c.isTargetCharacterMatch = false;
    });
  }
  const characterBannerHtml = characterPlayed ? `
    <div class="character-match-banner retro-box">
      <div class="char-banner-tag-row">
        <span class="status-dot"></span>
        <span class="char-banner-tag">CHARACTER MATCH</span>
        <span class="char-banner-role">${escapeHtml(characterPlayed.toUpperCase())}</span>
      </div>
      <div class="char-banner-text">
        <strong>${escapeHtml(artist.name)}</strong> portrayed the character <strong>${escapeHtml(characterPlayed)}</strong>
        ${matches && matches.length > 1 ? ` — select an actor who portrayed this character below:` : ''}
      </div>
    </div>
  ` : '';

  // Alternative matches strip (or actors who played the character)
  let matchesHtml = '';
  if (matches && matches.length > 1) {
    const listLabel = characterPlayed ? `ACTORS WHO PLAYED ${escapeHtml(characterPlayed.toUpperCase())}:` : 'ALL MATCHES:';
    matchesHtml = `
      <div class="actor-alt-matches artist-alt-matches ${characterPlayed ? 'is-character-matches' : ''}">
        <span class="alt-matches-label">${listLabel}</span>
        <div class="alt-matches-scroll">
          ${matches.map(m => `
            <button type="button" class="alt-match-btn ${m.id === artist.id ? 'active' : ''}" onclick="fetchArtistDetailsById(${m.id}, '${escapeHtml(characterPlayed || '').replace(/'/g, "\\'")}')">
              ${escapeHtml(m.name)}
              ${m.characterPlayed ? `<span class="alt-match-sub">(as ${escapeHtml(m.characterPlayed)})</span>` : (m.knownFor && m.knownFor.length ? `<span class="alt-match-sub">(${escapeHtml(m.knownFor[0])})</span>` : '')}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  } else if (matches && matches.length === 1 && characterPlayed) {
    matchesHtml = `
      <div class="actor-alt-matches artist-alt-matches is-character-matches">
        <span class="alt-matches-label">PORTRAYED BY:</span>
        <div class="alt-matches-scroll">
          <button type="button" class="alt-match-btn active">
            ${escapeHtml(artist.name)}
            <span class="alt-match-sub">(as ${escapeHtml(characterPlayed)})</span>
          </button>
        </div>
      </div>
    `;
  }

  // Google Knowledge data
  const googleData = artist.google || {};
  const googleDesc = googleData.description || 'Film & Television Artist';
  const googleExtract = googleData.extract || artist.biography || '';
  const truncatedExtract = googleExtract.length > 320 ? googleExtract.slice(0, 320) + '...' : googleExtract;

  const googleSearchUrl = googleData.searchUrl || `https://www.google.com/search?q=${encodeURIComponent(artist.name + ' artist')}`;
  const googleNewsUrl = googleData.newsUrl || `https://www.google.com/search?q=${encodeURIComponent(artist.name + ' artist')}&tbm=nws`;
  const imdbUrl = artist.external?.imdbUrl;
  const tmdbUrl = artist.external?.tmdbUrl;

  const html = `
    <div class="actor-profile-card artist-profile-card retro-box">
      ${characterBannerHtml}
      ${typoHtml}
      ${matchesHtml}
      <div class="actor-profile-layout artist-profile-layout">
        <div class="actor-avatar-col artist-avatar-col">
          <div class="actor-avatar-frame artist-avatar-frame">
            <img src="${artist.profile || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500'}" 
                 alt="${escapeHtml(artist.name)}" class="actor-avatar-img artist-avatar-img" loading="eager" />
          </div>
          <div class="actor-stat-pill artist-stat-pill">
            <span class="material-symbols-outlined" style="font-size: 15px;">movie</span>
            <span>${totalCredits} CREDITS</span>
          </div>
        </div>

        <div class="actor-info-col artist-info-col">
          <div class="actor-header-line">
            <div class="actor-identity artist-identity">
              <h1 class="actor-name artist-name scramble-text">${escapeHtml(artist.name)}</h1>
              <div class="actor-subtitle-row artist-subtitle-row">
                <span class="actor-badge artist-badge google-badge">
                  <svg width="12" height="12" viewBox="0 0 24 24" style="vertical-align: middle; margin-right: 4px;">
                    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"/>
                    <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                  </svg>
                  GOOGLE KNOWLEDGE
                </span>
                <span class="actor-badge artist-badge tmdb-badge">TMDB VERIFIED</span>
                <span class="actor-occupation artist-occupation">${escapeHtml(googleDesc)}</span>
              </div>
            </div>
          </div>

          <!-- Metadata details -->
          <div class="actor-meta-grid artist-meta-grid">
            ${artist.age ? `
              <div class="actor-meta-item artist-meta-item">
                <span class="meta-label">BORN:</span>
                <span class="meta-value">${escapeHtml(artist.birthday || 'N/A')} (${artist.age} yrs${artist.deathday ? ' • deceased' : ''})</span>
              </div>` : ''}
            ${artist.placeOfBirth ? `
              <div class="actor-meta-item artist-meta-item">
                <span class="meta-label">BIRTHPLACE:</span>
                <span class="meta-value">${escapeHtml(artist.placeOfBirth)}</span>
              </div>` : ''}
            <div class="actor-meta-item artist-meta-item">
              <span class="meta-label">KNOWN FOR:</span>
              <span class="meta-value">${escapeHtml(artist.knownForDepartment || 'Performing Arts')}</span>
            </div>
          </div>

          <!-- Bio / Google Knowledge Summary -->
          <div class="actor-bio-box artist-bio-box">
            <p class="actor-bio-text artist-bio-text" id="artistBioText">${escapeHtml(truncatedExtract)}</p>
            ${googleExtract.length > 320 ? `
              <button type="button" class="actor-bio-more-btn artist-bio-more-btn" id="btnToggleBio">READ MORE ▼</button>
            ` : ''}
          </div>

          <!-- Google & External Action Links -->
          <div class="actor-links-row artist-links-row">
            <a href="${googleSearchUrl}" target="_blank" rel="noopener noreferrer" class="retro-btn actor-external-btn artist-external-btn google-btn-link" title="Explore on Google">
              <span class="material-symbols-outlined" style="font-size: 16px;">search</span>
              <span>GOOGLE SEARCH</span>
            </a>
            <a href="${googleNewsUrl}" target="_blank" rel="noopener noreferrer" class="retro-btn actor-external-btn artist-external-btn" title="Latest Artist News on Google">
              <span class="material-symbols-outlined" style="font-size: 16px;">newspaper</span>
              <span>GOOGLE NEWS</span>
            </a>
            ${imdbUrl ? `
              <a href="${imdbUrl}" target="_blank" rel="noopener noreferrer" class="retro-btn actor-external-btn artist-external-btn imdb-btn-link" title="View IMDb Profile">
                <span>IMDb ↗</span>
              </a>
            ` : ''}
            ${tmdbUrl ? `
              <a href="${tmdbUrl}" target="_blank" rel="noopener noreferrer" class="retro-btn actor-external-btn artist-external-btn tmdb-btn-link" title="View TMDB Page">
                <span>TMDB ↗</span>
              </a>
            ` : ''}
          </div>
        </div>
      </div>
    </div>

    <!-- Filmography Filter & Header -->
    <div class="filmography-toolbar">
      <div class="filmography-tabs">
        <button type="button" class="filmo-tab active" data-filter="all">ALL WORKS (${totalCredits})</button>
        <button type="button" class="filmo-tab" data-filter="movie">MOVIES (${movieCredits.length})</button>
        <button type="button" class="filmo-tab" data-filter="tv">TV SHOWS (${tvCredits.length})</button>
      </div>

      <div class="filmography-sort-wrapper">
        <label for="artistFilmoSort" class="filmo-sort-label">SORT:</label>
        <select id="artistFilmoSort" class="styled-select filmo-sort-select">
          <option value="popularity">Most Popular</option>
          <option value="rating">Highest Rated</option>
          <option value="newest">Newest Releases</option>
          <option value="oldest">Oldest Releases</option>
        </select>
      </div>
    </div>

    <!-- Filmography Grid -->
    <div id="artistFilmographyGrid" class="movie-grid actor-filmography-grid artist-filmography-grid"></div>
  `;

  elements.directSearchResults.innerHTML = html;

  // Bio toggle
  const bioToggle = document.getElementById('btnToggleBio');
  const bioText = document.getElementById('artistBioText') || document.getElementById('actorBioText');
  let expanded = false;
  if (bioToggle && bioText) {
    bioToggle.addEventListener('click', () => {
      expanded = !expanded;
      if (expanded) {
        bioText.textContent = googleExtract;
        bioToggle.textContent = 'SHOW LESS ▲';
      } else {
        bioText.textContent = truncatedExtract;
        bioToggle.textContent = 'READ MORE ▼';
      }
    });
  }

  // Render initial filmography cards
  renderFilmographyCards(artist.credits || [], 'all', 'popularity', characterPlayed);

  // Filter tabs listeners
  const tabs = elements.directSearchResults.querySelectorAll('.filmo-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const sortSelect = document.getElementById('artistFilmoSort') || document.getElementById('actorFilmoSort');
      const sortVal = sortSelect?.value || 'popularity';
      renderFilmographyCards(artist.credits || [], tab.dataset.filter, sortVal, characterPlayed);
    });
  });

  // Sort listener
  const sortSelect = document.getElementById('artistFilmoSort') || document.getElementById('actorFilmoSort');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      const activeFilter = elements.directSearchResults.querySelector('.filmo-tab.active')?.dataset.filter || 'all';
      renderFilmographyCards(artist.credits || [], activeFilter, sortSelect.value, characterPlayed);
    });
  }
}
window.renderArtistFilmography = renderArtistFilmography;
window.renderActorFilmography = renderArtistFilmography;

async function performDirectSearch(query, minSeeds = 0, category = '200') {
  const cleanQuery = (query || '').trim();
  if (!cleanQuery) {
    showToast('Please enter an artist name', 'error');
    return;
  }

  if (elements.directSearchResults) {
    elements.directSearchResults.innerHTML = `
      <div class="actor-search-loading artist-search-loading retro-box">
        <div class="actor-loading-spinner artist-loading-spinner"></div>
        <div class="actor-loading-text artist-loading-text scramble-text">SEARCHING GOOGLE & TMDB FOR "${escapeHtml(cleanQuery.toUpperCase())}"...</div>
      </div>
    `;
  }

  try {
    const res = await fetch(`/api/artist?q=${encodeURIComponent(cleanQuery)}`);
    const data = await res.json();
    const artistData = data.artist || data.actor;

    if (data.success && artistData) {
      state.currentArtist = artistData;
      state.currentActor = artistData;
      state.artistMatches = data.matches || [];
      state.actorMatches = data.matches || [];
      renderArtistFilmography(artistData, data.matches || [], cleanQuery);
      if (elements.directSearchResults) {
        elements.directSearchResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      if (artistData.characterPlayed) {
        showToast(`Character match: ${artistData.name} as ${artistData.characterPlayed} 🎭`, 'success');
      } else if (data.correctedQuery || (artistData.name && artistData.name.toLowerCase() !== cleanQuery.toLowerCase())) {
        showToast(`Tolerated spelling mistake: showing ${artistData.name} 🎬`, 'success');
      } else {
        showToast(`Found filmography for ${artistData.name} 🎬`, 'success');
      }
    } else {
      // Empty state with suggestions and direct torrent fallback
      if (elements.directSearchResults) {
        elements.directSearchResults.innerHTML = `
          <div class="actor-empty-state artist-empty-state retro-box">
            <span class="material-symbols-outlined" style="font-size: 48px; margin-bottom: 12px; opacity: 0.7;">person_off</span>
            <h3 class="scramble-text" style="font-size: 1.4rem; margin-bottom: 8px;">NO ARTIST FOUND MATCHING "${escapeHtml(cleanQuery)}"</h3>
            <p style="font-family: var(--font-mono); font-size: 13px; max-width: 500px; margin: 0 auto 20px auto; opacity: 0.85;">
              We couldn't find an artist matching that name. Check spelling or try one of the popular artists below.
            </p>
            <div class="actor-chips-row artist-chips-row" style="justify-content: center; margin-bottom: 24px;">
              <button type="button" class="actor-chip artist-chip" onclick="performDirectSearch('Cillian Murphy')">Cillian Murphy</button>
              <button type="button" class="actor-chip artist-chip" onclick="performDirectSearch('Keanu Reeves')">Keanu Reeves</button>
              <button type="button" class="actor-chip artist-chip" onclick="performDirectSearch('Zendaya')">Zendaya</button>
              <button type="button" class="actor-chip artist-chip" onclick="performDirectSearch('Pedro Pascal')">Pedro Pascal</button>
            </div>
            <div style="border-top: 1.5px dashed #000; padding-top: 16px; margin-top: 10px;">
              <span style="font-family: var(--font-mono); font-size: 12px; margin-right: 12px;">Looking for raw torrent releases instead?</span>
              <button type="button" class="retro-btn" style="padding: 6px 14px; font-size: 12px;" onclick="searchRawTorrentsFallback('${escapeHtml(cleanQuery).replace(/'/g, "\\'")}')">
                <span class="material-symbols-outlined" style="font-size: 14px; vertical-align: middle;">search</span>
                <span>SEARCH RELEASES ON CINE BAY</span>
              </button>
            </div>
          </div>
        `;
      }
      showToast('No matching artist found', 'info');
    }
  } catch (err) {
    if (elements.directSearchResults) {
      elements.directSearchResults.innerHTML = `
        <div class="actor-empty-state artist-empty-state retro-box">
          <span class="material-symbols-outlined" style="font-size: 40px; color: #ff3333; margin-bottom: 10px;">error</span>
          <h3 style="margin-bottom: 8px;">Failed to execute artist search</h3>
          <p style="font-family: var(--font-mono); font-size: 12px; opacity: 0.8;">Network error or server unavailable. Please try again.</p>
        </div>
      `;
    }
    showToast('Search encountered an error', 'error');
  }
}

// Fallback search for raw torrent releases if user queries a direct filename
window.searchRawTorrentsFallback = async function (query) {
  if (!elements.directSearchResults) return;
  elements.directSearchResults.innerHTML = getTorrentLoadingHtml(
    `SEARCHING THE CINE BAY FOR "${(query || '').toUpperCase()}"...`,
    'Connecting to DHT indexer and querying raw torrent releases...'
  );
  if (window.initScrambler) initScrambler();

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&minSeeds=0&category=200`);
    const data = await res.json();
    if (data.success && data.torrents && data.torrents.length > 0) {
      elements.directSearchResults.innerHTML = `
        <div class="direct-torrent-filter-bar torrent-filter-bar"></div>
        <div class="torrent-list-header" style="display:flex; margin-bottom:10px;">
          <span>Release</span>
          <span>Quality</span>
          <span>Seeds/Peers</span>
          <span>Size</span>
          <span>Action</span>
        </div>
        <div class="direct-torrent-list"></div>
      `;
      const filterBar = elements.directSearchResults.querySelector('.direct-torrent-filter-bar');
      const listContainer = elements.directSearchResults.querySelector('.direct-torrent-list');
      if (filterBar && listContainer) {
        renderTorrentFilterBar(filterBar, data.torrents, (filteredTorrents) => {
          if (filteredTorrents.length === 0) {
            listContainer.innerHTML = `
              <div class="torrent-empty-state retro-box" style="padding: 20px 14px; margin: 8px auto;">
                <div style="font-family: var(--font-mono); font-size: 13px; font-weight: 700;">No releases matching selected filters.</div>
              </div>
            `;
          } else {
            renderTorrentRows(listContainer, filteredTorrents, query, { title: query }, false);
          }
        });
      }
      renderTorrentRows(listContainer, data.torrents, query, { title: query }, false);
    } else {
      elements.directSearchResults.innerHTML = `
        <div class="torrent-empty-state retro-box">
          <span class="material-symbols-outlined" style="font-size: 32px; opacity: 0.7; margin-bottom: 6px;">search_off</span>
          <div style="font-family: var(--font-mono); font-size: 13px;">No torrents found for "${escapeHtml(query)}".</div>
          <button type="button" class="btn-try-again" id="directRetryBtn">
            <span class="material-symbols-outlined">refresh</span>
            <span>TRY AGAIN</span>
          </button>
        </div>
      `;
      const retryBtn = elements.directSearchResults.querySelector('#directRetryBtn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => performDirectSearch(query));
      }
    }
  } catch (e) {
    elements.directSearchResults.innerHTML = `
      <div class="torrent-empty-state retro-box error">
        <div style="font-family: var(--font-mono); font-size: 13px; color: #ff3333;">Failed to load torrent releases.</div>
        <button type="button" class="btn-try-again" id="directErrorRetryBtn">
          <span class="material-symbols-outlined">refresh</span>
          <span>TRY AGAIN</span>
        </button>
      </div>
    `;
    const retryBtn = elements.directSearchResults.querySelector('#directErrorRetryBtn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => performDirectSearch(query));
    }
  }
};

function handleQuickMoodSelect(mood) {
  initQuiz();
  if (mood === 'action') {
    quizAnswers.mood = 'happy';
    quizAnswers.occasion = 'solo';
    quizAnswers.genres = ['Action', 'Thriller', 'Science Fiction'];
    quizAnswers.mediaPreference = 'movies';
    quizAnswers.recency = 'any';
    submitQuiz();
  } else if (mood === 'chill') {
    quizAnswers.mood = 'happy';
    quizAnswers.occasion = 'date';
    quizAnswers.genres = ['Romance', 'Comedy'];
    quizAnswers.mediaPreference = 'movies';
    quizAnswers.recency = 'any';
    submitQuiz();
  } else if (mood === 'horror') {
    quizAnswers.mood = 'neutral';
    quizAnswers.occasion = 'solo';
    quizAnswers.genres = ['Horror'];
    quizAnswers.moodPreset = 'horror';
    quizAnswers.mediaPreference = 'movies';
    quizAnswers.recency = 'any';
    submitQuiz();
  } else if (mood === 'mind') {
    quizAnswers.mood = 'neutral';
    quizAnswers.occasion = 'solo';
    quizAnswers.genres = ['Mystery', 'Psychological', 'Thriller'];
    quizAnswers.moodPreset = 'mind';
    quizAnswers.isMindBender = true;
    quizAnswers.mediaPreference = 'movies';
    quizAnswers.recency = 'any';
    submitQuiz();
  } else if (mood === 'top') {
    quizAnswers.recency = 'any';
    quizAnswers.mood = 'neutral';
    quizAnswers.genres = ['Drama', 'Crime', 'History'];
    quizAnswers.mediaPreference = 'movies';
    submitQuiz();
  }
}

function switchTab(tabId) {
  if (tabId === 'settings-view') {
    tabId = 'profile-view';
  }

  // Redirect legacy tv-view tab switch to movies-view with TV filter
  if (tabId === 'tv-view') {
    tabId = 'movies-view';
    if (elements.movieTypeSelect) {
      elements.movieTypeSelect.value = 'tv';
      loadMovies();
    }
  }

  if (state.activeTab !== tabId) {
    if (state.activeTab !== 'profile-view' && state.activeTab !== 'settings-view' && state.activeTab !== 'tutorial-view') {
      state.previousTab = state.activeTab;
      if (state.activeTab === 'movies-view' || state.activeTab === 'anime-view' || state.activeTab === 'tv-view' || state.activeTab === 'directSearchSection') {
        state.lastFeedTab = state.activeTab;
      }
    }
  }

  state.activeTab = tabId;
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  document.querySelectorAll('.mobile-nav-item').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  document.querySelectorAll('.view-panel').forEach(v => v.classList.toggle('hidden', v.id !== tabId));

  const profileBtn = document.getElementById('header-profile-btn');
  if (profileBtn) {
    profileBtn.classList.toggle('active', tabId === 'profile-view');
  }
  const settingsBtn = document.getElementById('header-settings-btn');
  if (settingsBtn) {
    settingsBtn.classList.toggle('active', tabId === 'profile-view');
  }
  const tutorialBtn = document.getElementById('header-tutorial-btn');
  if (tutorialBtn) {
    tutorialBtn.classList.toggle('active', tabId === 'tutorial-view');
  }

  const tutorialBackBtn = document.getElementById('tutorial-back-feed-btn');
  if (tutorialBackBtn) {
    const span = tutorialBackBtn.querySelector('span');
    if (state.isSharedPage) {
      if (span) span.textContent = 'BACK TO SHARED';
      tutorialBackBtn.title = 'Return to Shared Movie';
    } else {
      if (span) span.textContent = 'BACK TO MOVIE FEED';
      tutorialBackBtn.title = 'Return to Movie Feed';
    }
  }

  const siteHeader = document.querySelector('.site-header');
  const mobileNav = document.getElementById('mobileBottomNav');
  const isShared = state.isSharedPage || tabId === 'share-view';
  document.body.classList.toggle('shared-mode', isShared);
  if (siteHeader) {
    if (tabId === 'tutorial-view' || tabId === 'auth-view' || isShared) {
      siteHeader.classList.add('hidden');
      if (mobileNav) mobileNav.classList.add('hidden');
      if (elements.mainNav) elements.mainNav.style.display = 'none';
    } else {
      siteHeader.classList.remove('hidden');
      if (mobileNav) mobileNav.classList.remove('hidden');
      if (elements.mainNav) elements.mainNav.style.display = 'flex';
    }
  }

  if (tabId === 'movies-view' && state.movies.length === 0) loadMovies();
  else if (tabId === 'anime-view' && (!state.anime || state.anime.length === 0)) loadAnime();
  else if (tabId === 'tv-view' && state.tvShows.length === 0) loadTVShows();
  else if (tabId === 'profile-view') {
    renderProfileView();
    loadWatchlist();
    loadCustomLists();
    loadDiaryEntries();
    loadSettingsIntoUI();
  }

  if (fluidInstance && typeof fluidInstance.pause === 'function') {
    const canvas = document.getElementById('fluid-canvas');
    if (tabId === 'tutorial-view') {
      fluidInstance.pause();
      if (canvas) canvas.style.opacity = '0';
    } else {
      if (!document.hidden) fluidInstance.resume();
      if (canvas) canvas.style.opacity = '1';
    }
  }
}

function updateTypoBanner(bannerId, rawQuery, correctedQuery) {
  const banner = document.getElementById(bannerId);
  if (!banner) return;
  const raw = (rawQuery || '').trim();
  const corr = (correctedQuery || '').trim();

  if (corr && raw && corr.toLowerCase() !== raw.toLowerCase()) {
    banner.innerHTML = `
      <div class="typo-banner-flex">
        <span class="material-symbols-outlined typo-banner-icon">auto_fix_high</span>
        <div class="typo-banner-msg">
          <span>Showing results for <strong>"${escapeHtml(corr)}"</strong></span>
          <span class="typo-banner-orig">(spelling mistake tolerated from "<em>${escapeHtml(raw)}</em>")</span>
        </div>
      </div>
    `;
    banner.classList.remove('hidden');
  } else {
    banner.innerHTML = '';
    banner.classList.add('hidden');
  }
}

async function loadMovies() {
  const search = (elements.movieSearchInput ? elements.movieSearchInput.value : '').trim();
  const category = elements.movieCategorySelect ? elements.movieCategorySelect.value : 'all';
  const type = elements.movieTypeSelect ? elements.movieTypeSelect.value : 'all';
  const year = elements.movieYearSelect ? elements.movieYearSelect.value : 'all';
  try {
    const res = await fetch(`/api/movies?search=${encodeURIComponent(search)}&category=${category}&type=${type}&year=${encodeURIComponent(year)}`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    if (data.success) {
      state.movies = data.movies || data.media || [];
      renderMediaGrid(elements.movieGrid, state.movies, type === 'all' ? 'movie' : type);
      updateTypoBanner('movieTypoBanner', search, data.correctedQuery);
      if (state.movies.length === 0 && elements.movieGrid) {
        elements.movieGrid.innerHTML = `
          <div class="empty-state-box" style="grid-column: 1 / -1; text-align: center; padding: 48px 16px; font-family: var(--font-mono); color: var(--retro-fg);">
            <span class="material-symbols-outlined" style="font-size: 36px; opacity: 0.7;">movie_off</span>
            <div style="margin-top: 12px; font-weight: 700;">NO TITLES FOUND</div>
            <div style="margin-top: 6px; font-size: 13px; opacity: 0.75;">Try another search or select a different category or year.</div>
          </div>
        `;
      }
    }
  } catch (err) {
    console.error('Error loading movies:', err);
    if (elements.movieGrid) {
      elements.movieGrid.innerHTML = `
        <div class="feed-error-box" style="grid-column: 1 / -1; text-align: center; padding: 48px 16px; font-family: var(--font-mono); color: var(--retro-fg);">
          <span class="material-symbols-outlined" style="font-size: 36px; color: var(--retro-accent);">error</span>
          <div style="margin-top: 12px; font-weight: 700;">COULD NOT LOAD TITLES</div>
          <div style="margin-top: 6px; font-size: 13px; opacity: 0.75;">${escapeHtml(err.message || 'Network error')}</div>
          <button type="button" class="retro-btn" style="margin-top: 16px; padding: 6px 14px;" onclick="loadMovies()">RETRY</button>
        </div>
      `;
    }
  }
}

async function loadAnime() {
  if (!elements.animeGrid) return;
  if (!state.anime || state.anime.length === 0) {
    elements.animeGrid.innerHTML = `
      <div class="feed-loading-box" style="grid-column: 1 / -1; text-align: center; padding: 48px 16px; font-family: var(--font-mono); color: var(--retro-fg);">
        <span class="material-symbols-outlined" style="font-size: 36px; animation: spin 1s linear infinite;">progress_activity</span>
        <div style="margin-top: 12px; font-weight: 700; letter-spacing: 1px;">LOADING ANIME CATALOG...</div>
      </div>
    `;
  }
  const search = (elements.animeSearchInput ? elements.animeSearchInput.value : '').trim();
  const category = elements.animeCategorySelect ? elements.animeCategorySelect.value : 'all';
  const type = elements.animeTypeSelect ? elements.animeTypeSelect.value : 'all';
  const year = elements.animeYearSelect ? elements.animeYearSelect.value : 'all';
  try {
    const res = await fetch(`/api/anime?search=${encodeURIComponent(search)}&category=${category}&type=${type}&year=${encodeURIComponent(year)}`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    if (data.success) {
      state.anime = data.anime || [];
      renderMediaGrid(elements.animeGrid, state.anime, type === 'all' ? 'tv' : type);
      updateTypoBanner('animeTypoBanner', search, data.correctedQuery);
      if (state.anime.length === 0) {
        elements.animeGrid.innerHTML = `
          <div class="empty-state-box" style="grid-column: 1 / -1; text-align: center; padding: 48px 16px; font-family: var(--font-mono); color: var(--retro-fg);">
            <span class="material-symbols-outlined" style="font-size: 36px; opacity: 0.7;">movie_off</span>
            <div style="margin-top: 12px; font-weight: 700;">NO ANIME TITLES FOUND</div>
            <div style="margin-top: 6px; font-size: 13px; opacity: 0.75;">Try another search or select a different category.</div>
          </div>
        `;
      }
    }
  } catch (err) {
    console.error('Error loading anime:', err);
    elements.animeGrid.innerHTML = `
      <div class="feed-error-box" style="grid-column: 1 / -1; text-align: center; padding: 48px 16px; font-family: var(--font-mono); color: var(--retro-fg);">
        <span class="material-symbols-outlined" style="font-size: 36px; color: var(--retro-accent);">error</span>
        <div style="margin-top: 12px; font-weight: 700;">COULD NOT LOAD ANIME</div>
        <div style="margin-top: 6px; font-size: 13px; opacity: 0.75;">${escapeHtml(err.message)}</div>
        <button type="button" class="retro-btn" style="margin-top: 16px; padding: 6px 14px;" onclick="loadAnime()">RETRY</button>
      </div>
    `;
  }
}

async function loadTVShows() {
  const search = elements.tvSearchInput.value.trim();
  const category = elements.tvCategorySelect.value;
  try {
    const res = await fetch(`/api/tv?search=${encodeURIComponent(search)}&category=${category}`);
    const data = await res.json();
    if (data.success) {
      state.tvShows = data.shows;
      renderMediaGrid(elements.tvGrid, data.shows, 'tv');
      updateTypoBanner('tvTypoBanner', search, data.correctedQuery);
    }
  } catch (err) { }
}

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.success) {
      state.settings = data.settings;
    }
  } catch (err) { }
}

async function loadSettingsIntoUI() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.success && data.settings) {
      state.settings = data.settings;
      const elKey = document.getElementById('tmdbApiKey');
      if (elKey) elKey.value = state.settings.tmdbApiKey || '';
      const elToken = document.getElementById('tmdbReadToken');
      if (elToken) elToken.value = state.settings.tmdbReadToken || '';
      const elRating = document.getElementById('minRating');
      if (elRating) elRating.value = state.settings.minRating || 7.0;
      const elSeeds = document.getElementById('minSeeds');
      if (elSeeds) elSeeds.value = state.settings.minSeeds || 5;
      const elMagnets = document.getElementById('autoOpenMagnets');
      if (elMagnets) elMagnets.checked = !!state.settings.autoOpenMagnets;
    }
  } catch (err) {
    // Suppress popup: configuration form has been intentionally removed from profile UI
  }
}

async function saveSettings(e) {
  e.preventDefault();
  const btn = document.querySelector('.submit-settings-btn');
  const originalText = btn ? btn.innerText : 'SAVE';
  if (btn) btn.innerText = 'SAVING...';

  const elKey = document.getElementById('tmdbApiKey');
  const elToken = document.getElementById('tmdbReadToken');
  const elRating = document.getElementById('minRating');
  const elSeeds = document.getElementById('minSeeds');
  const elMagnets = document.getElementById('autoOpenMagnets');

  const payload = {
    tmdbApiKey: elKey ? elKey.value : (state.settings?.tmdbApiKey || ''),
    tmdbReadToken: elToken ? elToken.value : (state.settings?.tmdbReadToken || ''),
    minRating: elRating ? (parseFloat(elRating.value) || 7.0) : (state.settings?.minRating || 7.0),
    minSeeds: elSeeds ? (parseInt(elSeeds.value, 10) || 5) : (state.settings?.minSeeds || 5),
    autoOpenMagnets: elMagnets ? elMagnets.checked : !!state.settings?.autoOpenMagnets
  };

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      state.settings = data.settings;
      showToast('Configuration Saved Successfully', 'success');
    } else {
      showToast('Error saving configuration', 'error');
    }
  } catch (err) {
    showToast('Network error saving configuration', 'error');
  } finally {
    if (btn) btn.innerText = originalText;
  }
}

function renderMediaGrid(container, items, type) {
  if (!container) return;
  const now = new Date();
  container.innerHTML = (items || []).map((m, idx) => {
    let unreleasedHtml = '';
    if (m.releaseDate) {
      const rDate = new Date(m.releaseDate);
      if (rDate > now) {
        unreleasedHtml = '<div class="unreleased-badge">UNRELEASED</div>';
      }
    }
    const itemType = m.mediaType || type || 'movie';
    const typeLabel = m.isAnime ? (itemType === 'tv' ? 'ANIME SERIES' : 'ANIME MOVIE') : (itemType === 'tv' ? 'TV' : 'MOVIE');
    const typeBadge = `<div class="media-type-badge badge-${itemType} ${itemType}">${typeLabel}</div>`;
    const safeTitle = escapeHtml(m.title);
    const safeYear = escapeHtml(m.year);
    const safePoster = escapeHtml(m.poster || 'images/hero.webp');
    return `
      <div class="movie-card" data-idx="${idx}">
        ${unreleasedHtml}
        ${typeBadge}
        <img src="${safePoster}" alt="${safeTitle}" onerror="this.src='images/hero.webp'">
        <h3>${safeTitle} (${safeYear})</h3>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.movie-card').forEach(card => {
    card.addEventListener('click', () => {
      const idx = card.dataset.idx;
      const selectedItem = (items || [])[idx];
      if (selectedItem) {
        const itemType = selectedItem.mediaType || type || 'movie';
        openDetailView(selectedItem, itemType);
      }
    });
  });
}

function openDetailView(m, type, isDiagnostic = false) {
  if (state.activeTab !== 'detail-view') {
    state.lastFeedTab = state.activeTab;
  }

  const effectiveType = m?.mediaType || type || 'movie';

  if (!isDiagnostic) {
    const diagnosticNav = document.getElementById('diagnosticNav');
    if (diagnosticNav) diagnosticNav.style.display = 'none';
  }

  elements.detailPoster.src = m.poster || 'images/hero.webp';
  elements.detailPoster.onerror = () => { elements.detailPoster.src = 'images/hero.webp'; };
  elements.detailTitle.innerText = m.title;
  elements.detailTitle.dataset.text = m.title;
  elements.detailMeta.innerText = `★ ${m.rating} / 10  •  ${m.year}  •  ${effectiveType.toUpperCase()}`;
  elements.detailSynopsis.innerText = m.synopsis || 'No synopsis available.';

  elements.detailTorrentsBtn.onclick = () => openTorrentModal(m, effectiveType, false);
  elements.detailTrailerBtn.onclick = () => playTrailer(m.id, effectiveType, m.title, m.year);
  elements.detailShareBtn.onclick = () => openTorrentModal(m, effectiveType, true);

  state.currentDetailMedia = { ...m, mediaType: effectiveType };
  const detailSeparateBtn = document.getElementById('detailSeparateSeasonsBtn');
  if (detailSeparateBtn) {
    detailSeparateBtn.style.display = effectiveType === 'tv' ? 'inline-flex' : 'none';
  }

  // Detail Actions: Watched, Watch Later, Add to List
  updateDetailButtons(m);
  const detailWatchedBtn = document.getElementById('detailWatchedBtn');
  if (detailWatchedBtn) {
    detailWatchedBtn.onclick = () => handleDetailWatched(m, effectiveType);
  }
  const detailWlBtn = document.getElementById('detailWatchlistBtn');
  if (detailWlBtn) {
    detailWlBtn.onclick = () => handleDetailWatchLater(m, effectiveType);
  }
  const detailAddToListBtn = document.getElementById('detailAddToListBtn');
  if (detailAddToListBtn) {
    detailAddToListBtn.onclick = () => handleDetailAddToList(m, effectiveType);
  }
  const detailGalleryBtn = document.getElementById('detailGalleryBtn');
  if (detailGalleryBtn) {
    detailGalleryBtn.onclick = async () => {
      if (state.currentGallery && state.currentGallery.frames && state.currentGallery.frames.length > 0) {
        openFrameLightbox(0);
      } else {
        showToast('Loading gallery frames...', 'info');
        await loadDetailGallery(m, effectiveType);
        if (state.currentGallery && state.currentGallery.frames && state.currentGallery.frames.length > 0) {
          openFrameLightbox(0);
        } else {
          showToast('No scene frames available for this title.', 'info');
        }
      }
    };
  }

  // Load cast members below synopsis
  loadDetailCast(m, effectiveType);
  loadDetailGallery(m, effectiveType);

  switchTab('detail-view');
  window.scrollTo(0, 0);

  // Load similar media
  loadSimilarMedia(m.id, effectiveType);
}

async function loadDetailCast(m, type) {
  const castSection = document.getElementById('detailCastSection');
  const castList = document.getElementById('detailCastList');
  const castNav = document.getElementById('detailCastNav');
  if (!castSection || !castList) return;

  const currentId = m.id;
  state.currentDetailId = currentId;
  const mediaType = (type || m.mediaType || 'movie').toLowerCase();

  castSection.style.display = 'block';
  if (castNav) castNav.style.display = 'none';
  castList.innerHTML = '<div class="detail-cast-loading">Loading cast members...</div>';

  try {
    const fetchId = m.tmdbId || m.id;
    const res = await fetch(`/api/details?id=${fetchId}&type=${mediaType}&title=${encodeURIComponent(m.title)}&year=${m.year || ''}`);
    const data = await res.json();
    
    // Check if another movie was opened while this was fetching
    if (state.currentDetailId !== currentId) return;

    const cast = data?.details?.cast || [];
    const countBadge = document.getElementById('detailCastCount');
    if (countBadge) {
      countBadge.textContent = cast.length > 0 ? `(${cast.length} MEMBERS)` : '';
    }

    if (cast && cast.length > 0) {
      castList.innerHTML = cast.map(c => {
        const safeName = escapeHtml(c.name || 'Performer');
        const safeCharacter = c.character ? escapeHtml(c.character) : '';
        const avatarHtml = c.profile
          ? `<img src="${c.profile}" alt="${safeName}" class="detail-cast-avatar" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'cast-avatar-fallback\\'><span class=\\'material-symbols-outlined\\'>person</span></div>';" />`
          : `<div class="cast-avatar-fallback"><span class="material-symbols-outlined">person</span></div>`;

        return `
          <div class="detail-cast-card" data-actor-id="${c.id}" data-actor-name="${safeName}" role="button" tabindex="0" title="View ${safeName} filmography">
            <div class="detail-cast-avatar-wrap">
              ${avatarHtml}
            </div>
            <div class="detail-cast-meta">
              <div class="detail-cast-name">${safeName}</div>
              ${safeCharacter ? `<div class="detail-cast-character" title="${safeCharacter}">${safeCharacter}</div>` : ''}
            </div>
          </div>
        `;
      }).join('');

      castList.querySelectorAll('.detail-cast-card').forEach(card => {
        const handleCastClick = () => {
          const actorId = card.dataset.actorId;
          const actorName = card.dataset.actorName;
          if (actorId) {
            switchTab('search-view');
            if (elements.directSearchInput) {
              elements.directSearchInput.value = actorName;
            }
            if (typeof window.fetchArtistDetailsById === 'function') {
              window.fetchArtistDetailsById(actorId);
            } else if (typeof performDirectSearch === 'function') {
              performDirectSearch(actorName);
            }
            window.scrollTo(0, 0);
          }
        };
        card.addEventListener('click', handleCastClick);
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleCastClick();
          }
        });
      });

      // Wire scroll navigation buttons
      if (castNav) {
        castNav.style.display = cast.length > 3 ? 'flex' : 'none';
        const btnLeft = document.getElementById('btnCastLeft');
        const btnRight = document.getElementById('btnCastRight');
        if (btnLeft) {
          btnLeft.onclick = () => castList.scrollBy({ left: -260, behavior: 'smooth' });
        }
        if (btnRight) {
          btnRight.onclick = () => castList.scrollBy({ left: 260, behavior: 'smooth' });
        }
      }

      // Add mouse horizontal wheel scroll support
      castList.onwheel = (e) => {
        if (e.deltaY !== 0 && castList.scrollWidth > castList.clientWidth) {
          e.preventDefault();
          castList.scrollLeft += e.deltaY;
        }
      };

      castSection.style.display = 'block';
    } else {
      castList.innerHTML = '<div class="detail-cast-empty">No cast members listed for this title.</div>';
      if (castNav) castNav.style.display = 'none';
      castSection.style.display = 'block';
    }
  } catch (err) {
    console.warn('Failed to load cast for details view:', err);
    if (state.currentDetailId === currentId) {
      castList.innerHTML = '<div class="detail-cast-empty">Cast information currently unavailable.</div>';
      if (castNav) castNav.style.display = 'none';
      castSection.style.display = 'block';
    }
  }
}

async function loadSimilarMedia(id, type) {
  const container = document.getElementById('similarMediaContainer');
  const section = document.getElementById('similarSection');
  if (!container || !section) return;

  section.style.display = 'none';
  container.innerHTML = '<div class="detail-similar-loading">Scanning neural network for related titles...</div>';

  try {
    const res = await fetch(`/api/media/${id}/similar?type=${type}`);
    const data = await res.json();
    if (data.success && data.items && data.items.length > 0) {
      container.innerHTML = data.items.map((m, idx) => {
        const safeTitle = escapeHtml(m.title);
        const safeYear = escapeHtml(m.year);
        const safePoster = escapeHtml(m.poster || 'images/hero.webp');
        const score = m.rating ? parseFloat(m.rating).toFixed(1) : null;
        return `
          <div class="movie-card similar-card" data-idx="${idx}" role="button" tabindex="0" title="${safeTitle} (${safeYear})">
            <div class="similar-card-poster-wrap">
              <img src="${safePoster}" alt="${safeTitle}" onerror="this.src='images/hero.webp'" loading="lazy">
              ${score && score > 0 ? `<span class="similar-card-rating">★ ${score}</span>` : ''}
            </div>
            <div class="similar-card-info">
              <h3 class="similar-card-title">${safeTitle}</h3>
              <span class="similar-card-year">${safeYear}</span>
            </div>
          </div>
        `;
      }).join('');

      container.querySelectorAll('.movie-card').forEach(card => {
        const handleOpen = () => {
          const idx = card.dataset.idx;
          openDetailView(data.items[idx], type);
        };
        card.addEventListener('click', handleOpen);
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleOpen();
          }
        });
      });

      // Enable horizontal mouse wheel scroll support (matching casts section)
      container.onwheel = (e) => {
        if (e.deltaY !== 0 && container.scrollWidth > container.clientWidth) {
          e.preventDefault();
          container.scrollLeft += e.deltaY;
        }
      };

      section.style.display = 'block';
    } else {
      container.innerHTML = '';
      section.style.display = 'none';
    }
  } catch (err) {
    console.error('Failed to load similar media', err);
    container.innerHTML = '';
    section.style.display = 'none';
  }
}

// ==========================================================================
// TORRENT FILTER CARD SYSTEM (MATCHING RELEASES FILTER PILL BAR)
// ==========================================================================
// ==========================================================================
// SCENE FRAMES & MOVIE/SHOW/ANIME GALLERY
// ==========================================================================
state.currentGallery = {
  frames: [],
  currentIndex: 0,
  title: ''
};

async function loadDetailGallery(m, type) {
  const section = document.getElementById('detailGallerySection');
  const strip = document.getElementById('detailGalleryStrip');
  const countBadge = document.getElementById('detailGalleryCountBadge');
  const nav = document.getElementById('detailGalleryNav');

  const currentId = m.id;
  state.currentDetailId = currentId;
  const effectiveType = (type || m.mediaType || 'movie').toLowerCase();

  if (section) section.style.display = 'none';
  if (strip) strip.innerHTML = '<div class="detail-gallery-loading" style="padding:20px; font-family:var(--font-mono); font-size:12px; color:#666;"><span class="material-symbols-outlined spin-icon" style="font-size:16px; vertical-align:middle; margin-right:6px;">sync</span>Scanning reel archives for scene frames...</div>';

  try {
    let frames = [];
    if (m.frames && Array.isArray(m.frames) && m.frames.length > 0) {
      frames = m.frames;
    } else {
      try {
        const res = await fetch(`/api/media/${m.id}/frames?type=${effectiveType}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.success && Array.isArray(data.frames)) {
            frames = data.frames;
          }
        }
      } catch (netErr) {}

      // Resilient fallback to /api/details
      if (frames.length === 0) {
        try {
          const detRes = await fetch(`/api/details?id=${m.id}&type=${effectiveType}&title=${encodeURIComponent(m.title || '')}`);
          if (detRes.ok) {
            const detData = await detRes.json();
            if (detData?.details?.frames && Array.isArray(detData.details.frames)) {
              frames = detData.details.frames;
            }
          }
        } catch (detErr) {}
      }
    }

    if (state.currentDetailId !== currentId) return;
    if (frames.length > 0) {
      state.currentGallery = {
        frames: frames,
        currentIndex: 0,
        title: m.title || 'Scene Frame'
      };

      if (countBadge) {
        countBadge.textContent = `${frames.length} FRAMES`;
      }

      if (strip) strip.innerHTML = frames.map((frame, idx) => {
        const safeTitle = escapeHtml(m.title || 'Frame');
        const resLabel = (frame.width && frame.width >= 3000) ? '4K UHD' : ((frame.width && frame.width >= 1900) ? '1080P' : 'HD');
        return `
          <div class="gallery-frame-card" data-frame-idx="${idx}" role="button" tabindex="0" title="Click to view full-res frame (${idx + 1} of ${frames.length})">
            <img src="${frame.thumbnail}" alt="${safeTitle} Scene Still ${idx + 1}" class="frame-thumb-img" loading="lazy" onerror="this.src='images/hero.webp'" />
            <span class="frame-badge">${resLabel}</span>
            <div class="frame-hover-overlay">
              <span class="frame-zoom-icon">
                <span class="material-symbols-outlined" style="font-size: 20px;">fullscreen</span>
              </span>
            </div>
          </div>
        `;
      }).join('');

      strip.querySelectorAll('.gallery-frame-card').forEach(card => {
        const handleCardClick = () => {
          const idx = parseInt(card.dataset.frameIdx, 10) || 0;
          openFrameLightbox(idx);
        };
        card.addEventListener('click', handleCardClick);
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleCardClick();
          }
        });
      });

      // Horizontal mouse wheel scrolling support
      if (strip) {
        strip.onwheel = (e) => {
          if (e.deltaY !== 0 && strip.scrollWidth > strip.clientWidth) {
            e.preventDefault();
            strip.scrollLeft += e.deltaY;
          }
        };
      }

      // Left/Right navigation buttons
      if (nav) {
        nav.style.display = frames.length > 3 ? 'flex' : 'none';
        const btnLeft = document.getElementById('btnGalleryLeft');
        const btnRight = document.getElementById('btnGalleryRight');
        if (btnLeft) {
          btnLeft.onclick = () => strip.scrollBy({ left: -340, behavior: 'smooth' });
        }
        if (btnRight) {
          btnRight.onclick = () => strip.scrollBy({ left: 340, behavior: 'smooth' });
        }
      }

      if (section) section.style.display = 'block';
    } else {
      if (strip) strip.innerHTML = '';
      if (section) section.style.display = 'none';
    }
  } catch (err) {
    console.error('Failed to load frames gallery', err);
    if (strip) strip.innerHTML = '';
    if (section) section.style.display = 'none';
  }
}

function openFrameLightbox(index) {
  const modal = document.getElementById('frameLightboxModal');
  const img = document.getElementById('lightboxImage');
  const counter = document.getElementById('lightboxCounter');
  const downloadBtn = document.getElementById('lightboxDownloadBtn');
  const mediaTitleEl = document.getElementById('lightboxMediaTitle');
  const resBadge = document.getElementById('lightboxResolution');
  const spinner = document.getElementById('lightboxSpinner');
  if (!modal || !img) return;

  const gallery = state.currentGallery;
  if (!gallery || !gallery.frames || gallery.frames.length === 0) return;

  const safeIndex = Math.max(0, Math.min(index, gallery.frames.length - 1));
  gallery.currentIndex = safeIndex;
  const frame = gallery.frames[safeIndex];

  if (counter) counter.textContent = `FRAME ${safeIndex + 1} OF ${gallery.frames.length}`;
  if (mediaTitleEl) mediaTitleEl.textContent = gallery.title;
  if (resBadge) resBadge.textContent = `${frame.width || 1920}×${frame.height || 1080}`;
  if (downloadBtn) downloadBtn.href = frame.full;

  if (spinner) spinner.classList.remove('hidden');
  img.style.opacity = '0.25';
  img.src = frame.full;
  img.onload = () => {
    img.style.opacity = '1';
    if (spinner) spinner.classList.add('hidden');
  };
  img.onerror = () => {
    img.src = frame.thumbnail;
    img.style.opacity = '1';
    if (spinner) spinner.classList.add('hidden');
  };

  modal.classList.remove('hidden');

  // Wire prev / next looping controls
  const btnPrev = document.getElementById('btnLightboxPrev');
  const btnNext = document.getElementById('btnLightboxNext');
  if (btnPrev) {
    btnPrev.onclick = () => {
      const prevIdx = (gallery.currentIndex - 1 + gallery.frames.length) % gallery.frames.length;
      openFrameLightbox(prevIdx);
    };
  }
  if (btnNext) {
    btnNext.onclick = () => {
      const nextIdx = (gallery.currentIndex + 1) % gallery.frames.length;
      openFrameLightbox(nextIdx);
    };
  }

  // Keyboard navigation
  if (window._lightboxKeyHandler) {
    window.removeEventListener('keydown', window._lightboxKeyHandler);
  }
  window._lightboxKeyHandler = (e) => {
    if (modal.classList.contains('hidden')) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      btnPrev?.click();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      btnNext?.click();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeFrameLightbox();
    }
  };
  window.addEventListener('keydown', window._lightboxKeyHandler);
}

function closeFrameLightbox() {
  const modal = document.getElementById('frameLightboxModal');
  if (modal) modal.classList.add('hidden');
  if (window._lightboxKeyHandler) {
    window.removeEventListener('keydown', window._lightboxKeyHandler);
    window._lightboxKeyHandler = null;
  }
}

const TORRENT_FILTERS = [
  { id: 'all', label: 'All Torrents', type: 'all' },
  { id: 'new', label: 'new', isBadgeBox: true, type: 'status' },
  { id: 'direct', label: 'Direct', type: 'source' },
  { id: 'bluray', label: 'bluray', type: 'source' },
  { id: '720p', label: 'HD (720p)', type: 'resolution' },
  { id: '1080p', label: 'FullHD (1080p)', type: 'resolution' },
  { id: '2160p', label: '4K (2160p)', type: 'resolution' },
  { id: '3d', label: '3D', type: 'resolution' },
  { id: 'xvid', label: 'AVI (XviD)', type: 'format' },
  { id: 'mp4', label: 'MP4', type: 'format' },
  { id: 'hevc', label: 'HEVC (x265)', type: 'codec' },
  { id: 'hdr', label: 'HDR', type: 'dynamicRange' },
  { id: 'sdr', label: 'SDR', type: 'dynamicRange' },
  { id: '6ch', label: '6 Ch', type: 'channels' },
  { id: '8ch', label: '8 Ch', type: 'channels' },
  { id: 'dolby', label: 'Dolby', type: 'audio' },
  { id: 'atmos', label: 'Atmos', type: 'audio' },
  { id: 'dts', label: 'DTS', type: 'audio' },
  { id: 'dtsma', label: 'DTS MA', type: 'audio' },
  { id: 'dtsx', label: 'DTS X', type: 'audio' }
];

function matchTorrentFilter(t, filterId) {
  if (!t) return false;
  const name = (t.name || '').toLowerCase();
  const qBadge = (t.qualityBadge || t.quality || '').toLowerCase();
  const codec = (t.videoCodec || '').toLowerCase();
  const audioCh = String(t.audioChannels || '').toLowerCase();
  const relType = (t.releaseType || '').toLowerCase();
  const source = (t.source || '').toLowerCase();

  switch (filterId) {
    case 'all':
      return true;

    case 'new': {
      if (t.isNew) return true;
      if (t.dateUploadedUnix) {
        const days = (Date.now() - (t.dateUploadedUnix * 1000)) / (1000 * 60 * 60 * 24);
        if (days <= 120) return true;
      }
      if (t.added) {
        const addedDate = new Date(t.added).getTime();
        if (!isNaN(addedDate)) {
          const days = (Date.now() - addedDate) / (1000 * 60 * 60 * 24);
          if (days <= 120) return true;
        }
      }
      return /\b(new|2025|2026)\b/i.test(name);
    }

    case 'direct':
      return Boolean(t.torrentUrl || source.includes('yts') || source.includes('archive'));

    case 'bluray':
      return relType.includes('bluray') || /\b(bluray|bdrip|brrip|blu-ray)\b/i.test(name);

    case '720p':
      return qBadge.includes('720p') || (/\b(720p|hd)\b/i.test(name) && !/\b(1080p|2160p|4k)\b/i.test(name));

    case '1080p':
      return qBadge.includes('1080p') || /\b(1080p|1080i|fhd)\b/i.test(name);

    case '2160p':
      return qBadge.includes('2160p') || /\b(2160p|4k|uhd)\b/i.test(name);

    case '3d':
      return qBadge.includes('3d') || /\b(3d|half-sbs|half-ou|hsbs|hou)\b/i.test(name);

    case 'xvid':
      return /\b(avi|xvid|divx)\b/i.test(name);

    case 'mp4':
      return /\.mp4\b|\bmp4\b/i.test(name) || source.includes('yts');

    case 'hevc':
      return codec.includes('x265') || codec.includes('hevc') || /\b(x265|hevc|h265|h\.265)\b/i.test(name);

    case 'hdr':
      return /\b(hdr|hdr10|hdr10\+|dv|dovi|dolby[\s.]?vision)\b/i.test(name) || (t.bitDepth === '10' && /\b(2160p|4k)\b/i.test(name));

    case 'sdr':
      return /\bsdr\b/i.test(name) || (!matchTorrentFilter(t, 'hdr') && (matchTorrentFilter(t, '1080p') || matchTorrentFilter(t, '720p') || t.bitDepth === '8'));

    case '6ch':
      return audioCh === '5.1' || audioCh.includes('5.1') || audioCh.includes('6') || /\b(5\.1|6ch|dd5\.1|dts5\.1)\b/i.test(name);

    case '8ch':
      return audioCh === '7.1' || audioCh.includes('7.1') || audioCh.includes('8') || /\b(7\.1|8ch|dd7\.1|dts7\.1)\b/i.test(name);

    case 'dolby':
      return /\b(dolby|ddp|dd\+|dd|ac3|eac3|truehd)\b/i.test(name);

    case 'atmos':
      return /\batmos\b/i.test(name);

    case 'dts':
      return /\bdts\b/i.test(name);

    case 'dtsma':
      return /\b(dts[\s.-]?ma|dts[\s.-]?hd[\s.-]?ma|dtsma)\b/i.test(name);

    case 'dtsx':
      return /\b(dts[\s.-]?x|dtsx)\b/i.test(name);

    default:
      return true;
  }
}

function renderTorrentFilterBar(barElement, allTorrents, onFilterChange) {
  if (!barElement) return;
  barElement.innerHTML = '';

  const counts = {};
  TORRENT_FILTERS.forEach(f => {
    if (f.id === 'all') {
      counts[f.id] = (allTorrents || []).length;
    } else {
      counts[f.id] = (allTorrents || []).filter(t => matchTorrentFilter(t, f.id)).length;
    }
  });

  if (!barElement._activeFilters) {
    barElement._activeFilters = new Set();
  }
  const activeFilters = barElement._activeFilters;
  const isAllActive = activeFilters.size === 0;

  TORRENT_FILTERS.forEach(filter => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'torrent-filter-card';
    btn.dataset.filter = filter.id;

    const count = counts[filter.id] || 0;
    btn.title = `${count} release${count === 1 ? '' : 's'} available`;

    if (filter.id === 'all') {
      if (isAllActive) btn.classList.add('active-all');
      btn.innerHTML = `<span class="filter-label">${filter.label}</span>`;
    } else {
      if (activeFilters.has(filter.id)) {
        btn.classList.add('active-tag');
      } else if (count === 0) {
        btn.classList.add('no-matches');
      }

      if (filter.isBadgeBox) {
        btn.innerHTML = `<span class="badge-new-box">${filter.label}</span>`;
      } else {
        btn.innerHTML = `<span class="filter-label">${filter.label}</span>`;
      }
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();

      if (filter.id === 'all') {
        activeFilters.clear();
      } else {
        // Mutually exclusive single-select groups for conflicting attributes
        if (filter.type === 'resolution' || filter.type === 'dynamicRange' || filter.type === 'format') {
          const sameGroup = TORRENT_FILTERS.filter(f => f.type === filter.type).map(f => f.id);
          for (const gId of sameGroup) {
            if (gId !== filter.id) activeFilters.delete(gId);
          }
        }

        if (activeFilters.has(filter.id)) {
          activeFilters.delete(filter.id);
        } else {
          activeFilters.add(filter.id);
        }
      }

      // Re-render the filter bar with updated states
      renderTorrentFilterBar(barElement, allTorrents, onFilterChange);

      // Filter torrents
      let filtered = allTorrents;
      if (activeFilters.size > 0) {
        filtered = allTorrents.filter(t => {
          for (const fId of activeFilters) {
            if (!matchTorrentFilter(t, fId)) return false;
          }
          return true;
        });
      }

      if (typeof onFilterChange === 'function') {
        onFilterChange(filtered, activeFilters);
      }
    });

    barElement.appendChild(btn);
  });

  // Enable mouse wheel horizontal scrolling on desktop
  if (!barElement._wheelAttached) {
    barElement._wheelAttached = true;
    barElement.addEventListener('wheel', (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        barElement.scrollLeft += e.deltaY;
      }
    }, { passive: false });
  }
}

window.TORRENT_FILTERS = TORRENT_FILTERS;
window.matchTorrentFilter = matchTorrentFilter;
window.renderTorrentFilterBar = renderTorrentFilterBar;

function renderTorrentRows(container, torrents, searchTitle, mediaObj = {}, isShareMode = false) {
  if (!container) return;
  if (!torrents || torrents.length === 0) {
    container.innerHTML = `
      <div class="torrent-empty-state retro-box" style="padding:20px 14px; margin: 8px auto;">
        <div style="font-family: var(--font-mono); font-size: 0.88rem; opacity: 0.85;">No torrents found.</div>
        <button type="button" class="btn-try-again rows-retry-btn">
          <span class="material-symbols-outlined">refresh</span>
          <span>TRY AGAIN</span>
        </button>
      </div>
    `;
    const retryBtn = container.querySelector('.rows-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (mediaObj.mediaType === 'tv' && mediaObj.season && mediaObj.episode) {
          container.innerHTML = '';
          toggleEpisodeAccordion(mediaObj.season, mediaObj.episode, mediaObj);
        } else if (searchTitle) {
          fetchTorrentsForModal(searchTitle, mediaObj.mediaType || 'movie', mediaObj, isShareMode);
        }
      });
    }
    return;
  }

  const rowsHtml = torrents.map((t, i) => {
    const safeName = escapeHtml(t.name);
    const safeQuality = escapeHtml(t.qualityBadge || 'HD');
    const safeSeeds = escapeHtml(t.seeders !== undefined ? t.seeders : 0);
    const safePeers = escapeHtml(t.leechers !== undefined ? t.leechers : 0);
    const safeSize = escapeHtml(t.sizeFormatted || (t.size ? `${(t.size / (1024 * 1024 * 1024)).toFixed(2)} GB` : 'N/A'));

    return `
      <div class="torrent-row ${isShareMode ? 'torrent-share-row' : ''}" data-idx="${i}" style="cursor: pointer;">
        <span class="torrent-name" title="${safeName}">#${i + 1} ${safeName}</span>
        <span>${safeQuality}</span>
        <span>S: ${safeSeeds} / P: ${safePeers}</span>
        <span>${safeSize}</span>
        <div class="torrent-actions-cell" style="display:flex;gap:6px;align-items:center;">
          ${isShareMode ? `
            <button type="button" class="retro-btn btn-share-select-action" data-idx="${i}" title="Select this torrent to share">
              <span class="material-symbols-outlined" style="vertical-align: middle;">share</span>
              <span style="margin-left:3px;">SELECT & SHARE</span>
            </button>
          ` : `
            <button type="button" class="retro-btn btn-torrent-action btn-download-action" data-idx="${i}" title="Download .torrent file">
              <span class="material-symbols-outlined" style="vertical-align: middle;">download</span>
            </button>
            <button type="button" class="retro-btn btn-torrent-action btn-magnet-action" data-idx="${i}" title="Copy Magnet Link">
              <span class="material-symbols-outlined" style="vertical-align: middle;">link</span>
            </button>
            <button type="button" class="retro-btn btn-torrent-action btn-share-action" data-idx="${i}" title="Share this Torrent">
              <span class="material-symbols-outlined" style="vertical-align: middle;">share</span>
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = rowsHtml;

  // Bind clean click handlers to each row and action button
  container.querySelectorAll('.torrent-row').forEach(row => {
    const idx = parseInt(row.dataset.idx, 10);
    const selectedTorrent = torrents[idx];

    // Clicking anywhere on the row in Share Mode shares it
    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      if (isShareMode) {
        executeTorrentShare(selectedTorrent, mediaObj, searchTitle);
      } else {
        triggerDownloadDirect(searchTitle, selectedTorrent);
      }
    });

    const shareBtn = row.querySelector('.btn-share-select-action, .btn-share-action');
    if (shareBtn) {
      shareBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        executeTorrentShare(selectedTorrent, mediaObj, searchTitle);
      });
    }

    const downloadBtn = row.querySelector('.btn-download-action');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerDownloadDirect(searchTitle, selectedTorrent);
      });
    }

    const magnetBtn = row.querySelector('.btn-magnet-action');
    if (magnetBtn) {
      magnetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        copyMagnetLink(selectedTorrent.magnet);
      });
    }
  });
}

function generateTorrentRows(torrents, searchTitle, mediaObj = {}) {
  // Retained for backward compatibility
  const tempDiv = document.createElement('div');
  renderTorrentRows(tempDiv, torrents, searchTitle, mediaObj, false);
  return tempDiv.innerHTML;
}

async function loadTVSeasonsAccordion(m, isShareMode = false, autoLoadSeasonPack = null) {
  window._currentTVModalMedia = m;
  window._isTVModalShareMode = isShareMode;

  elements.modalTorrentList.innerHTML = getTorrentLoadingHtml(
    `RETRIEVING ${(m.title || 'TV SERIES').toUpperCase()} SEASONS...`,
    'Loading season catalog from TMDB & metadata indexers...'
  );
  if (window.initScrambler) initScrambler();

  const fetchStart = Date.now();
  const MIN_ANIMATION_MS = 650;

  try {
    const res = await fetch(`/api/details?id=${m.tmdbId || m.id}&type=tv`);
    const data = await res.json();

    const elapsed = Date.now() - fetchStart;
    if (elapsed < MIN_ANIMATION_MS) {
      await new Promise(r => setTimeout(r, MIN_ANIMATION_MS - elapsed));
    }

    if (data.success && data.details && data.details.seasons && data.details.seasons.length > 0) {
      const seasons = data.details.seasons.filter(s => s.season_number > 0);
      if (seasons.length === 0) {
        elements.modalTorrentList.innerHTML = `
          <div class="torrent-empty-state retro-box" style="padding: 20px 14px;">
            <div style="font-family: var(--font-mono); font-size: 13px;">No regular seasons found for this series.</div>
            <button type="button" class="btn-try-again seasons-retry-btn">
              <span class="material-symbols-outlined">refresh</span>
              <span>TRY AGAIN</span>
            </button>
          </div>
        `;
        const retryBtn = elements.modalTorrentList.querySelector('.seasons-retry-btn');
        if (retryBtn) {
          retryBtn.addEventListener('click', () => loadTVSeasonsAccordion(m, isShareMode, autoLoadSeasonPack));
        }
        return;
      }

      elements.modalTorrentList.innerHTML = seasons.map(s => {
        const seasonTitle = s.name && s.name !== `Season ${s.season_number}` 
          ? `Season ${s.season_number} • ${escapeHtml(s.name)}`
          : `Season ${s.season_number}`;
        const epCountBadge = s.episode_count ? `<span class="season-ep-count">[${s.episode_count} EPS]</span>` : '';
        return `
          <div class="accordion-item" id="season-acc-${s.season_number}">
            <div class="accordion-btn" role="button" tabindex="0" id="btn-season-${s.season_number}" data-season="${s.season_number}">
              <div class="season-btn-left">
                <span class="season-pill">S${String(s.season_number).padStart(2, '0')}</span>
                <span class="season-title">${seasonTitle}</span>
                ${epCountBadge}
              </div>
              <div class="season-btn-right">
                <button type="button" class="btn-season-pack-quick retro-btn" data-season="${s.season_number}" title="Download Whole Season ${s.season_number} (1 Torrent File)">
                  <span class="material-symbols-outlined season-pack-quick-icon">folder_zip</span>
                  <span class="season-pack-quick-label">WHOLE SEASON (1 TORRENT)</span>
                </button>
                <span class="season-btn-status" id="season-status-${s.season_number}"></span>
                <span class="accordion-arrow">▼</span>
              </div>
            </div>
            <div class="accordion-content" id="season-content-${s.season_number}"></div>
          </div>
        `;
      }).join('');

      // Cleanly bind event listeners to avoid quote breaking in HTML attributes
      elements.modalTorrentList.querySelectorAll('.accordion-item').forEach(item => {
        const btn = item.querySelector('.accordion-btn');
        const quickBtn = item.querySelector('.btn-season-pack-quick');
        if (btn) {
          const seasonNum = parseInt(btn.dataset.season, 10);
          btn.addEventListener('click', (e) => {
            if (e.target.closest('.btn-season-pack-quick')) return;
            e.preventDefault();
            toggleSeasonAccordion(seasonNum, m, btn);
          });
          btn.addEventListener('keydown', (e) => {
            if (e.target.closest('.btn-season-pack-quick')) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleSeasonAccordion(seasonNum, m, btn);
            }
          });
        }
        if (quickBtn) {
          quickBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const seasonNum = parseInt(quickBtn.dataset.season, 10);
            const accordionBtn = document.getElementById(`btn-season-${seasonNum}`);
            const content = document.getElementById(`season-content-${seasonNum}`);
            if (!content || !content.classList.contains('expanded')) {
              await toggleSeasonAccordion(seasonNum, m, accordionBtn);
            }
            loadSeasonPackTorrents(seasonNum, m);
          });
        }
      });

      if (autoLoadSeasonPack) {
        const targetS = parseInt(autoLoadSeasonPack, 10) || 1;
        const targetBtn = document.getElementById(`btn-season-${targetS}`);
        if (targetBtn) {
          toggleSeasonAccordion(targetS, m, targetBtn).then(() => {
            loadSeasonPackTorrents(targetS, m);
          });
        }
      }
    } else {
      elements.modalTorrentList.innerHTML = `
        <div class="torrent-empty-state retro-box" style="padding: 20px 14px;">
          <div style="font-family: var(--font-mono); font-size: 13px;">No seasons found.</div>
          <button type="button" class="btn-try-again seasons-retry-btn">
            <span class="material-symbols-outlined">refresh</span>
            <span>TRY AGAIN</span>
          </button>
        </div>
      `;
      const retryBtn = elements.modalTorrentList.querySelector('.seasons-retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => loadTVSeasonsAccordion(m, isShareMode, autoLoadSeasonPack));
      }
    }
  } catch (err) {
    elements.modalTorrentList.innerHTML = `
      <div class="torrent-empty-state retro-box error" style="padding: 20px 14px;">
        <div style="font-family: var(--font-mono); font-size: 13px; color:#ff3333;">Failed to load seasons.</div>
        <button type="button" class="btn-try-again seasons-retry-btn">
          <span class="material-symbols-outlined">refresh</span>
          <span>TRY AGAIN</span>
        </button>
      </div>
    `;
    const retryBtn = elements.modalTorrentList.querySelector('.seasons-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => loadTVSeasonsAccordion(m, isShareMode, autoLoadSeasonPack));
    }
  }
}

window.toggleSeasonAccordion = async function (seasonNumber, mediaOrStr, triggerBtn) {
  let m;
  if (typeof mediaOrStr === 'string') {
    try {
      m = JSON.parse(decodeURIComponent(mediaOrStr));
    } catch {
      try {
        m = JSON.parse(mediaOrStr);
      } catch {
        m = window._currentTVModalMedia || {};
      }
    }
  } else {
    m = mediaOrStr || window._currentTVModalMedia || {};
  }

  const btn = triggerBtn || document.getElementById(`btn-season-${seasonNumber}`) || document.querySelector(`#season-acc-${seasonNumber} .accordion-btn`);
  const content = document.getElementById(`season-content-${seasonNumber}`);
  if (!content) return;

  const isExpanded = content.classList.contains('expanded');

  if (isExpanded) {
    content.classList.remove('expanded');
    if (btn) {
      btn.classList.remove('expanded');
      const arrow = btn.querySelector('.accordion-arrow');
      if (arrow) arrow.textContent = '▼';
    }
    return;
  }

  content.classList.add('expanded');
  if (btn) {
    btn.classList.add('expanded');
    const arrow = btn.querySelector('.accordion-arrow');
    if (arrow) arrow.textContent = '▲';
  }

  // If already loaded episodes, avoid re-fetching
  if (content.innerHTML.trim() !== '' && !content.querySelector('.torrent-fetch-loader')) {
    return;
  }

  // Set loading state on button
  if (btn) {
    btn.classList.add('is-loading');
    const status = btn.querySelector('.season-btn-status') || document.getElementById(`season-status-${seasonNumber}`);
    if (status) {
      status.innerHTML = '<span class="live-pulse-dot"></span><span class="status-text">LOADING...</span>';
    }
  }

  // Show rich animated radar scanner in content
  const showTitle = (m.title || 'TV SERIES').toUpperCase();
  content.innerHTML = getTorrentLoadingHtml(
    `LOADING ${escapeHtml(showTitle)} SEASON ${seasonNumber} EPISODES...`,
    'Retrieving verified episode listings, air dates & release metadata...'
  );
  if (window.initScrambler) initScrambler();

  const fetchStart = Date.now();
  const MIN_ANIMATION_MS = 650;

  try {
    const res = await fetch(`/api/tv/episodes?id=${m.id}&season=${seasonNumber}`);
    const data = await res.json();

    const elapsed = Date.now() - fetchStart;
    if (elapsed < MIN_ANIMATION_MS) {
      await new Promise(r => setTimeout(r, MIN_ANIMATION_MS - elapsed));
    }

    if (data.success && data.episodes && data.episodes.episodes && data.episodes.episodes.length > 0) {
      const now = new Date();
      const seasonPackBannerHtml = `
        <div class="season-pack-banner retro-box" id="season-pack-banner-${seasonNumber}">
          <div class="season-pack-info">
            <div class="season-pack-badge-row">
              <span class="season-pack-tag">
                <span class="material-symbols-outlined season-pack-tag-icon">folder_zip</span>
                <span>1 TORRENT FILE</span>
              </span>
              <span class="season-pack-badge-note">[COMPLETE SEASON ${seasonNumber} BATCH]</span>
            </div>
            <div class="season-pack-headline scramble-text">DOWNLOAD WHOLE SEASON ${seasonNumber}</div>
            <div class="season-pack-subtext">Download all ${data.episodes.episodes.length} episodes bundled together as 1 verified .torrent or magnet file.</div>
          </div>
          <div class="season-pack-cta-wrap">
            <button type="button" class="retro-btn btn-load-season-pack" id="btn-load-season-pack-${seasonNumber}" data-season="${seasonNumber}" title="Download Season ${seasonNumber} as 1 Torrent File">
              <span class="material-symbols-outlined" style="font-size:16px; vertical-align:middle; margin-right:4px;">download</span>
              <span class="scramble-text">GET WHOLE SEASON (.TORRENT)</span>
            </button>
          </div>
        </div>
        <div class="season-pack-results-area hidden" id="season-pack-results-${seasonNumber}">
          <div class="season-pack-results-header">
            <div class="season-pack-header-title">
              <span class="material-symbols-outlined" style="color:var(--retro-accent,#ffcc00); vertical-align:middle; margin-right:4px;">folder_zip</span>
              <span class="scramble-text">SEASON ${seasonNumber} COMPLETE BATCH RELEASES</span>
            </div>
            <button type="button" class="retro-btn btn-close-season-pack" id="btn-close-season-pack-${seasonNumber}" data-season="${seasonNumber}">
              ✕ HIDE BATCHES
            </button>
          </div>
          <div class="season-pack-filter-bar torrent-filter-bar" id="season-pack-filter-bar-${seasonNumber}"></div>
          <div class="season-pack-torrent-container" id="season-pack-torrents-${seasonNumber}"></div>
        </div>
        <div class="season-episodes-divider">
          <span>OR SELECT INDIVIDUAL EPISODES BELOW</span>
        </div>
      `;

      const episodesHtml = data.episodes.episodes.map(e => {
        let isUnreleased = false;
        if (e.air_date) {
          const airDate = new Date(e.air_date);
          if (airDate > now) isUnreleased = true;
        }
        const unreleasedClass = isUnreleased ? 'unreleased' : '';
        const airDateFormatted = e.air_date ? ` (${e.air_date.substring(0, 4)})` : '';
        return `
          <div class="episode-item" id="ep-item-${seasonNumber}-${e.episode_number}">
            <button type="button" class="episode-btn ${unreleasedClass}" id="btn-ep-${seasonNumber}-${e.episode_number}" data-season="${seasonNumber}" data-episode="${e.episode_number}">
              <div class="ep-btn-left">
                <span class="ep-num-badge">E${String(e.episode_number).padStart(2, '0')}</span>
                <span class="ep-title">${escapeHtml(e.name || `Episode ${e.episode_number}`)}${airDateFormatted}</span>
                ${isUnreleased ? '<span class="ep-unreleased-tag">[UNRELEASED]</span>' : ''}
              </div>
              <div class="ep-btn-right">
                <span class="ep-btn-status" id="ep-status-${seasonNumber}-${e.episode_number}"></span>
                <span class="ep-arrow">▼</span>
              </div>
            </button>
            <div class="episode-content" id="ep-content-${seasonNumber}-${e.episode_number}"></div>
          </div>
        `;
      }).join('');

      content.innerHTML = seasonPackBannerHtml + episodesHtml;

      // Wire season pack actions
      const loadPackBtn = content.querySelector(`#btn-load-season-pack-${seasonNumber}`);
      if (loadPackBtn) {
        loadPackBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          loadSeasonPackTorrents(seasonNumber, m);
        });
      }
      const closePackBtn = content.querySelector(`#btn-close-season-pack-${seasonNumber}`);
      if (closePackBtn) {
        closePackBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const resultsArea = document.getElementById(`season-pack-results-${seasonNumber}`);
          if (resultsArea) resultsArea.classList.add('hidden');
        });
      }

      // Wire episode event listeners cleanly
      content.querySelectorAll('.episode-btn').forEach(epBtn => {
        const epNum = parseInt(epBtn.dataset.episode, 10);
        epBtn.addEventListener('click', (e) => {
          e.preventDefault();
          toggleEpisodeAccordion(seasonNumber, epNum, m, epBtn);
        });
      });
    } else {
      content.innerHTML = `
        <div class="torrent-empty-state retro-box" style="padding: 14px; margin: 6px auto;">
          <div style="font-family: var(--font-mono); font-size: 12px;">No episodes found for this season.</div>
          <button type="button" class="btn-try-again season-ep-retry-btn">
            <span class="material-symbols-outlined">refresh</span>
            <span>TRY AGAIN</span>
          </button>
        </div>
      `;
      const retryBtn = content.querySelector('.season-ep-retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          content.innerHTML = '';
          toggleSeasonAccordion(seasonNumber, m, btn);
        });
      }
    }
  } catch (err) {
    content.innerHTML = `
      <div class="torrent-empty-state retro-box error" style="padding: 14px; margin: 6px auto;">
        <div style="font-family: var(--font-mono); font-size: 12px; color:#ff3333;">Failed to load episodes.</div>
        <button type="button" class="btn-try-again season-ep-retry-btn">
          <span class="material-symbols-outlined">refresh</span>
          <span>TRY AGAIN</span>
        </button>
      </div>
    `;
    const retryBtn = content.querySelector('.season-ep-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        content.innerHTML = '';
        toggleSeasonAccordion(seasonNumber, m, btn);
      });
    }
  } finally {
    if (btn) {
      btn.classList.remove('is-loading');
      const status = btn.querySelector('.season-btn-status') || document.getElementById(`season-status-${seasonNumber}`);
      if (status) status.innerHTML = '';
    }
  }
};

window.toggleEpisodeAccordion = async function (seasonNumber, episodeNumber, mediaOrStr, triggerBtn) {
  let m;
  if (typeof mediaOrStr === 'string') {
    try {
      m = JSON.parse(decodeURIComponent(mediaOrStr));
    } catch {
      try {
        m = JSON.parse(mediaOrStr);
      } catch {
        m = window._currentTVModalMedia || {};
      }
    }
  } else {
    m = mediaOrStr || window._currentTVModalMedia || {};
  }

  const btn = triggerBtn || document.getElementById(`btn-ep-${seasonNumber}-${episodeNumber}`) || document.querySelector(`.episode-btn[data-season="${seasonNumber}"][data-episode="${episodeNumber}"]`);
  const content = document.getElementById(`ep-content-${seasonNumber}-${episodeNumber}`);
  if (!content) return;

  const isExpanded = content.classList.contains('expanded');

  if (isExpanded) {
    content.classList.remove('expanded');
    if (btn) {
      btn.classList.remove('expanded');
      const arrow = btn.querySelector('.ep-arrow');
      if (arrow) arrow.textContent = '▼';
    }
    return;
  }

  content.classList.add('expanded');
  if (btn) {
    btn.classList.add('expanded');
    const arrow = btn.querySelector('.ep-arrow');
    if (arrow) arrow.textContent = '▲';
  }

  // If already loaded torrents, avoid re-fetching
  if (content.innerHTML.trim() !== '' && !content.querySelector('.torrent-fetch-loader')) {
    return;
  }

  const searchTitle = `${m.title || 'Series'} S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`;

  if (btn) {
    btn.classList.add('is-loading');
    const status = btn.querySelector('.ep-btn-status') || document.getElementById(`ep-status-${seasonNumber}-${episodeNumber}`);
    if (status) {
      status.innerHTML = '<span class="live-pulse-dot"></span><span class="status-text">SCANNING...</span>';
    }
  }

  content.innerHTML = getTorrentLoadingHtml(
    `SCANNING SWARM FOR ${searchTitle.toUpperCase()}...`,
    'Querying TV release groups & verified seeders across The Cine Bay...'
  );
  if (window.initScrambler) initScrambler();

  const fetchStart = Date.now();
  const MIN_ANIMATION_MS = 650;

  try {
    const imdbParam = m?.imdbId || m?.imdb || '';
    const tmdbIdParam = m?.id || '';
    const yearParam = m?.year || '';
    const res = await fetch(`/api/search?q=${encodeURIComponent(searchTitle)}&minSeeds=0&category=205&season=${seasonNumber}&episode=${episodeNumber}&type=tv&imdbId=${encodeURIComponent(imdbParam)}&tmdbId=${encodeURIComponent(tmdbIdParam)}&year=${encodeURIComponent(yearParam)}`);
    const data = await res.json();

    const elapsed = Date.now() - fetchStart;
    if (elapsed < MIN_ANIMATION_MS) {
      await new Promise(r => setTimeout(r, MIN_ANIMATION_MS - elapsed));
    }

    if (data.success) {
      const epNum = parseInt(episodeNumber, 10);
      const sNum = parseInt(seasonNumber, 10);
      const epStr = `s${String(sNum).padStart(2, '0')}e${String(epNum).padStart(2, '0')}`;
      const epPattern = new RegExp(`(\\b|[^a-z0-9])(s0*${sNum}\\s*e0*${epNum}|${sNum}x0*${epNum}|e0*${epNum}|ep0*${epNum}|episode\\s*0*${epNum})(\\b|[^a-z0-9])`, 'i');
      const animePattern = new RegExp(`([\\s_\\[\\-]0*${epNum}[\\s_\\]\\.\\-])`, 'i');
      const seasonPackPattern = new RegExp(`(\\b|[^a-z0-9])(s0*${sNum}\\b|season\\s*0*${sNum}\\b).*?(complete|batch|pack)`, 'i');

      let filteredTorrents = (data.torrents || []).filter(t => {
        const lower = (t.name || '').toLowerCase();
        return lower.includes(epStr) || epPattern.test(lower) || animePattern.test(lower) || seasonPackPattern.test(lower);
      });

      // If strict filter yields 0 but data.torrents has releases, display all to allow season packs/alternate releases
      if (filteredTorrents.length === 0 && data.torrents && data.torrents.length > 0) {
        filteredTorrents = data.torrents;
      }

      if (filteredTorrents.length === 0) {
        content.innerHTML = `
          <div class="torrent-empty-state retro-box" style="padding: 16px 12px; margin: 6px auto;">
            <div style="font-family: var(--font-mono); font-size: 12px; opacity: 0.85;">No torrents found matching this exact episode.</div>
            <button type="button" class="btn-try-again ep-retry-btn">
              <span class="material-symbols-outlined">refresh</span>
              <span>TRY AGAIN</span>
            </button>
          </div>
        `;
        const retryBtn = content.querySelector('.ep-retry-btn');
        if (retryBtn) {
          retryBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            content.innerHTML = '';
            toggleEpisodeAccordion(seasonNumber, episodeNumber, m, btn);
          });
        }
      } else {
        content.innerHTML = `
          <div class="ep-torrent-filter-bar torrent-filter-bar"></div>
          <div class="torrent-list-header" style="display:flex; margin-bottom:10px;">
            <span>Release</span><span>Quality</span><span>Seeds/Peers</span><span>Size</span><span>Action</span>
          </div>
          <div class="ep-torrent-items"></div>
        `;
        const epFilterBar = content.querySelector('.ep-torrent-filter-bar');
        const itemsContainer = content.querySelector('.ep-torrent-items');
        if (epFilterBar && itemsContainer) {
          renderTorrentFilterBar(epFilterBar, filteredTorrents, (fList) => {
            if (fList.length === 0) {
              itemsContainer.innerHTML = `
                <div class="torrent-empty-state retro-box" style="padding: 16px 12px; margin: 6px auto;">
                  <div style="font-family: var(--font-mono); font-size: 12px;">No releases matching selected filters.</div>
                </div>
              `;
            } else {
              renderTorrentRows(itemsContainer, fList, searchTitle, { ...m, mediaType: 'tv', season: seasonNumber, episode: episodeNumber }, window._isTVModalShareMode || false);
            }
          });
        }
        renderTorrentRows(itemsContainer, filteredTorrents, searchTitle, { ...m, mediaType: 'tv', season: seasonNumber, episode: episodeNumber }, window._isTVModalShareMode || false);
      }
    } else {
      content.innerHTML = `
        <div class="torrent-empty-state retro-box error" style="padding: 16px 12px; margin: 6px auto;">
          <div style="font-family: var(--font-mono); font-size: 12px; color:#ff3333;">Failed to load episode torrents.</div>
          <button type="button" class="btn-try-again ep-retry-btn">
            <span class="material-symbols-outlined">refresh</span>
            <span>TRY AGAIN</span>
          </button>
        </div>
      `;
      const retryBtn = content.querySelector('.ep-retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          content.innerHTML = '';
          toggleEpisodeAccordion(seasonNumber, episodeNumber, m, btn);
        });
      }
    }
  } catch (err) {
    content.innerHTML = `
      <div class="torrent-empty-state retro-box error" style="padding: 16px 12px; margin: 6px auto;">
        <div style="font-family: var(--font-mono); font-size: 12px; color:#ff3333;">Failed to fetch torrents.</div>
        <button type="button" class="btn-try-again ep-retry-btn">
          <span class="material-symbols-outlined">refresh</span>
          <span>TRY AGAIN</span>
        </button>
      </div>
    `;
    const retryBtn = content.querySelector('.ep-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        content.innerHTML = '';
        toggleEpisodeAccordion(seasonNumber, episodeNumber, m, btn);
      });
    }
  } finally {
    if (btn) {
      btn.classList.remove('is-loading');
      const status = btn.querySelector('.ep-btn-status') || document.getElementById(`ep-status-${seasonNumber}-${episodeNumber}`);
      if (status) status.innerHTML = '';
    }
  }
};

window.loadSeasonPackTorrents = async function (seasonNumber, mediaOrStr) {
  let m;
  if (typeof mediaOrStr === 'string') {
    try {
      m = JSON.parse(decodeURIComponent(mediaOrStr));
    } catch {
      try {
        m = JSON.parse(mediaOrStr);
      } catch {
        m = window._currentTVModalMedia || {};
      }
    }
  } else {
    m = mediaOrStr || window._currentTVModalMedia || {};
  }

  const sNum = parseInt(seasonNumber, 10) || 1;
  const resultsContainer = document.getElementById(`season-pack-results-${sNum}`);
  const torrentsList = document.getElementById(`season-pack-torrents-${sNum}`);
  const filterBar = document.getElementById(`season-pack-filter-bar-${sNum}`);

  if (resultsContainer) {
    resultsContainer.classList.remove('hidden');
  }

  if (torrentsList) {
    torrentsList.innerHTML = getTorrentLoadingHtml(
      `SCANNING FOR COMPLETE SEASON ${sNum} AS 1 TORRENT FILE...`,
      'Retrieving verified season batches & whole-season torrents across trackers...'
    );
    if (window.initScrambler) initScrambler();
  }

  const fetchStart = Date.now();
  const MIN_ANIMATION_MS = 650;

  try {
    const title = m.title || 'Series';
    const imdbParam = m.imdbId || m.imdb || '';
    const tmdbIdParam = m.id || '';
    const yearParam = m.year || '';

    const res = await fetch(`/api/season/torrents?title=${encodeURIComponent(title)}&season=${sNum}&imdbId=${encodeURIComponent(imdbParam)}&id=${encodeURIComponent(tmdbIdParam)}&year=${encodeURIComponent(yearParam)}&type=tv`);
    const data = await res.json();

    const elapsed = Date.now() - fetchStart;
    if (elapsed < MIN_ANIMATION_MS) {
      await new Promise(r => setTimeout(r, MIN_ANIMATION_MS - elapsed));
    }

    if (data.success && data.torrents && data.torrents.length > 0) {
      const allTorrents = data.torrents;
      if (torrentsList) {
        torrentsList.innerHTML = `
          <div class="torrent-list-header" style="display:flex; margin-bottom:10px;">
            <span>Release</span><span>Quality</span><span>Seeds/Peers</span><span>Size</span><span>Action</span>
          </div>
          <div class="season-pack-items-list" id="season-pack-items-list-${sNum}"></div>
        `;
        const itemsList = document.getElementById(`season-pack-items-list-${sNum}`);
        if (filterBar) {
          renderTorrentFilterBar(filterBar, allTorrents, (filteredList) => {
            if (filteredList.length === 0) {
              itemsList.innerHTML = `
                <div class="torrent-empty-state retro-box" style="padding:14px; margin:6px auto;">
                  <div style="font-family: var(--font-mono); font-size:12px;">No batch releases matching selected filter.</div>
                </div>
              `;
            } else {
              renderTorrentRows(itemsList, filteredList, `${title} Season ${sNum}`, { ...m, mediaType: 'tv', season: sNum, isSeasonPack: true }, window._isTVModalShareMode || false);
            }
          });
        }
        renderTorrentRows(itemsList, allTorrents, `${title} Season ${sNum}`, { ...m, mediaType: 'tv', season: sNum, isSeasonPack: true }, window._isTVModalShareMode || false);
      }
    } else {
      if (torrentsList) {
        torrentsList.innerHTML = `
          <div class="torrent-empty-state retro-box" style="padding: 16px 12px; margin: 6px auto;">
            <div style="font-family: var(--font-mono); font-size: 12px; opacity: 0.85;">No complete season batch torrents found for Season ${sNum}. You can download individual episodes below.</div>
            <button type="button" class="btn-try-again season-pack-retry-btn">
              <span class="material-symbols-outlined">refresh</span>
              <span>TRY AGAIN</span>
            </button>
          </div>
        `;
        const retryBtn = torrentsList.querySelector('.season-pack-retry-btn');
        if (retryBtn) {
          retryBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            loadSeasonPackTorrents(sNum, m);
          });
        }
      }
    }
  } catch (err) {
    if (torrentsList) {
      torrentsList.innerHTML = `
        <div class="torrent-empty-state retro-box error" style="padding: 16px 12px; margin: 6px auto;">
          <div style="font-family: var(--font-mono); font-size: 12px; color:#ff3333;">Failed to load season torrents.</div>
          <button type="button" class="btn-try-again season-pack-retry-btn">
            <span class="material-symbols-outlined">refresh</span>
            <span>TRY AGAIN</span>
          </button>
        </div>
      `;
      const retryBtn = torrentsList.querySelector('.season-pack-retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          loadSeasonPackTorrents(sNum, m);
        });
      }
    }
  }
};

const trailerPlayerState = {
  sources: [],
  currentIndex: 0,
  title: '',
  year: '',
  type: ''
};

function renderActiveTrailerSource() {
  const iframe = document.getElementById('trailer-iframe');
  const loader = document.getElementById('trailer-loader');
  const ytLink = document.getElementById('trailer-yt-link');
  const openYtBtn = document.getElementById('trailer-open-yt-btn');
  const altBtn = document.getElementById('trailer-alt-btn');
  const statusText = document.getElementById('trailer-status-text');

  if (!trailerPlayerState.sources.length) return;

  const current = trailerPlayerState.sources[trailerPlayerState.currentIndex];
  if (loader) loader.classList.add('hidden');
  if (iframe) {
    iframe.classList.remove('hidden');
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.src = current.embedUrl;
  }

  // Update YouTube watch links in header and footer
  if (ytLink) {
    ytLink.href = current.watchUrl;
    ytLink.style.display = 'inline-flex';
  }
  if (openYtBtn) {
    openYtBtn.href = current.watchUrl;
    openYtBtn.style.display = 'inline-flex';
  }

  // Show ALT button if more than 1 source exists
  if (altBtn) {
    if (trailerPlayerState.sources.length > 1) {
      altBtn.style.display = 'inline-flex';
      altBtn.textContent = `⟳ ALT TRAILER (${trailerPlayerState.currentIndex + 1}/${trailerPlayerState.sources.length})`;
    } else {
      altBtn.style.display = 'none';
    }
  }

  if (statusText) {
    statusText.textContent = trailerPlayerState.sources.length > 1
      ? `TRAILER (${trailerPlayerState.currentIndex + 1}/${trailerPlayerState.sources.length}) • Trailers may not match`
      : 'Trailers may not match';
  }
}

async function playTrailer(id, type, title = '', year = '') {
  const modal = document.getElementById('trailer-modal');
  const iframe = document.getElementById('trailer-iframe');
  const loader = document.getElementById('trailer-loader');
  const titleEl = document.getElementById('trailer-modal-title');
  const ytLink = document.getElementById('trailer-yt-link');
  const openYtBtn = document.getElementById('trailer-open-yt-btn');
  const altBtn = document.getElementById('trailer-alt-btn');
  const statusText = document.getElementById('trailer-status-text');

  if (!title && elements.detailTitle && elements.detailTitle.innerText && elements.detailTitle.innerText !== 'TITLE') {
    title = elements.detailTitle.innerText;
  }

  if (title && titleEl) {
    titleEl.textContent = `TRAILER: ${title.toUpperCase()}`;
  } else if (titleEl) {
    titleEl.textContent = 'TRAILER';
  }

  if (ytLink) {
    ytLink.style.display = 'none';
    ytLink.href = '#';
  }
  if (openYtBtn) {
    openYtBtn.style.display = 'none';
    openYtBtn.href = '#';
  }
  if (altBtn) altBtn.style.display = 'none';
  if (statusText) statusText.textContent = 'Trailers may not match';

  // Pause background fluid simulation during video playback to optimize GPU/CPU
  if (fluidInstance && typeof fluidInstance.pause === 'function') {
    fluidInstance.pause();
  }

  // Trigger popup immediately and show loader
  modal.classList.remove('hidden');
  iframe.classList.add('hidden');
  loader.classList.remove('hidden');
  loader.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:12px;">
      <span class="live-pulse-dot" style="width:12px;height:12px;"></span>
      <span>SEARCHING TRAILERS...</span>
    </div>
  `;
  iframe.src = ''; // Clear old trailer

  const sources = [];
  const seenUrls = new Set();
  const addSource = (embedUrl, watchUrl, label) => {
    if (embedUrl && !seenUrls.has(embedUrl)) {
      seenUrls.add(embedUrl);
      sources.push({ embedUrl, watchUrl, label });
    }
  };

  try {
    const url = `/api/details?id=${id || ''}&type=${type || 'movie'}&title=${encodeURIComponent(title || '')}&year=${encodeURIComponent(year || '')}`;
    const res = await fetch(url);
    const data = await res.json();
    
    const details = data.success && data.details ? data.details : null;
    const trailerKeys = details?.trailerKeys || (details?.trailerKey ? [details.trailerKey] : []);

    trailerKeys.forEach((key, idx) => {
      addSource(
        `https://www.youtube.com/embed/${key}?autoplay=1&enablejsapi=1`,
        `https://www.youtube.com/watch?v=${key}`,
        idx === 0 ? 'TRAILER' : `ALT TRAILER #${idx + 1}`
      );
    });

    // Fallback: If details had 0 keys, query dedicated /api/trailer
    if (sources.length === 0 && (title || id)) {
      try {
        const tRes = await fetch(`/api/trailer?title=${encodeURIComponent(title || '')}&year=${encodeURIComponent(year || '')}&type=${type || 'movie'}&id=${id || ''}`);
        const tData = await tRes.json();
        if (tData.success && tData.trailerKey) {
          addSource(
            `https://www.youtube.com/embed/${tData.trailerKey}?autoplay=1&enablejsapi=1`,
            `https://www.youtube.com/watch?v=${tData.trailerKey}`,
            'TRAILER'
          );
        }
      } catch (e) { }
    }

    if (sources.length > 0) {
      trailerPlayerState.sources = sources;
      trailerPlayerState.currentIndex = 0;
      trailerPlayerState.title = title;
      trailerPlayerState.year = year;
      trailerPlayerState.type = type;
      renderActiveTrailerSource();
    } else {
      iframe.classList.add('hidden');
      loader.classList.remove('hidden');
      if (statusText) statusText.textContent = 'Trailers may not match';
      loader.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:30px;text-align:center;">
          <span class="material-symbols-outlined" style="font-size:36px;color:#888;">movie_off</span>
          <span style="font-family:var(--font-mono);font-weight:700;font-size:13px;">NO TRAILER AVAILABLE</span>
          <span style="font-size:11px;color:#777;font-family:var(--font-mono);">Trailers may not match or are currently unavailable for this title.</span>
          ${title ? `
            <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(title + ' ' + (year || '') + ' trailer')}" target="_blank" rel="noopener noreferrer" class="retro-btn" style="text-decoration:none;font-size:11px;padding:6px 12px;margin-top:6px;">
              SEARCH ON YOUTUBE ↗
            </a>
          ` : ''}
        </div>
      `;
      showToast('No trailer stream available', 'info');
    }
  } catch (err) {
    iframe.classList.add('hidden');
    loader.classList.remove('hidden');
    if (statusText) statusText.textContent = 'Trailers may not match';
    loader.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:30px;text-align:center;">
        <span class="material-symbols-outlined" style="font-size:36px;color:#888;">movie_off</span>
        <span style="font-family:var(--font-mono);font-weight:700;font-size:13px;">NO TRAILER AVAILABLE</span>
        <span style="font-size:11px;color:#777;font-family:var(--font-mono);">Trailers may not match or failed to load.</span>
        ${title ? `
          <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(title + ' ' + (year || '') + ' trailer')}" target="_blank" rel="noopener noreferrer" class="retro-btn" style="text-decoration:none;font-size:11px;padding:6px 12px;margin-top:6px;">
            SEARCH ON YOUTUBE ↗
          </a>
        ` : ''}
      </div>
    `;
    showToast('Failed to load trailer', 'error');
  }
}


// ============================================================================
// TV Series Season Splitting Engine
// ============================================================================

async function splitTvShowIntoSeasons(item, shouldSaveAndRender = true) {
  if (!item) return [];

  // 1. Resolve TMDB ID
  let tmdbId = item.tmdbId || (!isNaN(item.id) ? parseInt(item.id, 10) : null);
  if (!tmdbId) {
    try {
      const cleanQuery = (item.seriesTitle || item.title || '').replace(/\s*-\s*Season\s*\d+.*$/i, '').trim();
      const searchRes = await fetch(`/api/media/rapid-search?q=${encodeURIComponent(cleanQuery)}`);
      const searchData = await searchRes.json();
      const match = Array.isArray(searchData) ? searchData.find(m => m.mediaType === 'tv') : null;
      if (match) tmdbId = match.tmdbId || match.id;
    } catch (e) {}
  }

  // 2. Fetch seasons list from TMDB
  let seasons = [];
  if (tmdbId) {
    try {
      const detailsRes = await fetch(`/api/details?id=${tmdbId}&type=tv&title=${encodeURIComponent(item.title || '')}`);
      const detailsData = await detailsRes.json();
      if (detailsData?.details?.seasons) {
        seasons = detailsData.details.seasons;
      }
    } catch (e) {}
  }

  // Filter valid seasons (season_number >= 1)
  let validSeasons = Array.isArray(seasons) ? seasons.filter(s => s.season_number > 0) : [];
  if (validSeasons.length === 0) {
    const totalS = Math.max(1, item.totalSeasons || 1);
    if (totalS <= 1) {
      showToast(`"${item.title}" only has 1 season.`, 'info');
      return [];
    }
    const estPerSeason = Math.max(1, Math.round((item.totalEpisodes || (totalS * 12)) / totalS));
    validSeasons = [];
    for (let s = 1; s <= totalS; s++) {
      validSeasons.push({
        season_number: s,
        name: `Season ${s}`,
        episode_count: estPerSeason,
        air_date: item.year ? `${item.year}-01-01` : '',
        poster: item.poster
      });
    }
  }

  const seriesTitle = (item.seriesTitle || item.title || '').replace(/\s*-\s*Season\s*\d+.*$/i, '').trim();
  const isShowCompleted = item.status === 'completed';
  let remainingWatched = isShowCompleted ? 999999 : Math.max(0, parseInt(item.currentEpisode || 0, 10));

  const seasonEntries = validSeasons.map(s => {
    const seasonNum = s.season_number;
    const seasonEps = Math.max(1, parseInt(s.episode_count || 1, 10));
    let seasonWatched = 0;
    if (isShowCompleted) {
      seasonWatched = seasonEps;
    } else if (remainingWatched >= seasonEps) {
      seasonWatched = seasonEps;
      remainingWatched -= seasonEps;
    } else {
      seasonWatched = remainingWatched;
      remainingWatched = 0;
    }

    let seasonStatus = 'plan_to_watch';
    if (seasonWatched >= seasonEps) {
      seasonStatus = 'completed';
    } else if (seasonWatched > 0) {
      seasonStatus = 'watching';
    }

    const seasonPoster = s.poster || (s.poster_path ? (s.poster_path.startsWith('http') ? s.poster_path : `https://image.tmdb.org/t/p/w500${s.poster_path}`) : null) || item.poster;
    const seasonYear = s.air_date ? parseInt(s.air_date.slice(0, 4), 10) : item.year;
    const seasonName = s.name || `Season ${seasonNum}`;
    const seasonTitle = `${seriesTitle} - ${seasonName}`;
    const seasonId = `${tmdbId || item.id}_s${seasonNum}`;

    return normalizeWatchlistItem({
      id: seasonId,
      tmdbId: tmdbId || null,
      mediaType: 'tv',
      isSeason: true,
      seasonNumber: seasonNum,
      seriesTitle: seriesTitle,
      title: seasonTitle,
      year: seasonYear,
      poster: seasonPoster,
      backdrop: item.backdrop || '',
      rating: item.rating || 0,
      voteCount: item.voteCount || 0,
      overview: s.overview || item.overview || '',
      genres: item.genres || [],
      runtime: item.runtime || 0,
      status: seasonStatus,
      currentSeason: seasonNum,
      currentEpisode: seasonWatched,
      totalSeasons: validSeasons.length,
      totalEpisodes: seasonEps,
      progressPct: Math.min(100, Math.round((seasonWatched / seasonEps) * 100)),
      userRating: item.userRating || null,
      diaryNotes: item.diaryNotes || '',
      customLists: item.customLists || [],
      streamingInfo: item.streamingInfo || [],
      createdAt: item.createdAt || new Date().toISOString()
    });
  });

  // Replace single combined item with generated season entries
  const idx = state.watchlist.findIndex(w => w.id === item.id || (!w.isSeason && w.tmdbId && w.tmdbId === item.tmdbId));
  if (idx !== -1) {
    state.watchlist.splice(idx, 1, ...seasonEntries);
  } else {
    state.watchlist.unshift(...seasonEntries);
  }

  // Delete old monolithic item from cloud server if present
  const userId = state.user ? state.user.id : 'guest';
  if (item.id) {
    fetch(`/api/user/watchlist/${encodeURIComponent(item.id)}?userId=${encodeURIComponent(userId)}`, {
      method: 'DELETE'
    }).catch(() => {});
  }

  // Save season entries to cloud server
  seasonEntries.forEach(entry => {
    fetch('/api/user/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: entry, userId })
    }).catch(() => {});
  });

  if (shouldSaveAndRender) {
    await saveWatchlist();
    showToast(`Separated "${seriesTitle}" into ${seasonEntries.length} seasons!`, 'success');
    renderWatchlist();
    renderWatchlistStats();
  }

  return seasonEntries;
}

async function splitAllTvShowsIntoSeasons() {
  const multiShows = state.watchlist.filter(w => {
    const isTv = (w.mediaType || '').toLowerCase() === 'tv';
    return isTv && !w.isSeason && ((w.totalSeasons && w.totalSeasons > 1) || (w.totalEpisodes > 25) || (!w.totalEpisodes));
  });

  if (multiShows.length === 0) {
    showToast('All TV shows are already separated into seasons!', 'info');
    return;
  }

  showToast(`Separating ${multiShows.length} TV series into seasons...`, 'info');
  for (const show of multiShows) {
    await splitTvShowIntoSeasons(show, false);
  }

  await saveWatchlist();
  showToast(`Successfully separated ${multiShows.length} series into individual seasons!`, 'success');
  renderWatchlist();
  renderWatchlistStats();
}

async function openTorrentModal(m, type, isShareMode = false, autoLoadSeasonPack = null) {
  elements.modalMovieTitle.innerText = isShareMode ? `SHARE: ${m.title}` : m.title;
  elements.torrentModal.classList.remove('hidden');

  let banner = document.getElementById('modalShareBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'modalShareBanner';
    banner.className = 'modal-share-banner';
    const header = elements.torrentModal.querySelector('.modal-header');
    if (header) header.insertAdjacentElement('afterend', banner);
  }

  if (isShareMode) {
    banner.classList.remove('hidden');
    banner.innerHTML = '<span>🔗 SELECT A TORRENT RELEASE BELOW TO SHARE</span>';
  } else {
    banner.classList.add('hidden');
  }

  if (type === 'tv') {
    if (elements.modalTorrentHeader) elements.modalTorrentHeader.classList.add('hidden');
    if (elements.modalTorrentFilterBar) elements.modalTorrentFilterBar.classList.add('hidden');
    loadTVSeasonsAccordion(m, isShareMode, autoLoadSeasonPack);
  } else {
    if (elements.modalTorrentHeader) elements.modalTorrentHeader.classList.remove('hidden');
    fetchTorrentsForModal(m.title, type, m, isShareMode);
  }
}

async function fetchTorrentsForModal(searchTitle, type, mediaObj = {}, isShareMode = false) {
  if (elements.modalTorrentFilterBar) elements.modalTorrentFilterBar.classList.add('hidden');
  elements.modalTorrentList.innerHTML = getTorrentLoadingHtml(
    `SCANNING SWARM FOR "${searchTitle.toUpperCase()}"...`,
    'Connecting to The Cine Bay, YTS.GG & P2P DHT nodes to filter high-seed releases...'
  );
  if (window.initScrambler) initScrambler();

  const fetchStart = Date.now();
  const MIN_ANIMATION_MS = 650;

  try {
    const category = type === 'tv' ? '205' : '200';
    const imdbParam = mediaObj?.imdbId || mediaObj?.imdb || '';
    const tmdbIdParam = mediaObj?.id || '';
    const yearParam = mediaObj?.year || '';
    const res = await fetch(`/api/search?q=${encodeURIComponent(searchTitle)}&minSeeds=0&category=${category}&imdbId=${encodeURIComponent(imdbParam)}&tmdbId=${encodeURIComponent(tmdbIdParam)}&year=${encodeURIComponent(yearParam)}&type=${type || 'movie'}`);
    const data = await res.json();

    const elapsed = Date.now() - fetchStart;
    if (elapsed < MIN_ANIMATION_MS) {
      await new Promise(r => setTimeout(r, MIN_ANIMATION_MS - elapsed));
    }

    if (data.success && data.torrents && data.torrents.length > 0) {
      if (elements.modalTorrentFilterBar) {
        elements.modalTorrentFilterBar.classList.remove('hidden');
        elements.modalTorrentFilterBar._activeFilters = new Set();
        renderTorrentFilterBar(elements.modalTorrentFilterBar, data.torrents, (filteredTorrents) => {
          if (filteredTorrents.length === 0) {
            elements.modalTorrentList.innerHTML = `
              <div class="torrent-empty-state retro-box" style="padding: 24px 16px; margin: 10px auto;">
                <span class="material-symbols-outlined" style="font-size: 32px; opacity: 0.7; margin-bottom: 6px;">filter_alt_off</span>
                <div style="font-family: var(--font-mono); font-size: 13px; font-weight: 700; margin-bottom: 6px;">NO RELEASES MATCHING CURRENT FILTERS</div>
                <div style="font-family: var(--font-mono); font-size: 11px; opacity: 0.8; margin-bottom: 12px;">Try adjusting your selected filters to view available releases.</div>
                <button type="button" class="retro-btn btn-reset-filters" style="font-size: 11px; padding: 6px 14px;">
                  RESET TO ALL TORRENTS
                </button>
              </div>
            `;
            const resetBtn = elements.modalTorrentList.querySelector('.btn-reset-filters');
            if (resetBtn) {
              resetBtn.addEventListener('click', () => {
                elements.modalTorrentFilterBar._activeFilters.clear();
                renderTorrentFilterBar(elements.modalTorrentFilterBar, data.torrents, (fList) => {
                  renderTorrentRows(elements.modalTorrentList, fList, searchTitle, mediaObj, isShareMode);
                });
                renderTorrentRows(elements.modalTorrentList, data.torrents, searchTitle, mediaObj, isShareMode);
              });
            }
          } else {
            renderTorrentRows(elements.modalTorrentList, filteredTorrents, searchTitle, mediaObj, isShareMode);
          }
        });
      }
      renderTorrentRows(elements.modalTorrentList, data.torrents, searchTitle, mediaObj, isShareMode);
    } else {
      if (elements.modalTorrentFilterBar) elements.modalTorrentFilterBar.classList.add('hidden');
      elements.modalTorrentList.innerHTML = `
        <div class="torrent-empty-state retro-box">
          <span class="material-symbols-outlined" style="font-size: 36px; opacity: 0.7; margin-bottom: 8px;">search_off</span>
          <div class="scramble-text" style="font-weight: 700; font-size: 1.1rem; margin-bottom: 6px;">NO RELEASES FOUND</div>
          <div style="font-family: var(--font-mono); font-size: 12px; opacity: 0.8; margin-bottom: 4px;">No verified swarm torrents found matching "${escapeHtml(searchTitle)}".</div>
          <button type="button" class="btn-try-again" id="modalEmptyRetryBtn">
            <span class="material-symbols-outlined">refresh</span>
            <span>TRY AGAIN</span>
          </button>
        </div>
      `;
      if (window.initScrambler) initScrambler();
      const retryBtn = elements.modalTorrentList.querySelector('#modalEmptyRetryBtn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          fetchTorrentsForModal(searchTitle, type, mediaObj, isShareMode);
        });
      }
    }
  } catch (err) {
    if (elements.modalTorrentFilterBar) elements.modalTorrentFilterBar.classList.add('hidden');
    elements.modalTorrentList.innerHTML = `
      <div class="torrent-empty-state retro-box error">
        <span class="material-symbols-outlined" style="font-size: 36px; color: #ff3333; margin-bottom: 8px;">error</span>
        <div style="font-weight: 700; font-size: 1.1rem; margin-bottom: 6px;">FAILED TO FETCH TORRENTS</div>
        <div style="font-family: var(--font-mono); font-size: 12px; opacity: 0.8; margin-bottom: 4px;">Swarm network indexer encountered an issue.</div>
        <button type="button" class="btn-try-again" id="modalErrorRetryBtn">
          <span class="material-symbols-outlined">refresh</span>
          <span>TRY AGAIN</span>
        </button>
      </div>
    `;
    const retryBtn = elements.modalTorrentList.querySelector('#modalErrorRetryBtn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        fetchTorrentsForModal(searchTitle, type, mediaObj, isShareMode);
      });
    }
  }
}

async function executeTorrentShare(torrent, mediaObj = {}, searchTitle = '') {
  if (!torrent) return;
  const title = mediaObj.title || searchTitle || torrent.name || 'Movie';

  let trailerKey = mediaObj.trailerKey || '';
  if (!trailerKey && mediaObj.id) {
    try {
      const res = await fetch(`/api/details?id=${mediaObj.id}&type=${mediaObj.mediaType || mediaObj.type || 'movie'}`);
      const data = await res.json();
      if (data.success && data.details && data.details.trailerKey) {
        trailerKey = data.details.trailerKey;
      }
    } catch (e) { }
  }

  const queryParams = new URLSearchParams();
  queryParams.set('share', '1');
  queryParams.set('title', title);
  if (mediaObj.year) queryParams.set('year', mediaObj.year);
  if (mediaObj.poster) queryParams.set('poster', mediaObj.poster);
  if (mediaObj.id) queryParams.set('mediaId', mediaObj.id);
  if (mediaObj.mediaType || mediaObj.type) queryParams.set('mediaType', mediaObj.mediaType || mediaObj.type);
  if (torrent.magnet) queryParams.set('magnet', torrent.magnet);
  if (torrent.name) queryParams.set('name', torrent.name);
  if (torrent.sizeFormatted || torrent.size) queryParams.set('size', torrent.sizeFormatted || `${(torrent.size / (1024 * 1024 * 1024)).toFixed(2)} GB`);
  if (torrent.qualityBadge || torrent.quality) queryParams.set('quality', torrent.qualityBadge || torrent.quality);
  if (torrent.seeders !== undefined) queryParams.set('seeds', torrent.seeders);
  if (trailerKey) queryParams.set('trailer', trailerKey);

  const shareUrl = `${window.location.origin}/?${queryParams.toString()}`;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(shareUrl);
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = shareUrl;
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
    showToast('Custom share link copied to clipboard! 🎬', 'success');
  } catch (err) {
    showToast('Custom share link ready!', 'info');
  }

  if (elements.torrentModal) elements.torrentModal.classList.add('hidden');

  renderSharedMovieView({
    title: title,
    year: mediaObj.year || '',
    poster: mediaObj.poster || '',
    magnet: torrent.magnet || '',
    torrentName: torrent.name || title,
    size: torrent.sizeFormatted || (torrent.size ? `${(torrent.size / (1024 * 1024 * 1024)).toFixed(2)} GB` : 'HD'),
    quality: torrent.qualityBadge || '1080P HD',
    seeds: torrent.seeders || 0,
    trailer: trailerKey,
    mediaId: mediaObj.id || '',
    mediaType: mediaObj.mediaType || mediaObj.type || 'movie'
  });
  switchTab('share-view');
}

function openMagnetInTorrentClient(magnetUrl) {
  if (!magnetUrl) return;
  try {
    const tempLink = document.createElement('a');
    tempLink.href = magnetUrl;
    tempLink.style.display = 'none';
    document.body.appendChild(tempLink);
    tempLink.click();
    setTimeout(() => {
      if (tempLink.parentNode) tempLink.parentNode.removeChild(tempLink);
    }, 100);
  } catch (e) {
    window.location.href = magnetUrl;
  }
}

function generateClientTorrentBlob(torrent = {}, title = '') {
  const rawName = torrent.name || title || 'download';
  const defaultTrackers = [
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://open.demonii.com:1337/announce',
    'udp://tracker.openbittorrent.com:6969/announce',
    'udp://open.stealth.si:80/announce',
    'udp://tracker.torrent.eu.org:451/announce'
  ];

  function bencodeStr(s) {
    const enc = new TextEncoder().encode(s);
    return new Uint8Array([...new TextEncoder().encode(`${enc.length}:`), ...enc]);
  }
  function bencodeInt(n) {
    return new TextEncoder().encode(`i${Math.floor(n)}e`);
  }
  function concatBuffers(bufs) {
    const totalLen = bufs.reduce((acc, b) => acc + b.length, 0);
    const out = new Uint8Array(totalLen);
    let offset = 0;
    for (const b of bufs) {
      out.set(b, offset);
      offset += b.length;
    }
    return out;
  }

  // Extract trackers from magnet if present, ensuring valid URLs with /announce
  const rawTrackers = [];
  if (torrent.magnet) {
    try {
      const decoded = torrent.magnet.includes('%') ? decodeURIComponent(torrent.magnet) : torrent.magnet;
      const matches = decoded.matchAll(/[?&]tr=([^&]+)/gi);
      for (const m of matches) {
        try {
          const tr = decodeURIComponent(m[1].replace(/\+/g, ' ')).trim();
          if (tr) rawTrackers.push(tr);
        } catch (_) {
          if (m[1]) rawTrackers.push(m[1].trim());
        }
      }
    } catch (_) {}
  }

  const cleanTrackers = [];
  const seenTrackers = new Set();
  for (let tr of [...rawTrackers, ...defaultTrackers]) {
    if (!tr || typeof tr !== 'string') continue;
    tr = tr.trim();
    if (!/^[a-zA-Z0-9+-.]+:\/\//.test(tr)) tr = 'udp://' + tr;
    try {
      const u = new URL(tr);
      const proto = u.protocol.toLowerCase();
      if (!['udp:', 'http:', 'https:', 'wss:', 'ws:'].includes(proto)) continue;
      if (!u.hostname) continue;
      if (proto === 'udp:' || proto === 'http:' || proto === 'https:') {
        if (!u.pathname || u.pathname === '/' || !u.pathname.toLowerCase().endsWith('/announce')) {
          const basePath = (u.pathname && u.pathname !== '/') ? u.pathname.replace(/\/+$/, '') : '';
          u.pathname = `${basePath}/announce`;
        }
      }
      const norm = u.toString().replace(/\/+$/, '');
      if (!seenTrackers.has(norm)) {
        seenTrackers.add(norm);
        cleanTrackers.push(norm);
      }
    } catch (_) {}
  }
  const trackers = cleanTrackers.length > 0 ? cleanTrackers : defaultTrackers;

  let hashHex = torrent.infoHash || '';
  if (!hashHex && torrent.magnet) {
    const m = torrent.magnet.match(/xt=urn:btih:([a-zA-Z0-9]{32,40})/i);
    if (m) {
      const rawHash = m[1];
      if (rawHash.length === 40) {
        hashHex = rawHash.toLowerCase();
      } else if (rawHash.length === 32) {
        const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        let bits = '';
        for (const char of rawHash.toUpperCase()) {
          const val = base32Alphabet.indexOf(char);
          if (val !== -1) bits += val.toString(2).padStart(5, '0');
        }
        let hex = '';
        for (let i = 0; i + 8 <= bits.length; i += 8) {
          hex += parseInt(bits.substring(i, i + 8), 2).toString(16).padStart(2, '0');
        }
        if (hex.length === 40) hashHex = hex.toLowerCase();
      }
    }
  }

  const pieceLen = 262144;
  const totalLen = torrent.size ? parseInt(torrent.size, 10) : 1073741824;
  const numPieces = Math.max(1, Math.ceil(totalLen / pieceLen));

  const singlePiece = new Uint8Array(20);
  if (hashHex && hashHex.length === 40) {
    for (let i = 0; i < 20; i++) {
      singlePiece[i] = parseInt(hashHex.substr(i * 2, 2), 16) || 0;
    }
  }

  const piecesBuf = new Uint8Array(numPieces * 20);
  for (let i = 0; i < numPieces; i++) {
    piecesBuf.set(singlePiece, i * 20);
  }

  const dStart = new TextEncoder().encode('d');
  const dEnd = new TextEncoder().encode('e');
  const lStart = new TextEncoder().encode('l');
  const lEnd = new TextEncoder().encode('e');

  const announceKey = bencodeStr('announce');
  const announceVal = bencodeStr(trackers[0]);

  const announceListKey = bencodeStr('announce-list');
  const announceListBufs = [lStart];
  for (const tr of trackers) {
    announceListBufs.push(lStart, bencodeStr(tr), lEnd);
  }
  announceListBufs.push(lEnd);
  const announceListVal = concatBuffers(announceListBufs);

  const commentKey = bencodeStr('comment');
  const commentVal = bencodeStr(`MoodFlix Release - ${rawName}`);

  const createdByKey = bencodeStr('created by');
  const createdByVal = bencodeStr('MoodFlix/2.0');

  const creationDateKey = bencodeStr('creation date');
  const creationDateVal = bencodeInt(Math.floor(Date.now() / 1000));

  const infoKey = bencodeStr('info');
  const infoLenKey = bencodeStr('length');
  const infoLenVal = bencodeInt(totalLen);
  const infoNameKey = bencodeStr('name');
  const infoNameVal = bencodeStr(rawName);
  const infoPieceLenKey = bencodeStr('piece length');
  const infoPieceLenVal = bencodeInt(pieceLen);
  const infoPiecesKey = bencodeStr('pieces');
  const infoPiecesLen = new TextEncoder().encode(`${piecesBuf.length}:`);
  const infoPiecesVal = concatBuffers([infoPiecesLen, piecesBuf]);

  const infoBuf = concatBuffers([
    dStart,
    infoLenKey, infoLenVal,
    infoNameKey, infoNameVal,
    infoPieceLenKey, infoPieceLenVal,
    infoPiecesKey, infoPiecesVal,
    dEnd
  ]);

  const allBuf = concatBuffers([
    dStart,
    announceKey, announceVal,
    announceListKey, announceListVal,
    commentKey, commentVal,
    createdByKey, createdByVal,
    creationDateKey, creationDateVal,
    infoKey, infoBuf,
    dEnd
  ]);

  return new Blob([allBuf], { type: 'application/x-bittorrent' });
}

async function triggerDownloadDirect(title, torrent) {
  if (!torrent) return;

  const rawName = torrent.name || title || 'download';
  const cleanName = rawName.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'download';

  if (torrent.magnet || torrent.infoHash || torrent.torrentUrl) {
    const params = new URLSearchParams({
      magnet: torrent.magnet || '',
      hash: torrent.infoHash || '',
      name: torrent.name || '',
      title: title || '',
      torrentUrl: torrent.torrentUrl || '',
      size: torrent.size ? String(torrent.size) : ''
    });

    try {
      const res = await fetch(`/api/torrent/download?${params.toString()}`);

      let blob;
      if (res.ok && res.status === 200) {
        blob = await res.blob();
      } else {
        blob = generateClientTorrentBlob(torrent, title);
      }

      const blobUrl = window.URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.style.display = 'none';
      downloadLink.href = blobUrl;
      downloadLink.download = `${cleanName}.torrent`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      setTimeout(() => {
        document.body.removeChild(downloadLink);
        window.URL.revokeObjectURL(blobUrl);
      }, 2000);

      showToast(`Downloaded ${cleanName}.torrent 📥`, 'success');
    } catch (err) {
      try {
        const blob = generateClientTorrentBlob(torrent, title);
        const blobUrl = window.URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.style.display = 'none';
        downloadLink.href = blobUrl;
        downloadLink.download = `${cleanName}.torrent`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        setTimeout(() => {
          document.body.removeChild(downloadLink);
          window.URL.revokeObjectURL(blobUrl);
        }, 2000);
        showToast(`Downloaded ${cleanName}.torrent 📥`, 'success');
      } catch (clientErr) {
        showToast('Failed to download .torrent file', 'error');
      }
    }
  } else {
    showToast('No download link available for this release', 'error');
  }

  // Record download in storage history
  fetch('/api/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ movieTitle: title, torrent, openMagnet: false })
  }).catch(() => { });
}

window.copyMagnetLink = async function (magnetDec, showSuccessToast = true) {
  const magnet = decodeURIComponent(magnetDec);
  if (!magnet) {
    showToast('No magnet link available', 'error');
    return;
  }
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(magnet);
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = magnet;
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
    if (showSuccessToast) {
      showToast('Magnet link copied to clipboard! 🧲', 'success');
    }
  } catch (err) {
    if (showSuccessToast) {
      showToast('Failed to copy magnet link', 'error');
    }
  }
};

window.shareSelectedTorrent = function (titleDec, torrentStr, mediaStr) {
  const title = decodeURIComponent(titleDec);
  let torrent = {};
  try {
    torrent = JSON.parse(decodeURIComponent(torrentStr || '{}'));
  } catch (e) { }
  let media = {};
  try {
    media = JSON.parse(decodeURIComponent(mediaStr || '{}'));
  } catch (e) { }
  executeTorrentShare(torrent, media, title);
};

window.triggerDownload = function (titleDec, torrentStr) {
  const title = decodeURIComponent(titleDec);
  let torrent = {};
  try {
    torrent = JSON.parse(decodeURIComponent(torrentStr));
  } catch (e) { }
  triggerDownloadDirect(title, torrent);
};

// Register Service Worker for PWA Support (auto-unregister in localhost dev to ensure fresh code)
if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      navigator.serviceWorker.getRegistrations().then(regs => {
        for (const reg of regs) reg.unregister();
      });
      if ('caches' in window) {
        caches.keys().then(keys => {
          for (const k of keys) caches.delete(k);
        });
      }
    } else {
      navigator.serviceWorker.register('/sw.js').catch(() => { });
    }
  });
}


// Character & Artist Autocomplete Directory
const POPULAR_CHARACTER_SUGGESTIONS = [
  { name: 'Rajesh Koothrappali', type: 'character', detail: 'The Big Bang Theory • Kunal Nayyar' },
  { name: 'Howard Wolowitz', type: 'character', detail: 'The Big Bang Theory • Simon Helberg' },
  { name: 'Penny', type: 'character', detail: 'The Big Bang Theory • Kaley Cuoco' },
  { name: 'Sheldon Cooper', type: 'character', detail: 'The Big Bang Theory • Jim Parsons' },
  { name: 'Leonard Hofstadter', type: 'character', detail: 'The Big Bang Theory • Johnny Galecki' },
  { name: 'Phil Dunphy', type: 'character', detail: 'Modern Family • Ty Burrell' },
  { name: 'Alex Dunphy', type: 'character', detail: 'Modern Family • Ariel Winter' },
  { name: 'Claire Dunphy', type: 'character', detail: 'Modern Family • Julie Bowen' },
  { name: 'Haley Dunphy', type: 'character', detail: 'Modern Family • Sarah Hyland' },
  { name: 'Luke Dunphy', type: 'character', detail: 'Modern Family • Nolan Gould' },
  { name: 'Gloria Delgado-Pritchett', type: 'character', detail: 'Modern Family • Sofía Vergara' },
  { name: 'Jay Pritchett', type: 'character', detail: 'Modern Family • Ed O\'Neill' },
  { name: 'Cameron Tucker', type: 'character', detail: 'Modern Family • Eric Stonestreet' },
  { name: 'Mitchell Pritchett', type: 'character', detail: 'Modern Family • Jesse Tyler Ferguson' },
  { name: 'Barney Stinson', type: 'character', detail: 'How I Met Your Mother • Neil Patrick Harris' },
  { name: 'Walter White', type: 'character', detail: 'Breaking Bad • Bryan Cranston' },
  { name: 'Jesse Pinkman', type: 'character', detail: 'Breaking Bad • Aaron Paul' },
  { name: 'Saul Goodman', type: 'character', detail: 'Better Call Saul • Bob Odenkirk' },
  { name: 'Gus Fring', type: 'character', detail: 'Breaking Bad • Giancarlo Esposito' },
  { name: 'Tommy Shelby', type: 'character', detail: 'Peaky Blinders • Cillian Murphy' },
  { name: 'Arthur Shelby', type: 'character', detail: 'Peaky Blinders • Paul Anderson' },
  { name: 'Paul Atreides', type: 'character', detail: 'Dune • Timothée Chalamet' },
  { name: 'Batman', type: 'character', detail: 'Christian Bale, Robert Pattinson, Ben Affleck' },
  { name: 'The Joker', type: 'character', detail: 'Heath Ledger, Joaquin Phoenix' },
  { name: 'Superman', type: 'character', detail: 'Henry Cavill, Christopher Reeve' },
  { name: 'Spider-Man', type: 'character', detail: 'Tom Holland, Tobey Maguire, Andrew Garfield' },
  { name: 'Iron Man', type: 'character', detail: 'Marvel MCU • Robert Downey Jr.' },
  { name: 'Deadpool', type: 'character', detail: 'Marvel Universe • Ryan Reynolds' },
  { name: 'Wolverine', type: 'character', detail: 'X-Men / Deadpool • Hugh Jackman' },
  { name: 'Kendall Roy', type: 'character', detail: 'Succession • Jeremy Strong' },
  { name: 'Logan Roy', type: 'character', detail: 'Succession • Brian Cox' },
  { name: 'Homelander', type: 'character', detail: 'The Boys • Antony Starr' },
  { name: 'Billy Butcher', type: 'character', detail: 'The Boys • Karl Urban' },
  { name: 'Jon Snow', type: 'character', detail: 'Game of Thrones • Kit Harington' },
  { name: 'Daenerys Targaryen', type: 'character', detail: 'Game of Thrones • Emilia Clarke' },
  { name: 'Daemon Targaryen', type: 'character', detail: 'House of the Dragon • Matt Smith' },
  { name: 'Michael Scott', type: 'character', detail: 'The Office • Steve Carell' },
  { name: 'Dwight Schrute', type: 'character', detail: 'The Office • Rainn Wilson' },
  { name: 'Rust Cohle', type: 'character', detail: 'True Detective • Matthew McConaughey' },
  { name: 'Hans Landa', type: 'character', detail: 'Inglourious Basterds • Christoph Waltz' },
  { name: 'Dom Cobb', type: 'character', detail: 'Inception • Leonardo DiCaprio' },
  { name: 'John Wick', type: 'character', detail: 'Keanu Reeves' },
  { name: 'Neo', type: 'character', detail: 'The Matrix • Keanu Reeves' },
  { name: 'The Mandalorian', type: 'character', detail: 'Pedro Pascal' },
  { name: 'Joel Miller', type: 'character', detail: 'The Last of Us • Pedro Pascal' },
  { name: 'Ellie Williams', type: 'character', detail: 'The Last of Us • Bella Ramsey' },
  { name: 'Luffy', type: 'character', detail: 'One Piece • Iñaki Godoy' },
  { name: 'Wednesday Addams', type: 'character', detail: 'Jenna Ortega, Christina Ricci' },
  { name: 'Albus Dumbledore', type: 'character', detail: 'Harry Potter • Michael Gambon, Richard Harris' },
  { name: 'Gandalf', type: 'character', detail: 'Lord of the Rings • Ian McKellen' },
  { name: 'Tony Soprano', type: 'character', detail: 'The Sopranos • James Gandolfini' },
  { name: 'Patrick Bateman', type: 'character', detail: 'American Psycho • Christian Bale' },
  { name: 'Tyler Durden', type: 'character', detail: 'Fight Club • Brad Pitt' },
  { name: 'Chani', type: 'character', detail: 'Dune • Zendaya' }
];

function setupArtistSearchSuggestions() {
  const input = elements.directSearchInput;
  const dropdown = document.getElementById('artistSearchSuggestions');
  if (!input || !dropdown) return;

  let activeIndex = -1;

  function closeSuggestions() {
    dropdown.classList.add('hidden');
    dropdown.innerHTML = '';
    activeIndex = -1;
  }

  input.addEventListener('input', () => {
    const val = input.value.trim().toLowerCase();
    if (val.length < 2) {
      closeSuggestions();
      return;
    }

    const matches = POPULAR_CHARACTER_SUGGESTIONS.filter(item =>
      item.name.toLowerCase().includes(val) || (item.detail && item.detail.toLowerCase().includes(val))
    ).slice(0, 6);

    if (matches.length === 0) {
      closeSuggestions();
      return;
    }

    dropdown.innerHTML = matches.map((m, idx) => `
      <div class="char-suggestion-item" data-idx="${idx}" data-name="${escapeHtml(m.name)}">
        <span class="char-sugg-icon">🎭</span>
        <div class="char-sugg-info">
          <strong class="char-sugg-name">${escapeHtml(m.name)}</strong>
          <span class="char-sugg-actor">${escapeHtml(m.detail)}</span>
        </div>
      </div>
    `).join('');
    dropdown.classList.remove('hidden');
    activeIndex = -1;

    dropdown.querySelectorAll('.char-suggestion-item').forEach(el => {
      el.addEventListener('click', () => {
        const queryName = el.dataset.name;
        if (queryName) {
          input.value = queryName;
          closeSuggestions();
          performDirectSearch(queryName);
        }
      });
    });
  });

  input.addEventListener('keydown', (e) => {
    if (dropdown.classList.contains('hidden')) return;
    const items = dropdown.querySelectorAll('.char-suggestion-item');
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % items.length;
      items.forEach((it, i) => it.classList.toggle('active', i === activeIndex));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + items.length) % items.length;
      items.forEach((it, i) => it.classList.toggle('active', i === activeIndex));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && items[activeIndex]) {
        e.preventDefault();
        const selName = items[activeIndex].dataset.name;
        input.value = selName;
        closeSuggestions();
        performDirectSearch(selName);
      }
    } else if (e.key === 'Escape') {
      closeSuggestions();
    }
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      closeSuggestions();
    }
  });
}
