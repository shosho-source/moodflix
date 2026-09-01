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

// Initial Loader Screen Dismissal Helper
function hideInitialLoader() {
  const loader = document.getElementById('loader');
  if (loader && !loader.classList.contains('fade-out')) {
    loader.classList.add('fade-out');
    setTimeout(() => {
      loader.style.display = 'none';
    }, 450);
  }
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
  initFluid();
  initScrambler();
  setupEventListeners();
  
  try {
    await initSupabaseClient();
  } catch (err) {
    console.warn('Initialization notice:', err);
    if (!checkShareUrl()) {
      showAuthView();
    }
  } finally {
    hideInitialLoader();
  }
});

// Fallback safety timers to guarantee loading screen never stays indefinitely
window.addEventListener('load', () => {
  hideInitialLoader();
});
setTimeout(hideInitialLoader, 1000);

async function initSupabaseClient() {
  const isShared = checkShareUrl();

  try {
    const res = await fetch('/api/config');
    const config = await res.json();
    if (config.supabaseUrl && config.supabaseAnonKey && window.supabase) {
      supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
      supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session && session.user) showDashboardView(session.user);
        else if (event === 'SIGNED_OUT') {
          if (!state.isSharedPage) showAuthView();
        }
      });
      await checkSession();
      return;
    }
  } catch (err) {
    console.warn('Failed to load backend config:', err);
  }

  if (!isShared) {
    showAuthView();
  }
}

async function checkSession() {
  if (supabaseClient) {
    const { data } = await supabaseClient.auth.getSession();
    if (data && data.session && data.session.user) {
      showDashboardView(data.session.user);
      return;
    }
  }
  if (state.isSharedPage) {
    switchTab('share-view');
  } else {
    showAuthView();
  }
}

function showAuthView() {
  hideInitialLoader();
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
}

