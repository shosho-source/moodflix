/**
 * The Movie & TV Cine - Retro Brutalist Edition
 */

// State
const state = {
  movies: [],
  tvShows: [],
  history: [],
  settings: {},
  activeTab: 'diagnostic-view',
  lastFeedTab: 'movies-view',
  previousTab: 'diagnostic-view',
  currentMediaForModal: null,
  currentTorrents: [],
  isSharedPage: false
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
  movieCategorySelect: document.getElementById('movieCategorySelect'),
  
  tvGrid: document.getElementById('tvGrid'),
  tvSearchInput: document.getElementById('tvSearchInput'),
  btnClearTvSearch: document.getElementById('btnClearTvSearch'),
  btnExecuteTvSearch: document.getElementById('btnExecuteTvSearch'),
  tvCategorySelect: document.getElementById('tvCategorySelect'),
  
  directSearchForm: document.getElementById('directSearchForm'),
  directSearchInput: document.getElementById('directSearchInput'),
  directCategory: document.getElementById('directCategory'),
  directMinSeeds: document.getElementById('directMinSeeds'),
  directSearchResults: document.getElementById('directSearchResults'),

  torrentModal: document.getElementById('torrentModal'),
  modalMovieTitle: document.getElementById('modalMovieTitle'),
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
  detailShareBtn: document.getElementById('detailShareBtn')
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
      await showAuthView();
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
          if (!state.isSharedPage) await showAuthView();
        }
      });
      await checkSession();
      return;
    }
  } catch (err) {
    console.warn('Failed to load backend config:', err);
  }

  try {
    localStorage.removeItem('moodflix_bypass_auth');
  } catch (e) {}

  if (isShared) {
    switchTab('share-view');
  } else {
    await showAuthView();
  }
}

async function checkSession() {
  if (supabaseClient) {
    const { data } = await supabaseClient.auth.getSession();
    if (data && data.session && data.session.user) {
      await showDashboardView(data.session.user);
      return;
    }
  }
  if (state.isSharedPage) {
    switchTab('share-view');
  } else {
    await showAuthView();
  }
}

async function showAuthView() {
  if (state.isSharedPage) {
    switchTab('share-view');
    return;
  }
  document.getElementById('auth-view').classList.remove('hidden');
  document.querySelectorAll('.view-panel').forEach(v => {
    if (v.id !== 'auth-view') v.classList.add('hidden');
  });
  document.getElementById('user-profile').classList.add('hidden');
  elements.mainNav.style.display = 'none';
  document.getElementById('mobileBottomNav')?.classList.add('hidden');
  document.querySelector('.site-header')?.classList.add('hidden');

  // Ensure cassette hero image is loaded if not complete yet
  const heroImg = document.querySelector('.cassette-img');
  if (heroImg && !heroImg.complete) {
    await new Promise(resolve => {
      heroImg.addEventListener('load', resolve, { once: true });
      heroImg.addEventListener('error', resolve, { once: true });
    });
  }
}

async function showDashboardView(user) {
  state.user = user;
  document.getElementById('auth-view').classList.add('hidden');
  document.getElementById('user-profile').classList.remove('hidden');
  const userDisplay = (user?.email ? user.email.split('@')[0] : (user?.id ? user.id.slice(0, 8) : 'USER')).toUpperCase();
  document.getElementById('user-email').textContent = userDisplay;
  elements.mainNav.style.display = 'flex';
  document.getElementById('mobileBottomNav')?.classList.remove('hidden');
  document.querySelector('.site-header')?.classList.remove('hidden');
  
  // Await movies and TV shows so catalog is completely loaded into DOM before preloader disappears
  const promises = [];
  if (state.movies.length === 0) {
    updatePreloaderStatus('FETCHING CURATED MOVIES...', 65);
    promises.push(loadMovies());
  }
  if (state.tvShows.length === 0) {
    updatePreloaderStatus('FETCHING TV SERIES RELEASES...', 80);
    promises.push(loadTVShows());
  }
  if (promises.length > 0) {
    await Promise.allSettled(promises);
  }

  if (!state.isSharedPage) {
    if (state.activeTab === 'auth-view' || state.activeTab === 'share-view' || state.activeTab === 'movies-view' || document.getElementById('diagnostic-view').classList.contains('hidden')) {
      switchTab('diagnostic-view');
    }
  }
}


async function handleGoogleLogin() {
  const btnText = document.getElementById('login-btn-text');
  if (btnText) btnText.textContent = 'LOGGING IN...';
  
  try {
    if (!supabaseClient) {
      showToast('Supabase Auth is not configured. Entering Local Mode...', 'info');
      showDashboardView({ email: 'local@moodflix.app' });
      return;
    }
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href }
    });
    if (error) {
      showToast('Login error: ' + error.message, 'error');
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
  try {
    localStorage.removeItem('moodflix_bypass_auth');
  } catch (e) {}
  if (supabaseClient) await supabaseClient.auth.signOut();
  showAuthView();
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
      if (trailer) {
        const modal = document.getElementById('trailer-modal');
        const iframe = document.getElementById('trailer-iframe');
        const loader = document.getElementById('trailer-loader');
        modal?.classList.remove('hidden');
        loader?.classList.add('hidden');
        if (iframe) {
          iframe.classList.remove('hidden');
          iframe.src = `https://www.youtube.com/embed/${trailer}?autoplay=1`;
        }
      } else if (mediaId) {
        playTrailer(mediaId, mediaType || 'movie');
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
      } catch (e) {}
      showAuthView();
    };
  }
}

function checkShareUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('share')) {
    state.isSharedPage = true;
    const title = decodeURIComponent(params.get('title') || 'Movie');
    const year = decodeURIComponent(params.get('year') || '');
    const poster = decodeURIComponent(params.get('poster') || '');
    const magnet = decodeURIComponent(params.get('magnet') || '');
    const torrentName = decodeURIComponent(params.get('name') || title);
    const size = decodeURIComponent(params.get('size') || '');
    const quality = decodeURIComponent(params.get('quality') || '1080P HD');
    const seeds = decodeURIComponent(params.get('seeds') || '');
    const trailer = decodeURIComponent(params.get('trailer') || '');
    const mediaId = decodeURIComponent(params.get('mediaId') || '');
    const mediaType = decodeURIComponent(params.get('mediaType') || 'movie');

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

document.getElementById('btnCancelQuiz')?.addEventListener('click', () => {
  switchTab('diagnostic-view');
});

document.getElementById('btnStartDiagnostic')?.addEventListener('click', () => {
  initQuiz();
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
    document.getElementById('btnQuizNext').innerText = 'NEXT >>';
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
      const tabs = ['movies-view', 'tv-view'];
      const randomTab = tabs[Math.floor(Math.random() * tabs.length)];
      switchTab(randomTab);
    });
  }

  // Quick Mood Starter Cards in Explore View
  document.querySelectorAll('.mood-card').forEach(card => {
    card.addEventListener('click', () => {
      const mood = card.dataset.mood;
      handleQuickMoodSelect(mood);
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

  document.getElementById('header-settings-btn')?.addEventListener('click', () => {
    if (state.activeTab === 'settings-view') {
      switchTab(state.previousTab || state.lastFeedTab || 'movies-view');
    } else {
      switchTab('settings-view');
    }
  });

  document.getElementById('btn-close-settings')?.addEventListener('click', () => {
    switchTab(state.previousTab || state.lastFeedTab || 'movies-view');
  });

  // Guest explore button


  // Brand Logos & Tutorial View Nav
  document.getElementById('logo-btn')?.addEventListener('click', () => switchTab(state.isSharedPage ? 'share-view' : (state.lastFeedTab || 'movies-view')));
  document.getElementById('shareTutorialBtn')?.addEventListener('click', () => switchTab('tutorial-view'));
  document.getElementById('tutorial-logo-btn')?.addEventListener('click', () => switchTab(state.isSharedPage ? 'share-view' : (state.lastFeedTab || 'movies-view')));
  document.getElementById('tutorial-back-feed-btn')?.addEventListener('click', () => switchTab(state.isSharedPage ? 'share-view' : (state.lastFeedTab || 'movies-view')));
  document.getElementById('back-to-share-btn')?.addEventListener('click', () => switchTab('share-view'));

  // Movies
  elements.btnClearMovieSearch.addEventListener('click', () => {
    elements.movieSearchInput.value = '';
    const b = document.getElementById('movieTypoBanner');
    if (b) { b.innerHTML = ''; b.classList.add('hidden'); }
    loadMovies();
  });
  elements.movieSearchInput.addEventListener('change', () => loadMovies());
  elements.btnExecuteMovieSearch?.addEventListener('click', () => loadMovies());
  elements.movieCategorySelect.addEventListener('change', () => loadMovies());

  // TV
  elements.btnClearTvSearch.addEventListener('click', () => {
    elements.tvSearchInput.value = '';
    const b = document.getElementById('tvTypoBanner');
    if (b) { b.innerHTML = ''; b.classList.add('hidden'); }
    loadTVShows();
  });
  elements.tvSearchInput.addEventListener('change', () => loadTVShows());
  elements.btnExecuteTvSearch?.addEventListener('click', () => loadTVShows());
  elements.tvCategorySelect.addEventListener('change', () => loadTVShows());

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
    if (fluidInstance && typeof fluidInstance.resume === 'function' && !document.hidden && state.activeTab !== 'tutorial-view') {
      fluidInstance.resume();
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
  
  // Similar Media Scrolling
  const similarContainer = document.getElementById('similarMediaContainer');
  document.getElementById('btnSimilarLeft')?.addEventListener('click', () => {
    if (similarContainer) similarContainer.scrollBy({ left: -320, behavior: 'smooth' });
  });
  document.getElementById('btnSimilarRight')?.addEventListener('click', () => {
    if (similarContainer) similarContainer.scrollBy({ left: 320, behavior: 'smooth' });
  });

  // Diagnostic Navigation
  document.getElementById('btnDiagExit')?.addEventListener('click', () => {
    document.getElementById('diagnosticNav').style.display = 'none';
    state.diagnosticResults = null;
    switchTab('diagnostic-view');
  });

  document.getElementById('btnDiagPrev')?.addEventListener('click', () => {
    if (state.diagnosticResults && state.diagnosticIndex > 0) {
      state.diagnosticIndex--;
      const idx = state.diagnosticIndex;
      const total = state.diagnosticResults.length;
      
      document.getElementById('diagMatchIndex').innerText = idx + 1;
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
      
      document.getElementById('diagMatchIndex').innerText = idx + 1;
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

window.handleArtistCardAction = function(index, action, event) {
  if (event && event.stopPropagation) {
    event.stopPropagation();
  }
  const item = (window.artistCreditsCache || window.actorCreditsCache)[index];
  if (!item) return;
  if (action === 'torrent') {
    openTorrentModal(item, item.mediaType || 'movie');
  } else if (action === 'trailer') {
    playTrailer(item.id, item.mediaType || 'movie');
  } else if (action === 'detail') {
    openDetailView(item, item.mediaType || 'movie');
  }
};
window.handleActorCardAction = window.handleArtistCardAction;

window.fetchArtistDetailsById = async function(artistId) {
  if (!elements.directSearchResults) return;
  elements.directSearchResults.innerHTML = `
    <div class="actor-search-loading artist-search-loading retro-box">
      <div class="actor-loading-spinner artist-loading-spinner"></div>
      <div class="actor-loading-text artist-loading-text scramble-text">LOADING ARTIST FILMOGRAPHY & GOOGLE KNOWLEDGE...</div>
    </div>
  `;

  try {
    const res = await fetch(`/api/artist/${artistId}`);
    const data = await res.json();
    const artistData = data.artist || data.actor;
    if (data.success && artistData) {
      renderArtistFilmography(artistData, state.artistMatches || state.actorMatches || []);
      elements.directSearchResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      showToast('Could not load artist details', 'error');
    }
  } catch (err) {
    showToast('Failed to fetch artist profile', 'error');
  }
};
window.fetchActorDetailsById = window.fetchArtistDetailsById;

function renderFilmographyCards(credits, filter = 'all', sort = 'popularity') {
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
    const characterDisplay = item.character && item.character !== 'Self / Featured' ? `as ${escapeHtml(item.character)}` : '';

    return `
      <div class="movie-card retro-box actor-filmo-card artist-filmo-card" data-index="${index}" data-media-id="${item.id}" data-media-type="${item.mediaType}" tabindex="0" role="button" aria-label="${escapeHtml(item.title)} details" onclick="handleArtistCardAction(${index}, 'detail', event)">
        <div class="movie-poster-wrap">
          <img src="${item.poster || 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=500'}" 
               alt="${escapeHtml(item.title)}" 
               class="movie-poster" 
               loading="lazy" 
               onerror="this.src='https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=500'" />
          <div class="media-type-badge ${isTv ? 'badge-tv' : 'badge-movie'}">${typeLabel}</div>
          <div class="media-rating-pill">${ratingDisplay}</div>
          ${item.isDownloaded ? '<div class="downloaded-badge"><span class="material-symbols-outlined" style="font-size:12px;">check</span> SAVED</div>' : ''}
        </div>
        <div class="movie-card-info">
          <div class="movie-card-header">
            <h3 class="movie-card-title scramble-text" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h3>
            <span class="movie-card-year">${yearDisplay}</span>
          </div>
          ${characterDisplay ? `<div class="actor-card-role artist-card-role" title="${characterDisplay}">${characterDisplay}</div>` : ''}
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

  // Alternative matches strip
  let matchesHtml = '';
  if (matches && matches.length > 1) {
    matchesHtml = `
      <div class="actor-alt-matches artist-alt-matches">
        <span class="alt-matches-label">ALL MATCHES:</span>
        <div class="alt-matches-scroll">
          ${matches.map(m => `
            <button type="button" class="alt-match-btn ${m.id === artist.id ? 'active' : ''}" onclick="fetchArtistDetailsById(${m.id})">
              ${escapeHtml(m.name)}
              ${m.knownFor && m.knownFor.length ? `<span class="alt-match-sub">(${escapeHtml(m.knownFor[0])})</span>` : ''}
            </button>
          `).join('')}
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
  renderFilmographyCards(artist.credits || [], 'all', 'popularity');

  // Filter tabs listeners
  const tabs = elements.directSearchResults.querySelectorAll('.filmo-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const sortSelect = document.getElementById('artistFilmoSort') || document.getElementById('actorFilmoSort');
      const sortVal = sortSelect?.value || 'popularity';
      renderFilmographyCards(artist.credits || [], tab.dataset.filter, sortVal);
    });
  });

  // Sort listener
  const sortSelect = document.getElementById('artistFilmoSort') || document.getElementById('actorFilmoSort');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      const activeFilter = elements.directSearchResults.querySelector('.filmo-tab.active')?.dataset.filter || 'all';
      renderFilmographyCards(artist.credits || [], activeFilter, sortSelect.value);
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
      if (data.correctedQuery || (artistData.name && artistData.name.toLowerCase() !== cleanQuery.toLowerCase())) {
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
              <button type="button" class="retro-btn" style="padding: 6px 14px; font-size: 12px;" onclick="searchRawTorrentsFallback('${escapeHtml(cleanQuery)}')">
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
window.searchRawTorrentsFallback = async function(query) {
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
        <div class="torrent-list-header" style="display:flex; margin-bottom:10px;">
          <span>Release</span>
          <span>Quality</span>
          <span>Seeds/Peers</span>
          <span>Size</span>
          <span>Action</span>
        </div>
        <div class="direct-torrent-list"></div>
      `;
      const listContainer = elements.directSearchResults.querySelector('.direct-torrent-list');
      renderTorrentRows(listContainer, data.torrents, query, { title: query }, false);
    } else {
      elements.directSearchResults.innerHTML = `<div style="padding:28px;text-align:center;font-family:var(--font-mono);">No torrents found for "${escapeHtml(query)}".</div>`;
    }
  } catch (e) {
    elements.directSearchResults.innerHTML = '<div style="padding:28px;text-align:center;font-family:var(--font-mono);color:#ff3333;">Failed to load torrent releases.</div>';
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
  } else if (mood === 'mind') {
    quizAnswers.mood = 'neutral';
    quizAnswers.occasion = 'solo';
    quizAnswers.genres = ['Mystery', 'Science Fiction', 'Thriller'];
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
  if (state.activeTab !== tabId) {
    if (state.activeTab !== 'settings-view' && state.activeTab !== 'tutorial-view') {
      state.previousTab = state.activeTab;
      if (state.activeTab === 'movies-view' || state.activeTab === 'tv-view' || state.activeTab === 'directSearchSection') {
        state.lastFeedTab = state.activeTab;
      }
    }
  }

  state.activeTab = tabId;
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  document.querySelectorAll('.mobile-nav-item').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  document.querySelectorAll('.view-panel').forEach(v => v.classList.toggle('hidden', v.id !== tabId));
  
  const settingsBtn = document.getElementById('header-settings-btn');
  if (settingsBtn) {
    settingsBtn.classList.toggle('active', tabId === 'settings-view');
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
  else if (tabId === 'tv-view' && state.tvShows.length === 0) loadTVShows();
  else if (tabId === 'settings-view') loadSettingsIntoUI();

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
  const search = elements.movieSearchInput.value.trim();
  const category = elements.movieCategorySelect.value;
  try {
    const res = await fetch(`/api/movies?search=${encodeURIComponent(search)}&category=${category}`);
    const data = await res.json();
    if (data.success) {
      state.movies = data.movies;
      renderMediaGrid(elements.movieGrid, data.movies, 'movie');
      updateTypoBanner('movieTypoBanner', search, data.correctedQuery);
    }
  } catch (err) {}
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
  } catch (err) {}
}

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.success) {
      state.settings = data.settings;
    }
  } catch (err) {}
}

async function loadSettingsIntoUI() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.success) {
      state.settings = data.settings;
      document.getElementById('tmdbApiKey').value = state.settings.tmdbApiKey || '';
      document.getElementById('tmdbReadToken').value = state.settings.tmdbReadToken || '';
      document.getElementById('minRating').value = state.settings.minRating || 7.0;
      document.getElementById('minSeeds').value = state.settings.minSeeds || 5;
      document.getElementById('autoOpenMagnets').checked = !!state.settings.autoOpenMagnets;
    }
  } catch (err) {
    showToast('Failed to load settings', 'error');
  }
}

async function saveSettings(e) {
  e.preventDefault();
  const btn = document.querySelector('.submit-settings-btn');
  const originalText = btn.innerText;
  btn.innerText = 'SAVING...';
  
  const payload = {
    tmdbApiKey: document.getElementById('tmdbApiKey').value,
    tmdbReadToken: document.getElementById('tmdbReadToken').value,
    minRating: parseFloat(document.getElementById('minRating').value) || 7.0,
    minSeeds: parseInt(document.getElementById('minSeeds').value, 10) || 5,
    autoOpenMagnets: document.getElementById('autoOpenMagnets').checked
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
    btn.innerText = originalText;
  }
}

function renderMediaGrid(container, items, type) {
  const now = new Date();
  container.innerHTML = items.map((m, idx) => {
    let unreleasedHtml = '';
    if (m.releaseDate) {
      const rDate = new Date(m.releaseDate);
      if (rDate > now) {
        unreleasedHtml = '<div class="unreleased-badge">UNRELEASED</div>';
      }
    }
    const safeTitle = escapeHtml(m.title);
    const safeYear = escapeHtml(m.year);
    const safePoster = escapeHtml(m.poster);
    return `
      <div class="movie-card" data-idx="${idx}">
        ${unreleasedHtml}
        <img src="${safePoster}" alt="${safeTitle}">
        <h3>${safeTitle} (${safeYear})</h3>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.movie-card').forEach(card => {
    card.addEventListener('click', () => {
      const idx = card.dataset.idx;
      openDetailView(items[idx], type);
    });
  });
}

function openDetailView(m, type, isDiagnostic = false) {
  if (state.activeTab !== 'detail-view') {
    state.lastFeedTab = state.activeTab;
  }
  
  if (!isDiagnostic) {
    const diagnosticNav = document.getElementById('diagnosticNav');
    if (diagnosticNav) diagnosticNav.style.display = 'none';
  }

  elements.detailPoster.src = m.poster;
  elements.detailTitle.innerText = m.title;
  elements.detailTitle.dataset.text = m.title;
  elements.detailMeta.innerText = `★ ${m.rating} / 10  •  ${m.year}  •  ${type.toUpperCase()}`;
  elements.detailSynopsis.innerText = m.synopsis || 'No synopsis available.';

  elements.detailTorrentsBtn.onclick = () => openTorrentModal(m, type, false);
  elements.detailTrailerBtn.onclick = () => playTrailer(m.id, type);
  elements.detailShareBtn.onclick = () => openTorrentModal(m, type, true);

  switchTab('detail-view');
  window.scrollTo(0, 0);

  // Load similar media
  loadSimilarMedia(m.id, type);
}

async function loadSimilarMedia(id, type) {
  const container = document.getElementById('similarMediaContainer');
  const section = document.getElementById('similarSection');
  if (!container || !section) return;

  section.style.display = 'none';
  container.innerHTML = 'Loading...';

  try {
    const res = await fetch(`/api/media/${id}/similar?type=${type}`);
    const data = await res.json();
    if (data.success && data.items && data.items.length > 0) {
      container.innerHTML = data.items.map((m, idx) => {
        const safeTitle = escapeHtml(m.title);
        const safeYear = escapeHtml(m.year);
        const safePoster = escapeHtml(m.poster);
        return `
          <div class="movie-card" data-idx="${idx}" style="cursor: pointer;">
            <img src="${safePoster}" alt="${safeTitle}">
            <h3>${safeTitle} (${safeYear})</h3>
          </div>
        `;
      }).join('');

      container.querySelectorAll('.movie-card').forEach(card => {
        card.addEventListener('click', () => {
          const idx = card.dataset.idx;
          openDetailView(data.items[idx], type);
        });
      });
      section.style.display = 'block';
    } else {
      container.innerHTML = '';
    }
  } catch (err) {
    console.error('Failed to load similar media', err);
    container.innerHTML = '';
  }
}

function renderTorrentRows(container, torrents, searchTitle, mediaObj = {}, isShareMode = false) {
  if (!container) return;
  if (!torrents || torrents.length === 0) {
    container.innerHTML = '<div style="padding:24px;text-align:center;font-family:var(--font-mono);font-size:0.9rem;">No torrents found.</div>';
    return;
  }

  const rowsHtml = torrents.map((t, i) => {
    const safeName = escapeHtml(t.name);
    const safeQuality = escapeHtml(t.qualityBadge || 'HD');
    const safeSeeds = escapeHtml(t.seeders !== undefined ? t.seeders : 0);
    const safePeers = escapeHtml(t.leechers !== undefined ? t.leechers : 0);
    const safeSize = escapeHtml(t.sizeFormatted || (t.size ? `${(t.size / (1024*1024*1024)).toFixed(2)} GB` : 'N/A'));

    return `
      <div class="torrent-row ${isShareMode ? 'torrent-share-row' : ''}" data-idx="${i}" style="cursor: pointer;">
        <span class="torrent-name" title="${safeName}">#${i+1} ${safeName}</span>
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

async function loadTVSeasonsAccordion(m) {
  elements.modalTorrentList.innerHTML = getTorrentLoadingHtml(
    `RETRIEVING ${m.title.toUpperCase()} SEASONS...`,
    'Loading season catalog from TMDB & metadata indexers...'
  );
  if (window.initScrambler) initScrambler();

  const fetchStart = Date.now();
  const MIN_ANIMATION_MS = 650;

  try {
    const res = await fetch(`/api/details?id=${m.id}&type=tv`);
    const data = await res.json();

    const elapsed = Date.now() - fetchStart;
    if (elapsed < MIN_ANIMATION_MS) {
      await new Promise(r => setTimeout(r, MIN_ANIMATION_MS - elapsed));
    }

    if (data.success && data.details && data.details.seasons) {
      const seasons = data.details.seasons.filter(s => s.season_number > 0);
      elements.modalTorrentList.innerHTML = seasons.map(s => `
        <div class="accordion-item" id="season-acc-${s.season_number}">
          <button class="accordion-btn" onclick="toggleSeasonAccordion(${s.season_number}, '${encodeURIComponent(JSON.stringify(m))}')">
            Season ${s.season_number} <span>▼</span>
          </button>
          <div class="accordion-content" id="season-content-${s.season_number}"></div>
        </div>
      `).join('');
    } else {
      elements.modalTorrentList.innerHTML = '<div style="padding:20px;text-align:center;font-family:var(--font-mono);">No seasons found.</div>';
    }
  } catch (err) {
    elements.modalTorrentList.innerHTML = '<div style="padding:20px;text-align:center;font-family:var(--font-mono);color:#ff3333;">Failed to load seasons.</div>';
  }
}

window.toggleSeasonAccordion = async function(seasonNumber, mStr) {
  const m = JSON.parse(decodeURIComponent(mStr));
  const content = document.getElementById(`season-content-${seasonNumber}`);
  const isExpanded = content.classList.contains('expanded');
  
  if (isExpanded) {
    content.classList.remove('expanded');
    return;
  }
  
  content.classList.add('expanded');
  if (content.innerHTML === '') {
    content.innerHTML = getTorrentLoadingHtml(
      `LOADING ${m.title.toUpperCase()} SEASON ${seasonNumber} EPISODES...`,
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

      if (data.success && data.episodes && data.episodes.episodes) {
        const now = new Date();
        content.innerHTML = data.episodes.episodes.map(e => {
          let isUnreleased = false;
          if (e.air_date) {
            const airDate = new Date(e.air_date);
            if (airDate > now) isUnreleased = true;
          }
          const unreleasedClass = isUnreleased ? 'unreleased' : '';
          return `
            <button class="episode-btn ${unreleasedClass}" onclick="toggleEpisodeAccordion(${seasonNumber}, ${e.episode_number}, '${encodeURIComponent(JSON.stringify(m))}')">
              Ep ${e.episode_number}: ${e.name}
            </button>
            <div class="episode-content" id="ep-content-${seasonNumber}-${e.episode_number}"></div>
          `;
        }).join('');
      } else {
        content.innerHTML = '<div style="padding:10px;text-align:center;font-family:var(--font-mono);">No episodes found.</div>';
      }
    } catch (err) {
      content.innerHTML = '<div style="padding:10px;text-align:center;font-family:var(--font-mono);color:#ff3333;">Failed to load episodes.</div>';
    }
  }
};

window.toggleEpisodeAccordion = async function(seasonNumber, episodeNumber, mStr) {
  const m = JSON.parse(decodeURIComponent(mStr));
  const content = document.getElementById(`ep-content-${seasonNumber}-${episodeNumber}`);
  const isExpanded = content.classList.contains('expanded');
  
  if (isExpanded) {
    content.classList.remove('expanded');
    return;
  }
  
  content.classList.add('expanded');
  if (content.innerHTML === '') {
    const searchTitle = `${m.title} S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`;
    content.innerHTML = getTorrentLoadingHtml(
      `SCANNING SWARM FOR ${searchTitle}...`,
      'Querying TV release groups & verified seeders...'
    );
    if (window.initScrambler) initScrambler();

    const fetchStart = Date.now();
    const MIN_ANIMATION_MS = 650;
    
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchTitle)}&minSeeds=0&category=205`);
      const data = await res.json();

      const elapsed = Date.now() - fetchStart;
      if (elapsed < MIN_ANIMATION_MS) {
        await new Promise(r => setTimeout(r, MIN_ANIMATION_MS - elapsed));
      }

      if (data.success) {
        const epStr = `s${String(seasonNumber).padStart(2, '0')}e${String(episodeNumber).padStart(2, '0')}`;
        const filteredTorrents = (data.torrents || []).filter(t => t.name.toLowerCase().includes(epStr));
        
        if (filteredTorrents.length === 0) {
           content.innerHTML = '<div style="padding:14px;text-align:center;font-family:var(--font-mono);font-size:12px;">No torrents found matching this exact episode.</div>';
        } else {
          content.innerHTML = `
            <div class="torrent-list-header" style="display:flex; margin-bottom:10px;">
              <span>Release</span><span>Quality</span><span>Seeds/Peers</span><span>Size</span><span>Action</span>
            </div>
            <div class="ep-torrent-items"></div>
          `;
          const itemsContainer = content.querySelector('.ep-torrent-items');
          renderTorrentRows(itemsContainer, filteredTorrents, searchTitle, { ...m, mediaType: 'tv', season: seasonNumber, episode: episodeNumber }, false);
        }
      }
    } catch (err) {
      content.innerHTML = '<div style="padding:14px;text-align:center;font-family:var(--font-mono);font-size:12px;color:#ff3333;">Failed to fetch torrents.</div>';
    }
  }
};

async function playTrailer(id, type) {
  const modal = document.getElementById('trailer-modal');
  const iframe = document.getElementById('trailer-iframe');
  const loader = document.getElementById('trailer-loader');

  // Pause background fluid simulation during video playback to optimize GPU/CPU
  if (fluidInstance && typeof fluidInstance.pause === 'function') {
    fluidInstance.pause();
  }

  // Trigger popup immediately and show loader
  modal.classList.remove('hidden');
  iframe.classList.add('hidden');
  loader.classList.remove('hidden');
  iframe.src = ''; // Clear old trailer

  try {
    const res = await fetch(`/api/details?id=${id}&type=${type}`);
    const data = await res.json();
    if (data.success && data.details && data.details.trailerKey) {
      iframe.onload = () => {
        loader.classList.add('hidden');
        iframe.classList.remove('hidden');
      };
      iframe.src = `https://www.youtube.com/embed/${data.details.trailerKey}?autoplay=1`;
    } else {
      modal.classList.add('hidden');
      if (fluidInstance && typeof fluidInstance.resume === 'function' && !document.hidden && state.activeTab !== 'tutorial-view') {
        fluidInstance.resume();
      }
      showToast('No trailer found', 'error');
    }
  } catch (err) {
    modal.classList.add('hidden');
    if (fluidInstance && typeof fluidInstance.resume === 'function' && !document.hidden && state.activeTab !== 'tutorial-view') {
      fluidInstance.resume();
    }
    showToast('Failed to load trailer', 'error');
  }
}

async function openTorrentModal(m, type, isShareMode = false) {
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
    loadTVSeasonsAccordion(m);
  } else {
    if (elements.modalTorrentHeader) elements.modalTorrentHeader.classList.remove('hidden');
    fetchTorrentsForModal(m.title, type, m, isShareMode);
  }
}

async function fetchTorrentsForModal(searchTitle, type, mediaObj = {}, isShareMode = false) {
  elements.modalTorrentList.innerHTML = getTorrentLoadingHtml(
    `SCANNING SWARM FOR "${searchTitle.toUpperCase()}"...`,
    'Connecting to The Cine Bay & P2P DHT nodes to filter high-seed releases...'
  );
  if (window.initScrambler) initScrambler();

  const fetchStart = Date.now();
  const MIN_ANIMATION_MS = 650;

  try {
    const category = type === 'tv' ? '205' : '200';
    const res = await fetch(`/api/search?q=${encodeURIComponent(searchTitle)}&minSeeds=0&category=${category}`);
    const data = await res.json();

    const elapsed = Date.now() - fetchStart;
    if (elapsed < MIN_ANIMATION_MS) {
      await new Promise(r => setTimeout(r, MIN_ANIMATION_MS - elapsed));
    }

    if (data.success && data.torrents && data.torrents.length > 0) {
      renderTorrentRows(elements.modalTorrentList, data.torrents, searchTitle, mediaObj, isShareMode);
    } else {
      elements.modalTorrentList.innerHTML = `
        <div class="torrent-empty-state retro-box">
          <span class="material-symbols-outlined" style="font-size: 36px; opacity: 0.7; margin-bottom: 8px;">search_off</span>
          <div class="scramble-text" style="font-weight: 700; font-size: 1.1rem; margin-bottom: 6px;">NO RELEASES FOUND</div>
          <div style="font-family: var(--font-mono); font-size: 12px; opacity: 0.8;">No verified swarm torrents found matching "${escapeHtml(searchTitle)}".</div>
        </div>
      `;
      if (window.initScrambler) initScrambler();
    }
  } catch (err) {
    elements.modalTorrentList.innerHTML = `
      <div class="torrent-empty-state retro-box error">
        <span class="material-symbols-outlined" style="font-size: 36px; color: #ff3333; margin-bottom: 8px;">error</span>
        <div style="font-weight: 700; font-size: 1.1rem; margin-bottom: 6px;">FAILED TO FETCH TORRENTS</div>
        <div style="font-family: var(--font-mono); font-size: 12px; opacity: 0.8; margin-bottom: 12px;">Swarm network indexer encountered an issue.</div>
        <button type="button" class="retro-btn" onclick="fetchTorrentsForModal('${escapeHtml(searchTitle)}', '${type}', {}, ${isShareMode})">RETRY SCAN</button>
      </div>
    `;
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
    } catch (e) {}
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
  if (torrent.sizeFormatted || torrent.size) queryParams.set('size', torrent.sizeFormatted || `${(torrent.size / (1024*1024*1024)).toFixed(2)} GB`);
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
    size: torrent.sizeFormatted || (torrent.size ? `${(torrent.size / (1024*1024*1024)).toFixed(2)} GB` : 'HD'),
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
  const trackers = [
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://open.demonii.com:1337/announce',
    'udp://tracker.openbittorrent.com:6969/announce',
    'udp://open.stealth.si:80/announce'
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

  let hashHex = torrent.infoHash || '';
  if (!hashHex && torrent.magnet) {
    const m = torrent.magnet.match(/xt=urn:btih:([a-zA-Z0-9]{32,40})/i);
    if (m) hashHex = m[1];
  }

  const pieceLen = 262144;
  const totalLen = torrent.size ? parseInt(torrent.size, 10) : 1073741824;

  const pieceBytes = new Uint8Array(20);
  if (hashHex && hashHex.length === 40) {
    for (let i = 0; i < 20; i++) {
      pieceBytes[i] = parseInt(hashHex.substr(i * 2, 2), 16) || 0;
    }
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
  const infoPiecesLen = new TextEncoder().encode(`${pieceBytes.length}:`);
  const infoPiecesVal = concatBuffers([infoPiecesLen, pieceBytes]);

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
  
  if (torrent.magnet || torrent.infoHash) {
    const params = new URLSearchParams({
      magnet: torrent.magnet || '',
      hash: torrent.infoHash || '',
      name: torrent.name || '',
      title: title || ''
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
  }).catch(() => {});
}

window.copyMagnetLink = async function(magnetDec, showSuccessToast = true) {
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

window.shareSelectedTorrent = function(titleDec, torrentStr, mediaStr) {
  const title = decodeURIComponent(titleDec);
  let torrent = {};
  try {
    torrent = JSON.parse(decodeURIComponent(torrentStr || '{}'));
  } catch (e) {}
  let media = {};
  try {
    media = JSON.parse(decodeURIComponent(mediaStr || '{}'));
  } catch (e) {}
  executeTorrentShare(torrent, media, title);
};

window.triggerDownload = function(titleDec, torrentStr) {
  const title = decodeURIComponent(titleDec);
  let torrent = {};
  try {
    torrent = JSON.parse(decodeURIComponent(torrentStr));
  } catch (e) {}
  triggerDownloadDirect(title, torrent);
};

// Register Service Worker for PWA Support
if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