function showDashboardView(user) {
  hideInitialLoader();
  document.getElementById('auth-view').classList.add('hidden');
  document.getElementById('user-profile').classList.remove('hidden');
  const userDisplay = (user?.email ? user.email.split('@')[0] : (user?.id ? user.id.slice(0, 8) : 'USER')).toUpperCase();
  document.getElementById('user-email').textContent = userDisplay;
  elements.mainNav.style.display = 'flex';
  document.getElementById('mobileBottomNav')?.classList.remove('hidden');
  document.querySelector('.site-header')?.classList.remove('hidden');
  
  if (state.movies.length === 0) loadMovies();
  if (state.tvShows.length === 0) loadTVShows();
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
      showToast('Supabase Auth is not configured. Entering Guest Mode...', 'info');
      showDashboardView({ email: 'guest@moodflix.app' });
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

function handleGuestLogin() {
  state.isSharedPage = false;
  try {
    window.history.replaceState({}, document.title, window.location.pathname);
  } catch (e) {}
  showDashboardView({ email: 'guest@moodflix.app' });
  showToast('Welcome to Moodflix! 🍿', 'info');
}

async function handleSignOut() {
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

// --- Scrambler ---
function initScrambler() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$*&%';
  document.addEventListener('mouseover', e => {
    let el = e.target.closest('.scramble-text');
    if (!el) {
      const container = e.target.closest('.nav-tab, .retro-btn');
      if (container) el = container.querySelector('.scramble-text');
    }
    
    if (!el || el.querySelector('.material-symbols-outlined') || el.classList.contains('material-symbols-outlined') || el.dataset.isScrambling === 'true') return;
    
    const targetText = el.dataset.text || el.innerText.trim();
    if (!targetText) return;
    el.dataset.text = targetText;
    el.dataset.isScrambling = 'true';
    let iteration = 0;
    
    clearInterval(el.interval);
    el.interval = setInterval(() => {
      el.innerText = targetText.split('').map((letter, index) => {
        if (index < iteration) return targetText[index];
        if (letter.trim() === '') return letter;
        return chars[Math.floor(Math.random() * chars.length)];
      }).join('');
      
      if (iteration >= targetText.length) {
        clearInterval(el.interval);
        el.innerText = targetText;
        el.dataset.isScrambling = 'false';
      }
      iteration += 1 / 2;
    }, 20);
  });
}

// --- Fluid ---
let fluidInstance = null;
function initFluid(retryCount = 0) {
  if (!window.WebGLFluidCustom) {
    if (retryCount < 25) {
      setTimeout(() => initFluid(retryCount + 1), 150);
    }
    return;
  }

  try {
    const canvas = document.getElementById('fluid-canvas');
    if (!canvas) return;

    const isMobile = window.innerWidth < 768 || (navigator.maxTouchPoints && navigator.maxTouchPoints > 1);
    
    fluidInstance = window.WebGLFluidCustom(canvas, {
      IMMEDIATE: true,
      TRIGGER: 'hover',
      SIM_RESOLUTION: 64,
      DYE_RESOLUTION: isMobile ? 512 : 512,
      CAPTURE_RESOLUTION: 128,
      DENSITY_DISSIPATION: isMobile ? 1.6 : 2.5,
      VELOCITY_DISSIPATION: 0.9,
      PRESSURE: 0.8,
      PRESSURE_ITERATIONS: 4,
      CURL: 35,
      SPLAT_RADIUS: isMobile ? 0.35 : 0.18,
      SPLAT_FORCE: isMobile ? 5000 : 2000,
      SHADING: false,
      COLORFUL: true,
      GUI: false,
      PAUSED: false,
      BACK_COLOR: { r: 0, g: 0, b: 0 },
      TRANSPARENT: false,
      BLOOM: false,
      SUNRAYS: false,
    });

    // Touch event listeners for seamless Mobile fluid interaction
    const forwardTouch = (e) => {
      if (!e.touches || e.touches.length === 0) return;
      for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];
        const mouseEv = new MouseEvent('mousemove', {
          clientX: touch.clientX,
          clientY: touch.clientY,
          bubbles: true,
          cancelable: true
        });
        canvas.dispatchEvent(mouseEv);
        window.dispatchEvent(mouseEv);
      }
    };

    const forwardMouse = (e) => {
      if (e.target !== canvas) {
        canvas.dispatchEvent(new MouseEvent(e.type, {
          clientX: e.clientX,
          clientY: e.clientY,
          bubbles: true,
          cancelable: true
        }));
      }
    };
    window.addEventListener('mousemove', forwardMouse, { passive: true });
    window.addEventListener('mousedown', forwardMouse, { passive: true });
    window.addEventListener('mouseup', forwardMouse, { passive: true });
    window.addEventListener('touchstart', forwardTouch, { passive: true });
    window.addEventListener('touchmove', forwardTouch, { passive: true });

    // Initial gesture & ambient splats
    requestAnimationFrame(() => {
      const rect = canvas.getBoundingClientRect();
      const clientX = rect.width * 0.5;
      const clientY = rect.height * 0.35;
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX,
          clientY,
          bubbles: true,
        })
      );
      if (fluidInstance && typeof fluidInstance.splats === 'function') {
        fluidInstance.splats();
      } else if (fluidInstance && typeof fluidInstance.multipleSplats === 'function') {
        fluidInstance.multipleSplats(2);
      }
    });
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
  document.getElementById('guest-explore-btn')?.addEventListener('click', handleGuestLogin);

  // Brand Logos & Tutorial View Nav
  document.getElementById('logo-btn')?.addEventListener('click', () => switchTab(state.isSharedPage ? 'share-view' : (state.lastFeedTab || 'movies-view')));
  document.getElementById('shareTutorialBtn')?.addEventListener('click', () => switchTab('tutorial-view'));
  document.getElementById('tutorial-logo-btn')?.addEventListener('click', () => switchTab(state.isSharedPage ? 'share-view' : (state.lastFeedTab || 'movies-view')));
  document.getElementById('tutorial-back-feed-btn')?.addEventListener('click', () => switchTab(state.isSharedPage ? 'share-view' : (state.lastFeedTab || 'movies-view')));
  document.getElementById('back-to-share-btn')?.addEventListener('click', () => switchTab('share-view'));

  // Movies
  elements.btnClearMovieSearch.addEventListener('click', () => {
    elements.movieSearchInput.value = '';
    loadMovies();
  });
  elements.movieSearchInput.addEventListener('change', () => loadMovies());
  elements.btnExecuteMovieSearch?.addEventListener('click', () => loadMovies());
  elements.movieCategorySelect.addEventListener('change', () => loadMovies());

  // TV
  elements.btnClearTvSearch.addEventListener('click', () => {
    elements.tvSearchInput.value = '';
    loadTVShows();
  });
  elements.tvSearchInput.addEventListener('change', () => loadTVShows());
  elements.btnExecuteTvSearch?.addEventListener('click', () => loadTVShows());
  elements.tvCategorySelect.addEventListener('change', () => loadTVShows());

  // Direct Torrent Search
  elements.directSearchForm.addEventListener('submit', async e => {
    e.preventDefault();
    performDirectSearch(elements.directSearchInput.value, elements.directMinSeeds.value, elements.directCategory.value);
  });

  // Modals & Backdrop click-to-close
  elements.btnCloseModal.addEventListener('click', () => { elements.torrentModal.classList.add('hidden'); });
  elements.btnCloseCycleModal.addEventListener('click', () => { elements.cycleModal.classList.add('hidden'); });
  document.getElementById('close-trailer-modal-btn')?.addEventListener('click', () => {
    document.getElementById('trailer-modal').classList.add('hidden');
    document.getElementById('trailer-iframe').src = '';
  });

  // Close modals on clicking overlay backdrop
  [elements.torrentModal, elements.cycleModal, document.getElementById('trailer-modal')].forEach(modal => {
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.add('hidden');
          const trailerIframe = document.getElementById('trailer-iframe');
          if (modal.id === 'trailer-modal' && trailerIframe) trailerIframe.src = '';
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

async function performDirectSearch(query, minSeeds = 0, category = '200') {
  const cleanQuery = (query || '').trim();
  if (!cleanQuery) {
    showToast('Please enter a search query', 'error');
    return;
  }

  if (elements.directSearchResults) {
    elements.directSearchResults.innerHTML = '<div style="padding:28px;text-align:center;font-family:var(--font-mono);opacity:0.8;">Searching releases on The Cine Bay...</div>';
  }

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(cleanQuery)}&minSeeds=${minSeeds || 0}&category=${category || '200'}`);
    const data = await res.json();

    if (data.success && data.torrents && data.torrents.length > 0) {
      if (elements.directSearchResults) {
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
        renderTorrentRows(listContainer, data.torrents, cleanQuery, { title: cleanQuery }, false);
      }
    } else {
      if (elements.directSearchResults) {
        elements.directSearchResults.innerHTML = `<div style="padding:28px;text-align:center;font-family:var(--font-mono);">No torrents found matching "${escapeHtml(cleanQuery)}" with ${minSeeds || 0}+ seeds.</div>`;
      }
      showToast('No torrents found for search query', 'info');
    }
  } catch (err) {
    if (elements.directSearchResults) {
      elements.directSearchResults.innerHTML = '<div style="padding:28px;text-align:center;font-family:var(--font-mono);">Failed to execute search. Please try again.</div>';
    }
    showToast('Direct search failed', 'error');
  }
}

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
      if (state.activeTab === 'movies-view' || state.activeTab === 'tv-view') {
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

async function loadMovies() {
  const search = elements.movieSearchInput.value;
  const category = elements.movieCategorySelect.value;
  try {
    const res = await fetch(`/api/movies?search=${encodeURIComponent(search)}&category=${category}`);
    const data = await res.json();
    if (data.success) {
      state.movies = data.movies;
      renderMediaGrid(elements.movieGrid, data.movies, 'movie');
    }
  } catch (err) {}
}

async function loadTVShows() {
  const search = elements.tvSearchInput.value;
  const category = elements.tvCategorySelect.value;
  try {
    const res = await fetch(`/api/tv?search=${encodeURIComponent(search)}&category=${category}`);
    const data = await res.json();
    if (data.success) {
      state.tvShows = data.shows;
      renderMediaGrid(elements.tvGrid, data.shows, 'tv');
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
  elements.modalTorrentList.innerHTML = 'Loading Seasons...';
  try {
    const res = await fetch(`/api/details?id=${m.id}&type=tv`);
    const data = await res.json();
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
      elements.modalTorrentList.innerHTML = '<div style="padding:20px;text-align:center;">No seasons found.</div>';
    }
  } catch (err) {
    elements.modalTorrentList.innerHTML = '<div style="padding:20px;text-align:center;">Failed to load seasons.</div>';
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
    content.innerHTML = 'Loading episodes...';
    try {
      const res = await fetch(`/api/tv/episodes?id=${m.id}&season=${seasonNumber}`);
      const data = await res.json();
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
        content.innerHTML = 'No episodes found.';
      }
    } catch (err) {
      content.innerHTML = 'Failed to load episodes.';
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
    content.innerHTML = 'Loading torrents...';
    const searchTitle = `${m.title} S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`;
    
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchTitle)}&minSeeds=0&category=205`);
      const data = await res.json();
      if (data.success) {
        const epStr = `s${String(seasonNumber).padStart(2, '0')}e${String(episodeNumber).padStart(2, '0')}`;
        const filteredTorrents = data.torrents.filter(t => t.name.toLowerCase().includes(epStr));
        
        if (filteredTorrents.length === 0) {
           content.innerHTML = '<div style="padding:10px;text-align:center;">No torrents found matching this exact episode.</div>';
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
      content.innerHTML = 'Failed to fetch torrents.';
    }
  }
};

async function playTrailer(id, type) {
  const modal = document.getElementById('trailer-modal');
  const iframe = document.getElementById('trailer-iframe');
  const loader = document.getElementById('trailer-loader');

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
      showToast('No trailer found', 'error');
    }
  } catch (err) {
    modal.classList.add('hidden');
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
  elements.modalTorrentList.innerHTML = '<div style="padding:24px;text-align:center;font-family:var(--font-mono);">Loading torrents...</div>';
  try {
    const category = type === 'tv' ? '205' : '200';
    const res = await fetch(`/api/search?q=${encodeURIComponent(searchTitle)}&minSeeds=0&category=${category}`);
    const data = await res.json();
    if (data.success && data.torrents && data.torrents.length > 0) {
      renderTorrentRows(elements.modalTorrentList, data.torrents, searchTitle, mediaObj, isShareMode);
    } else {
      elements.modalTorrentList.innerHTML = '<div style="padding:24px;text-align:center;font-family:var(--font-mono);">No torrents found.</div>';
    }
  } catch (err) {
    elements.modalTorrentList.innerHTML = '<div style="padding:24px;text-align:center;font-family:var(--font-mono);">Failed to fetch torrents.</div>';
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

