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

document.addEventListener('DOMContentLoaded', async () => {
  initFluid();
  initScrambler();
  setupEventListeners();
  initTorrentEngine();
  
  await initSupabaseClient();
});

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
  document.getElementById('auth-view').classList.add('hidden');
  document.getElementById('user-profile').classList.remove('hidden');
  const userDisplay = (user?.email ? user.email.split('@')[0] : (user?.id ? user.id.slice(0, 8) : 'USER')).toUpperCase();
  document.getElementById('user-email').textContent = userDisplay;
  elements.mainNav.style.display = 'flex';
  document.getElementById('mobileBottomNav')?.classList.remove('hidden');
  document.querySelector('.site-header')?.classList.remove('hidden');
  
  const isShared = checkShareUrl();
  if (state.movies.length === 0) loadMovies();
  if (state.tvShows.length === 0) loadTVShows();
  if (!isShared) {
    if (state.activeTab === 'auth-view' || state.activeTab === 'movies-view' || document.getElementById('diagnostic-view').classList.contains('hidden')) {
      switchTab('diagnostic-view');
    }
  }
}

async function handleGoogleLogin() {
  const btnText = document.getElementById('login-btn-text');
  if (btnText) btnText.textContent = 'LOGGING IN...';
  if (!supabaseClient) return;
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href }
  });
  if (error && btnText) {
    btnText.textContent = 'CONTINUE WITH GOOGLE';
  }
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

  // Wire Explore Button
  const exploreBtn = document.getElementById('shareExploreBtn');
  if (exploreBtn) {
    exploreBtn.onclick = () => switchTab('movies-view');
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
  document.getElementById('btnQuizBack').disabled = currentQuizStep === 0;
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
        document.getElementById('btnDiagNext').disabled = data.results.length <= 1;
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
      iteration += 1 / 3;
    }, 30);
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

  // Brand Logos & Tutorial View Nav
  document.getElementById('logo-btn')?.addEventListener('click', () => switchTab(state.isSharedPage ? 'share-view' : (state.lastFeedTab || 'movies-view')));
  document.getElementById('shareTutorialBtn')?.addEventListener('click', () => switchTab('tutorial-view'));
  document.getElementById('tutorial-logo-btn')?.addEventListener('click', () => switchTab(state.isSharedPage ? 'share-view' : (state.lastFeedTab || 'movies-view')));
  document.getElementById('tutorial-back-feed-btn')?.addEventListener('click', () => switchTab(state.isSharedPage ? 'share-view' : (state.lastFeedTab || 'movies-view')));
  document.getElementById('back-to-download-btn')?.addEventListener('click', () => {
    switchTab(state.isSharedPage ? 'share-view' : (state.lastFeedTab || 'movies-view'));
  });
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

  // Search
  elements.directSearchForm.addEventListener('submit', async e => {
    e.preventDefault();
    performDirectSearch(elements.directSearchInput.value, elements.directMinSeeds.value, elements.directCategory.value);
  });

  // Modals
  elements.btnCloseModal.addEventListener('click', () => { elements.torrentModal.classList.add('hidden'); });
  elements.btnCloseCycleModal.addEventListener('click', () => { elements.cycleModal.classList.add('hidden'); });
  document.getElementById('close-trailer-modal-btn')?.addEventListener('click', () => {
    document.getElementById('trailer-modal').classList.add('hidden');
    document.getElementById('trailer-iframe').src = '';
  });
  
  elements.btnBackToFeed?.addEventListener('click', () => switchTab(state.lastFeedTab));
  
  document.getElementById('back-to-download-btn')?.addEventListener('click', () => switchTab(state.lastFeedTab || 'movies-view'));
  
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

  document.getElementById('btnDiagNext')?.addEventListener('click', () => {
    if (state.diagnosticResults && state.diagnosticIndex < state.diagnosticResults.length - 1) {
      state.diagnosticIndex++;
      const idx = state.diagnosticIndex;
      const total = state.diagnosticResults.length;
      
      document.getElementById('diagMatchIndex').innerText = idx + 1;
      document.getElementById('btnDiagNext').disabled = idx >= total - 1;
      
      const m = state.diagnosticResults[idx];
      openDetailView(m, m.mediaType || 'movie', true);
    }
  });
}

function handleQuickMoodSelect(mood) {
  initQuiz();
  if (mood === 'action') {
    quizAnswers.mood = 'happy';
    quizAnswers.occasion = 'solo';
    quizAnswers.genres = ['Action', 'Thriller', 'Science Fiction'];
    currentQuizStep = 2;
    renderQuizStep();
  } else if (mood === 'chill') {
    quizAnswers.mood = 'happy';
    quizAnswers.occasion = 'date';
    quizAnswers.genres = ['Romance', 'Comedy', 'Drama'];
    currentQuizStep = 2;
    renderQuizStep();
  } else if (mood === 'mind') {
    quizAnswers.mood = 'neutral';
    quizAnswers.occasion = 'solo';
    quizAnswers.genres = ['Mystery', 'Science Fiction', 'Crime'];
    currentQuizStep = 2;
    renderQuizStep();
  } else if (mood === 'top') {
    quizAnswers.recency = 'any';
    quizAnswers.mood = 'neutral';
    quizAnswers.genres = ['Drama', 'History', 'Crime'];
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

  const siteHeader = document.querySelector('.site-header');
  const mobileNav = document.getElementById('mobileBottomNav');
  if (siteHeader) {
    if (tabId === 'tutorial-view' || tabId === 'auth-view') {
      siteHeader.classList.add('hidden');
      if (mobileNav) mobileNav.classList.add('hidden');
    } else {
      siteHeader.classList.remove('hidden');
      if (mobileNav) mobileNav.classList.remove('hidden');
    }
  }

  if (tabId === 'movies-view' && state.movies.length === 0) loadMovies();
  else if (tabId === 'tv-view' && state.tvShows.length === 0) loadTVShows();
  else if (tabId === 'settings-view') loadSettingsIntoUI();
  else if (tabId === 'download-view') {
    if (window.torrentEngine) window.torrentEngine.render();
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

function triggerDownloadDirect(title, torrent) {
  if (!torrent) return;
  const safeName = (torrent.name || title || 'download').replace(/[^a-zA-Z0-9_.-]/g, '_');
  const hash = torrent.infoHash || (torrent.magnet && torrent.magnet.match(/xt=urn:btih:([a-zA-Z0-9]+)/i)?.[1]);

  showToast('Downloading .torrent file...', 'info');

  if (torrent.magnet) {
    copyMagnetLink(torrent.magnet);
  }

  fetch('/api/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ movieTitle: title, torrent, openMagnet: false })
  }).catch(() => {});

  if (hash) {
    fetch(`/api/torrent-file?hash=${hash}&name=${encodeURIComponent(safeName)}`)
      .then(res => {
        if (res.ok) return res.blob();
        throw new Error('Torrent file not cached');
      })
      .then(blob => {
        if (blob && blob.size > 0) {
          const downloadUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = `${safeName}.torrent`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(downloadUrl), 2000);
          showToast('Downloaded .torrent file! 💾', 'success');
        }
      })
      .catch(() => {
        if (torrent.magnet) {
          window.location.href = torrent.magnet;
        }
      });
  } else if (torrent.magnet) {
    window.location.href = torrent.magnet;
  }
}

window.copyMagnetLink = async function(magnetDec) {
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
    showToast('Magnet link copied to clipboard! 🧲', 'success');
  } catch (err) {
    showToast('Failed to copy magnet link', 'error');
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

window.triggerDownload = async function(titleDec, torrentStr) {
  const title = decodeURIComponent(titleDec);
  const torrent = JSON.parse(decodeURIComponent(torrentStr));
  const safeName = (torrent.name || title || 'download').replace(/[^a-zA-Z0-9_.-]/g, '_');
  const hash = torrent.infoHash || (torrent.magnet && torrent.magnet.match(/xt=urn:btih:([a-zA-Z0-9]+)/i)?.[1]);

  showToast('Downloading .torrent file...', 'info');

  // 1. Copy magnet to clipboard as a helpful fallback
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(torrent.magnet);
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = torrent.magnet;
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  } catch (err) {}

  // 2. Notify backend to record download in history
  fetch('/api/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ movieTitle: title, torrent, openMagnet: false })
  }).catch(() => {});

  // 3. Download the actual .torrent file to user's device
  let downloaded = false;
  if (hash) {
    try {
      const res = await fetch(`/api/torrent-file?hash=${hash}&name=${encodeURIComponent(safeName)}`);
      if (res.ok) {
        const blob = await res.blob();
        if (blob && blob.size > 0) {
          const downloadUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = `${safeName}.torrent`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
          showToast(`Downloaded ${safeName}.torrent ✓`, 'success');
          downloaded = true;
        }
      }
    } catch (e) {}
  }

  // 4. Fallback if caching proxy is unreachable: save .magnet file
  if (!downloaded && torrent.magnet) {
    const blob = new Blob([torrent.magnet], { type: 'text/plain;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `${safeName}.magnet`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
    showToast(`Saved magnet file & link copied ✓`, 'success');
  }
};

async function performDirectSearch(query, minSeeds, category) {
  if (!elements.directSearchResults) return;
  elements.directSearchResults.innerHTML = '<div class="retro-box" style="padding: 24px; text-align: center; font-family: var(--font-mono);">Searching torrent databases...</div>';
  try {
    const minS = minSeeds || 0;
    const cat = category || '200';
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&minSeeds=${minS}&category=${cat}`);
    const data = await res.json();
    if (data.success && data.torrents && data.torrents.length > 0) {
      elements.directSearchResults.innerHTML = `
        <div class="retro-box" style="padding: 14px;">
          <div class="torrent-list-header">
            <span>Release</span><span>Quality</span><span>Seeds/Peers</span><span>Size</span><span>Action</span>
          </div>
          <div id="directSearchItemsContainer"></div>
        </div>
      `;
      const container = document.getElementById('directSearchItemsContainer');
      renderTorrentRows(container, data.torrents, query, { title: query }, false);
    } else {
      elements.directSearchResults.innerHTML = '<div class="retro-box" style="padding: 24px; text-align: center; font-family: var(--font-mono);">No torrents found matching your query.</div>';
    }
  } catch (err) {
    elements.directSearchResults.innerHTML = '<div class="retro-box" style="padding: 24px; text-align: center; font-family: var(--font-mono); color: #b30000;">Search failed. Please check network connection.</div>';
  }
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'retro-box';
  toast.style = 'margin-top: 10px; padding: 10px; background: var(--retro-fg); color: var(--retro-bg); font-family: var(--font-mono); font-weight: bold;';
  toast.innerText = msg;
  elements.toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// Loader logic
window.addEventListener('load', () => {
  const loader = document.getElementById('loader');
  if (loader && !loader.classList.contains('fade-out')) {
    setTimeout(() => {
      loader.classList.add('fade-out');
    }, 1500); // Force it to show for 1.5s
  }
});

/* ==========================================================================
   Torrent Lite Engine [WebTorrent + OPFS Storage Pipeline + WakeLock + Stream]
   ========================================================================== */

const DEFAULT_WSS_TRACKERS = [
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.webtorrent.dev'
];

class TorrentEngineManager {
  constructor() {
    this.client = null;
    this.torrents = new Map(); // infoHash -> { torrentObj, meta, status, opfsSaved, phase, logs }
    this.savedLibrary = []; // Array of saved torrent metadata
    this.activeFilter = 'all';
    this.wakeLockSentinel = null;
    this.opfsSupported = !!(navigator.storage && navigator.storage.getDirectory);
    this.updateInterval = null;
    this.logs = [];
    this.autoScroll = true;
    this.logsCollapsed = false;
    this.expandedCardLogs = new Set();
  }

  addLog(message, level = 'info', tag = 'ENGINE', infoHash = null) {
    const time = new Date().toLocaleTimeString();
    const logObj = { time, level, tag, message, infoHash };

    // Push to global logs (keep latest 300)
    this.logs.push(logObj);
    if (this.logs.length > 300) this.logs.shift();

    // Push to per-torrent logs
    if (infoHash && this.torrents.has(infoHash)) {
      const entry = this.torrents.get(infoHash);
      if (!entry.logs) entry.logs = [];
      entry.logs.push(logObj);
      if (entry.logs.length > 50) entry.logs.shift();
      if (tag === 'TRACKER' || tag === 'SWARM' || tag === 'METADATA' || tag === 'PEER' || tag === 'STORAGE' || tag === 'DONE' || tag === 'ERROR') {
        entry.phase = `[${tag}] ${message.slice(0, 40)}`;
      }
    }

    // Console output
    const prefix = `[Torrent Lite][${tag}]`;
    if (level === 'error') {
      console.error(prefix, message);
    } else if (level === 'warn') {
      console.warn(prefix, message);
    } else {
      console.log(prefix, message);
    }

    // Render to terminal UI
    this.renderConsoleLog(logObj);
  }

  renderConsoleLog(log) {
    const consoleEl = document.getElementById('torrentLogsConsole');
    if (!consoleEl) return;

    const div = document.createElement('div');
    div.className = `log-entry log-${log.level || 'info'}`;
    div.innerHTML = `
      <span class="log-time">[${log.time}]</span>
      <span class="log-tag">[${log.tag || 'INFO'}]</span>
      <span class="log-msg">${this.escapeHtml(log.message)}</span>
    `;
    consoleEl.appendChild(div);

    while (consoleEl.children.length > 250) {
      consoleEl.removeChild(consoleEl.firstChild);
    }

    if (!this.logsCollapsed && this.autoScroll) {
      consoleEl.scrollTop = consoleEl.scrollHeight;
    }
  }

  clearLogs() {
    this.logs = [];
    const consoleEl = document.getElementById('torrentLogsConsole');
    if (consoleEl) consoleEl.innerHTML = '';
    this.addLog('Activity logs cleared by user', 'info', 'SYSTEM');
  }

  copyLogs() {
    if (this.logs.length === 0) {
      showToast('No logs to copy', 'info');
      return;
    }
    const text = this.logs.map(l => `[${l.time}] [${l.tag}] ${l.message}`).join('\n');
    try {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text);
        showToast('All engine logs copied to clipboard!', 'success');
      }
    } catch (e) {
      showToast('Failed to copy logs', 'error');
    }
  }

  toggleLogsTerminal() {
    this.logsCollapsed = !this.logsCollapsed;
    const consoleEl = document.getElementById('torrentLogsConsole');
    const btn = document.getElementById('btnToggleLogs');
    if (consoleEl) {
      if (this.logsCollapsed) {
        consoleEl.classList.add('collapsed');
        if (btn) btn.innerText = 'EXPAND';
      } else {
        consoleEl.classList.remove('collapsed');
        if (btn) btn.innerText = 'COLLAPSE';
        consoleEl.scrollTop = consoleEl.scrollHeight;
      }
    }
  }

  toggleCardLogs(id) {
    if (this.expandedCardLogs.has(id)) {
      this.expandedCardLogs.delete(id);
    } else {
      this.expandedCardLogs.add(id);
    }
    this.render();
  }

  init() {
    // 1. Register PWA Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    this.addLog('Torrent Lite Engine initializing...', 'info', 'SYSTEM');
    if (this.opfsSupported) {
      this.addLog('Origin Private File System (OPFS) detected: High-throughput direct-to-disk streaming active ✓', 'storage', 'STORAGE');
    }

    // 2. Initialize WebTorrent Client (with retry if CDN hasn't loaded yet)
    this.initWebTorrent();

    // 3. Setup Visibility and WakeLock Listener
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.hasActiveDownloads()) {
        this.acquireWakeLock();
      }
    });

    // 4. Load Saved Library
    this.loadSavedLibrary();

    // 5. Bind UI Elements
    this.bindEvents();

    // 6. Start live ticker
    this.startTicker();
    this.updateStorageQuota();
    this.render();

    this.addLog('Torrent Lite Engine ready. WebRTC P2P swarm listener active ✓', 'success', 'SYSTEM');
  }

  initWebTorrent(retries = 0) {
    try {
      if (window.WebTorrent) {
        try {
          this.client = new window.WebTorrent({
            tracker: {
              rtcConfig: {
                iceServers: [
                  { urls: 'stun:stun.l.google.com:19302' },
                  { urls: 'stun:global.stun.twilio.com:3478' }
                ]
              }
            }
          });
        } catch (optsErr) {
          console.warn('[Torrent Lite] Initializing WebTorrent with default options due to:', optsErr);
          this.client = new window.WebTorrent();
        }
        this.client.on('error', err => {
          this.addLog(`Client Error: ${err?.message || err}`, 'error', 'ERROR');
        });
        this.addLog('WebTorrent client bundle initialized with STUN ICE servers', 'info', 'SYSTEM');
      } else if (retries < 15) {
        // CDN script may not have loaded yet — retry after delay
        setTimeout(() => this.initWebTorrent(retries + 1), 400);
      } else {
        // Dynamic backup script injection if CDN was blocked or delayed
        this.addLog('WebTorrent script delayed. Injecting backup CDN...', 'warn', 'SYSTEM');
        const backupScript = document.createElement('script');
        backupScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/webtorrent/1.9.7/webtorrent.min.js';
        backupScript.onload = () => {
          if (window.WebTorrent && !this.client) {
            this.client = new window.WebTorrent();
            this.addLog('WebTorrent backup client loaded successfully ✓', 'success', 'SYSTEM');
            showToast('WebTorrent engine loaded successfully!', 'success');
          }
        };
        backupScript.onerror = () => {
          this.addLog('WebTorrent engine failed to load from CDNs. Check network / adblockers.', 'error', 'ERROR');
          showToast('WebTorrent engine failed to load. Check your network or adblocker.', 'error');
        };
        document.head.appendChild(backupScript);
      }
    } catch (err) {
      this.addLog(`Initialization error: ${err?.message || err}`, 'error', 'ERROR');
    }
  }

  bindEvents() {
    const input = document.getElementById('torrentMagnetInput');
    const btnAdd = document.getElementById('btnAddTorrent');
    const btnPaste = document.getElementById('btnPasteMagnet');
    const dropzone = document.getElementById('torrentDropzone');
    const fileInput = document.getElementById('torrentFileInput');
    const btnBrowse = document.getElementById('btnBrowseTorrentFile');
    const filterTabs = document.getElementById('torrentFilterTabs');
    const btnCloseStream = document.getElementById('btnCloseStreamModal');

    // Terminal log buttons
    document.getElementById('btnClearLogs')?.addEventListener('click', () => this.clearLogs());
    document.getElementById('btnCopyLogs')?.addEventListener('click', () => this.copyLogs());
    document.getElementById('btnToggleLogs')?.addEventListener('click', () => this.toggleLogsTerminal());

    btnAdd?.addEventListener('click', () => {
      const val = input.value.trim();
      if (val) {
        this.add(val);
        input.value = '';
      }
    });

    input?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const val = input.value.trim();
        if (val) {
          this.add(val);
          input.value = '';
        }
      }
    });

    btnPaste?.addEventListener('click', async () => {
      try {
        if (navigator.clipboard) {
          const text = await navigator.clipboard.readText();
          if (text) {
            input.value = text;
            showToast('Magnet pasted from clipboard!', 'success');
          }
        }
      } catch (err) {
        showToast('Clipboard access denied', 'error');
      }
    });

    btnBrowse?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (file) {
        this.handleFileTorrent(file);
        fileInput.value = '';
      }
    });

    // Drag and drop handlers
    dropzone?.addEventListener('dragover', e => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });

    dropzone?.addEventListener('dragleave', () => {
      dropzone.classList.remove('drag-over');
    });

    dropzone?.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        this.handleFileTorrent(file);
      } else {
        const text = e.dataTransfer?.getData('text');
        if (text) this.add(text);
      }
    });

    // Filter tabs
    filterTabs?.addEventListener('click', e => {
      const btn = e.target.closest('.filter-tab');
      if (!btn) return;
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      this.activeFilter = btn.dataset.filter;
      this.render();
    });

    // Stream modal close
    btnCloseStream?.addEventListener('click', () => this.closeStreamModal());
  }

  handleFileTorrent(file) {
    if (!file) return;
    const name = file.name;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      if (typeof dataUrl === 'string') {
        const base64 = dataUrl.split(',')[1];
        if (base64) {
          await this.add({ buffer: base64, name });
        }
      }
    };
    reader.readAsDataURL(file);
  }

  augmentMagnet(uri) {
    if (typeof uri !== 'string') return uri;
    const trimmed = uri.trim();
    if (!trimmed.startsWith('magnet:?')) {
      if (/^[0-9a-fA-F]{40}$/.test(trimmed) || /^[2-7a-zA-Z]{32}$/.test(trimmed)) {
        uri = `magnet:?xt=urn:btih:${trimmed}`;
      } else {
        return uri;
      }
    } else {
      uri = trimmed;
    }

    // Extract xt parameter (e.g. urn:btih:HASH)
    const xtMatch = uri.match(/[?&]xt=(urn:[a-z0-9]+:[a-zA-Z0-9]+)/i);
    if (!xtMatch) return uri;
    const xt = xtMatch[1];

    // Extract dn parameter if present
    const dnMatch = uri.match(/[?&]dn=([^&]+)/i);
    const dn = dnMatch ? `&dn=${dnMatch[1]}` : '';

    let clean = `magnet:?xt=${xt}${dn}`;

    DEFAULT_WSS_TRACKERS.forEach(tr => {
      clean += `&tr=${encodeURIComponent(tr)}`;
    });
    return clean;
  }

  async add(torrentInput, customMeta = {}) {
    let name = customMeta.name;
    let payload = {};

    if (torrentInput instanceof File) {
      return this.handleFileTorrent(torrentInput);
    } else if (typeof torrentInput === 'object' && torrentInput.buffer) {
      name = name || torrentInput.name || 'Uploaded .torrent';
      payload = { buffer: torrentInput.buffer, name };
    } else if (typeof torrentInput === 'string') {
      const trimmed = torrentInput.trim();
      name = name || trimmed.slice(0, 35);
      payload = { magnet: trimmed, name };
    } else {
      showToast('Unsupported torrent input format', 'error');
      return;
    }

    this.addLog(`Adding transfer: "${name}"`, 'info', 'ADD');
    this.addLog(`Connecting to Backend High-Speed TCP/UDP Swarm Engine...`, 'info', 'SWARM');
    showToast('Connecting to Backend TCP/UDP Seeders...', 'info');

    try {
      const res = await fetch('/api/backend-torrent/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(`Server route unavailable (${res.status}). Please restart your Node server ('npm start').`);
      }
      const data = await res.json();
      if (data.success && data.infoHash) {
        const id = data.infoHash;
        const entry = {
          meta: {
            id,
            name: data.name || name,
            magnet: payload.magnet || null,
            addedAt: Date.now(),
            size: data.length || 0
          },
          status: 'downloading',
          progress: 0,
          downloadSpeed: 0,
          uploadSpeed: 0,
          numPeers: 0,
          opfsSaved: false,
          phase: 'BACKEND TCP/UDP ENGINE CONNECTED',
          logs: []
        };
        this.torrents.set(id, entry);
        this.addLog(`Transfer registered on Backend TCP/UDP Engine (Hash: ${id.slice(0, 12)}...)`, 'success', 'QUEUE', id);
        this.persistLibrary();
        this.render();
      } else {
        const errMsg = data.error || 'Failed to add torrent to backend engine';
        this.addLog(`Backend add notice: ${errMsg}`, 'warn', 'ENGINE');
        showToast(errMsg, 'error');
      }
    } catch (backendErr) {
      this.addLog(`Backend engine error: ${backendErr.message}`, 'warn', 'ENGINE');
      showToast(backendErr.message, 'error');
    }
  }

  async streamFileToOPFS(file) {
    if (!this.opfsSupported) return null;
    try {
      const root = await navigator.storage.getDirectory();
      const fileName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const fileHandle = await root.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      
      // WebTorrent v3: file.stream() returns a standard Web ReadableStream
      // WebTorrent v2: file.createReadStream() returns a Node.js-style stream
      if (typeof file.stream === 'function') {
        const readableStream = file.stream();
        const reader = readableStream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await writable.write(value);
        }
      } else if (typeof file.createReadStream === 'function') {
        // v2 fallback: Node-style stream
        const nodeStream = file.createReadStream();
        await new Promise((resolve, reject) => {
          nodeStream.on('data', async (chunk) => {
            try {
              nodeStream.pause();
              await writable.write(chunk);
              nodeStream.resume();
            } catch (writeErr) {
              nodeStream.destroy();
              reject(writeErr);
            }
          });
          nodeStream.on('end', resolve);
          nodeStream.on('error', reject);
        });
      } else {
        // Last resort: get blob and write it
        const blob = await this.getFileBlob(file);
        await writable.write(blob);
      }
      
      await writable.close();
      return fileHandle;
    } catch (err) {
      console.warn('[Torrent Lite] OPFS write failed:', err);
    }
    return null;
  }

  async getOPFSFile(fileName) {
    if (!this.opfsSupported) return null;
    try {
      const root = await navigator.storage.getDirectory();
      const safeName = fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const fileHandle = await root.getFileHandle(safeName);
      return await fileHandle.getFile();
    } catch (e) {
      return null;
    }
  }

  // Helper: get a Blob from a WebTorrent file (works for both v2 and v3)
  async getFileBlob(file) {
    // 1. Try OPFS first
    const opfsFile = await this.getOPFSFile(file.name);
    if (opfsFile) return opfsFile;

    // 2. v3: file.blob() returns a promise
    if (typeof file.blob === 'function') {
      try {
        return await file.blob();
      } catch (e) {}
    }
    // 3. v3: file.stream() → collect into blob
    if (typeof file.stream === 'function') {
      try {
        const reader = file.stream().getReader();
        const chunks = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        return new Blob(chunks);
      } catch (e) {}
    }
    // 4. v2: callback-based getBlob
    if (typeof file.getBlob === 'function') {
      return new Promise((resolve) => {
        file.getBlob((err, blob) => {
          if (err || !blob) return resolve(null);
          resolve(blob);
        });
      });
    }
    // 5. v1: getBlobURL
    if (typeof file.getBlobURL === 'function') {
      return new Promise((resolve) => {
        file.getBlobURL((err, url) => {
          if (!err && url) {
            fetch(url).then(r => r.blob()).then(resolve).catch(() => resolve(null));
          } else {
            resolve(null);
          }
        });
      });
    }
    return null;
  }

  async pause(infoHash) {
    await fetch('/api/backend-torrent/pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: infoHash })
    }).catch(() => {});
    const entry = this.torrents.get(infoHash);
    if (entry) entry.status = 'paused';
    this.render();
  }

  async resume(infoHash) {
    await fetch('/api/backend-torrent/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: infoHash })
    }).catch(() => {});
    const entry = this.torrents.get(infoHash);
    if (entry) entry.status = 'downloading';
    this.render();
  }

  async remove(infoHash) {
    await fetch('/api/backend-torrent/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: infoHash })
    }).catch(() => {});
    this.torrents.delete(infoHash);
    this.savedLibrary = this.savedLibrary.filter(t => t.id !== infoHash);
    this.persistLibrary();
    this.render();
    showToast('Torrent removed', 'info');
  }

  stream(infoHash) {
    const entry = this.torrents.get(infoHash);
    if (!entry) {
      showToast('Torrent not found', 'error');
      return;
    }

    const modal = document.getElementById('streamPlayerModal');
    const title = document.getElementById('streamModalTitle');
    const video = document.getElementById('streamVideoPlayer');
    const audio = document.getElementById('streamAudioPlayer');
    const audioBox = document.getElementById('streamAudioContainer');
    const fileSelect = document.getElementById('streamFileSelect');

    const magnetOrId = entry.meta.magnet || entry.meta.id;
    if (title) title.innerText = (entry.meta.name || 'LIVE MEDIA STREAM').toUpperCase();

    // High-Speed Backend TCP/UDP Streaming Proxy for 100% video playback
    if (video) {
      video.style.display = 'block';
      if (audioBox) audioBox.classList.add('hidden');
      const streamUrl = `/api/stream?torrent=${encodeURIComponent(magnetOrId)}`;
      video.src = streamUrl;
      video.play().catch(() => {});
      this.addLog(`Connected to Backend High-Speed TCP/UDP Streaming Proxy`, 'success', 'STREAM', infoHash);
      showToast('Connecting to Backend TCP/UDP Streaming Proxy...', 'info');
    }

    if (modal) modal.classList.remove('hidden');
  }

  async renderFileToPlayer(file, video, audio, audioBox) {
    // Legacy fallback handled by backend stream
  }

  async fallbackStream(file, target) {
    // Legacy fallback handled by backend stream
  }

  closeStreamModal() {
    const modal = document.getElementById('streamPlayerModal');
    const video = document.getElementById('streamVideoPlayer');
    const audio = document.getElementById('streamAudioPlayer');
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    if (modal) modal.classList.add('hidden');
  }

  async exportFile(infoHash) {
    const entry = this.torrents.get(infoHash);
    if (!entry) {
      showToast('Torrent transfer not found', 'error');
      return;
    }

    const magnetOrId = entry.meta.magnet || entry.meta.id;
    const safeName = (entry.meta.name || 'download').replace(/[^a-zA-Z0-9_.-]/g, '_');

    showToast('Starting HTTP Video Download from backend TCP/UDP swarm...', 'info');
    this.addLog(`Triggering Backend HTTP File Download for "${safeName}"`, 'info', 'EXPORT', infoHash);

    // Direct HTTP download from backend TCP/UDP swarm straight to browser download bar!
    window.location.href = `/api/download-file?torrent=${encodeURIComponent(magnetOrId)}`;
  }

  async exportTorrentOrMagnetFile(entry) {
    const safeName = (entry.meta.name || 'download').replace(/[^a-zA-Z0-9_.-]/g, '_');
    const hash = (entry.meta.id && entry.meta.id.length === 40 && !entry.meta.id.startsWith('pending_')) ? entry.meta.id : 
                 (entry.meta.magnet && entry.meta.magnet.match(/xt=urn:btih:([a-zA-Z0-9]+)/i)?.[1]);
    
    if (hash) {
      try {
        const res = await fetch(`/api/torrent-file?hash=${hash}&name=${encodeURIComponent(safeName)}`);
        if (res.ok) {
          const blob = await res.blob();
          if (blob && blob.size > 0) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${safeName}.torrent`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 5000);
            showToast(`Exported ${safeName}.torrent ✓`, 'success');
            return;
          }
        }
      } catch (e) {}
    }

    if (entry.meta.magnet) {
      const blob = new Blob([entry.meta.magnet], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}.magnet`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      showToast(`Exported ${safeName}.magnet & copied link ✓`, 'success');
    }
  }

  async triggerFileDownloadOrShare(fileObj, fileName) {
    try {
      if (navigator.canShare && navigator.canShare({ files: [fileObj] })) {
        try {
          await navigator.share({
            files: [fileObj],
            title: fileName
          });
          showToast('File shared successfully!', 'success');
          return;
        } catch (shareErr) {
          if (shareErr.name === 'AbortError') return;
        }
      }
    } catch (e) {}

    const url = URL.createObjectURL(fileObj);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    showToast(`Exported ${fileName} ✓`, 'success');
  }

  copyMagnet(magnet) {
    if (!magnet) return;
    try {
      const decoded = decodeURIComponent(magnet);
      if (navigator.clipboard) {
        navigator.clipboard.writeText(decoded);
        showToast('Magnet copied to clipboard!', 'success');
      }
    } catch (e) {
      showToast('Failed to copy magnet', 'error');
    }
  }

  // --- Screen Wake Lock API ---
  async acquireWakeLock() {
    if ('wakeLock' in navigator && !this.wakeLockSentinel) {
      try {
        this.wakeLockSentinel = await navigator.wakeLock.request('screen');
        this.wakeLockSentinel.addEventListener('release', () => {
          this.wakeLockSentinel = null;
        });
      } catch (err) {}
    }
  }

  releaseWakeLock() {
    if (this.wakeLockSentinel) {
      this.wakeLockSentinel.release().catch(() => {});
      this.wakeLockSentinel = null;
    }
  }

  checkWakeLock() {
    if (this.hasActiveDownloads()) {
      this.acquireWakeLock();
    } else {
      this.releaseWakeLock();
    }
  }

  hasActiveDownloads() {
    return Array.from(this.torrents.values()).some(t => t.status === 'downloading');
  }

  // --- Storage Quota ---
  async updateStorageQuota() {
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        const usedMB = ((est.usage || 0) / (1024 * 1024)).toFixed(1);
        const quotaGB = ((est.quota || 0) / (1024 * 1024 * 1024)).toFixed(1);
        const el = document.getElementById('globalStorageEst');
        if (el) el.innerText = `OPFS: ${usedMB} MB / ${quotaGB} GB`;
      } catch (e) {}
    }
  }

  // --- Persistence & Supabase Sync ---
  persistLibrary() {
    const list = Array.from(this.torrents.values()).map(t => ({
      id: t.meta.id,
      name: t.meta.name,
      magnet: t.meta.magnet,
      size: t.meta.size,
      status: t.status,
      addedAt: t.meta.addedAt,
      opfsSaved: t.opfsSaved
    }));

    this.savedLibrary = list;
    try {
      localStorage.setItem('moodflix_torrent_library', JSON.stringify(list));
    } catch (e) {}

    // Sync to Supabase if authenticated
    this.syncToSupabase(list);
  }

  async syncToSupabase(list) {
    if (!supabaseClient) return;
    try {
      const { data } = await supabaseClient.auth.getSession();
      if (data && data.session && data.session.user) {
        await supabaseClient.from('user_torrents').upsert({
          user_id: data.session.user.id,
          library: list,
          updated_at: new Date().toISOString()
        }).catch(() => {});
      }
    } catch (err) {}
  }

  loadSavedLibrary() {
    try {
      const raw = localStorage.getItem('moodflix_torrent_library');
      if (raw) {
        const items = JSON.parse(raw);
        if (Array.isArray(items)) {
          this.savedLibrary = items;
        }
      }
    } catch (e) {}
  }

  // --- Ticker for Live UI Updates ---
  startTicker() {
    if (this.updateInterval) clearInterval(this.updateInterval);
    this.updateInterval = setInterval(async () => {
      // Poll Backend TCP/UDP Engine for real transfer stats
      try {
        const res = await fetch('/api/backend-torrent/list');
        const data = await res.json();
        if (data.success && Array.isArray(data.torrents)) {
          let totalDown = 0;
          let totalUp = 0;
          let totalPeers = 0;

          data.torrents.forEach(t => {
            const id = t.infoHash;
            let entry = this.torrents.get(id);
            if (!entry) {
              entry = {
                meta: {
                  id,
                  name: t.name,
                  magnet: t.magnet,
                  addedAt: t.addedAt || Date.now(),
                  size: t.length
                },
                status: t.status,
                opfsSaved: false,
                phase: 'TCP/UDP SWARM ACTIVE',
                logs: []
              };
              this.torrents.set(id, entry);
            }

            entry.backendStat = t;
            entry.status = t.done ? 'completed' : t.status;
            entry.meta.name = t.name || entry.meta.name;
            entry.meta.size = t.length || entry.meta.size;

            totalDown += t.downloadSpeed || 0;
            totalUp += t.uploadSpeed || 0;
            totalPeers += t.numPeers || 0;
          });

          const downEl = document.getElementById('globalDownSpeed');
          const upEl = document.getElementById('globalUpSpeed');
          const peerEl = document.getElementById('globalPeerCount');

          if (downEl) downEl.innerText = this.formatSpeed(totalDown);
          if (upEl) upEl.innerText = this.formatSpeed(totalUp);
          if (peerEl) peerEl.innerText = `${totalPeers} TCP/UDP Seeders`;
        }
      } catch (err) {}

      // Update active cards dynamically
      this.updateCardDOMs();
    }, 1500);
  }

  updateCardDOMs() {
    this.torrents.forEach((entry, id) => {
      const card = document.getElementById(`torrent_card_${id}`);
      if (!card) return;

      const stat = entry.backendStat || (entry.torrent ? {
        progress: entry.torrent.progress,
        downloadSpeed: entry.torrent.downloadSpeed,
        uploadSpeed: entry.torrent.uploadSpeed,
        numPeers: entry.torrent.numPeers,
        done: entry.torrent.done
      } : null);

      if (!stat) return;

      const progressPct = ((stat.progress || 0) * 100).toFixed(1);
      
      const fill = card.querySelector('.torrent-progress-bar-fill');
      if (fill) {
        fill.style.width = `${progressPct}%`;
        if (stat.done) fill.classList.add('complete');
      }

      const speedVal = card.querySelector('.stat-speed-val');
      if (speedVal) speedVal.innerText = `▼ ${this.formatSpeed(stat.downloadSpeed)} | ▲ ${this.formatSpeed(stat.uploadSpeed)}`;

      const peerVal = card.querySelector('.stat-peers-val');
      if (peerVal) peerVal.innerText = `${stat.numPeers} TCP/UDP Seeders`;

      const statusPill = card.querySelector('.torrent-status-pill');
      if (statusPill) {
        if (entry.status === 'paused') {
          statusPill.className = 'torrent-status-pill status-paused';
          statusPill.innerText = 'PAUSED';
        } else if (stat.done) {
          statusPill.className = 'torrent-status-pill status-completed';
          statusPill.innerText = 'COMPLETED';
        } else {
          statusPill.className = 'torrent-status-pill status-downloading';
          statusPill.innerText = `DOWNLOADING ${progressPct}%`;
        }
      }
    });
  }

  render() {
    const container = document.getElementById('torrentTransfersList');
    if (!container) return;

    const allItems = Array.from(this.torrents.values());
    
    // Update filter counts
    const countAll = document.getElementById('filterCountAll');
    const countDown = document.getElementById('filterCountDownloading');
    const countComp = document.getElementById('filterCountCompleted');
    const countPau = document.getElementById('filterCountPaused');

    const downloadingCount = allItems.filter(t => t.status === 'downloading' && !t.torrent?.done).length;
    const completedCount = allItems.filter(t => t.status === 'completed' || t.torrent?.done).length;
    const pausedCount = allItems.filter(t => t.status === 'paused').length;

    if (countAll) countAll.innerText = allItems.length;
    if (countDown) countDown.innerText = downloadingCount;
    if (countComp) countComp.innerText = completedCount;
    if (countPau) countPau.innerText = pausedCount;

    // Filter items
    let filtered = allItems;
    if (this.activeFilter === 'downloading') {
      filtered = allItems.filter(t => t.status === 'downloading' && !t.torrent?.done);
    } else if (this.activeFilter === 'completed') {
      filtered = allItems.filter(t => t.status === 'completed' || t.torrent?.done);
    } else if (this.activeFilter === 'paused') {
      filtered = allItems.filter(t => t.status === 'paused');
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-torrent-state">
          <span class="material-symbols-outlined empty-torrent-icon">cloud_download</span>
          <h3 class="empty-torrent-title">NO TRANSFERS IN QUEUE</h3>
          <p class="empty-torrent-desc">
            Paste a magnet URI above, drop a .torrent file, or browse movies from the Movies Feed to start downloading with high-speed WebRTC P2P streams.
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(entry => {
      const t = entry.torrent;
      const id = entry.meta.id;
      const name = entry.meta.name;
      const sizeStr = this.formatBytes(t ? t.length : entry.meta.size);
      const progress = t ? (t.progress * 100).toFixed(1) : (entry.status === 'completed' ? 100 : 0);
      const isDone = entry.status === 'completed' || (t && t.done);
      const isPaused = entry.status === 'paused';

      let statusClass = 'status-downloading';
      let statusText = `DOWNLOADING ${progress}%`;
      if (isPaused) {
        statusClass = 'status-paused';
        statusText = 'PAUSED';
      } else if (isDone) {
        statusClass = 'status-completed';
        statusText = 'COMPLETED';
      }

      const isLogsOpen = this.expandedCardLogs.has(id);

      return `
        <div class="torrent-card" id="torrent_card_${id}">
          <div class="torrent-card-top">
            <div class="torrent-card-title-box">
              <div class="torrent-title-text">${this.escapeHtml(name)}</div>
              <div class="torrent-meta-line">
                <span>SIZE: <strong>${sizeStr}</strong></span>
                <span>ADDED: ${new Date(entry.meta.addedAt).toLocaleTimeString()}</span>
                ${entry.opfsSaved ? '<span style="color: #137333; font-weight: bold;">[OPFS STORED]</span>' : ''}
              </div>
            </div>
            <div class="torrent-status-pill ${statusClass}">${statusText}</div>
          </div>

          <div class="torrent-progress-box">
            <div class="torrent-progress-bar-container">
              <div class="torrent-progress-bar-fill ${isDone ? 'complete' : ''}" style="width: ${progress}%;"></div>
            </div>
          </div>

          <div class="torrent-stats-grid">
            <div class="torrent-stat-item">SPEED: <span class="stat-speed-val">▼ ${this.formatSpeed(t ? t.downloadSpeed : 0)} | ▲ ${this.formatSpeed(t ? t.uploadSpeed : 0)}</span></div>
            <div class="torrent-stat-item">PEERS: <span class="stat-peers-val">${t ? t.numPeers : 0} Peers</span></div>
            <div class="torrent-stat-item">ETA: <span class="stat-eta-val">${isDone ? 'COMPLETED' : (t ? this.formatETA(t.timeRemaining) : '--')}</span></div>
          </div>

          <!-- Step Progress & Card Logs -->
          <div class="torrent-card-steps-box">
            <div class="torrent-card-steps-top">
              <span class="torrent-phase-tag">${entry.phase || 'CONNECTING TO TRACKERS'}</span>
              <button class="torrent-card-logs-toggle" onclick="window.torrentEngine.toggleCardLogs('${id}')">${isLogsOpen ? 'HIDE LOGS ▲' : 'STEP LOGS ▼'}</button>
            </div>
            ${isLogsOpen ? `
              <div class="torrent-card-log-list">
                ${(entry.logs && entry.logs.length > 0) ? entry.logs.slice(-10).map(l => `
                  <div class="torrent-card-log-item">
                    <span style="color:#777;">[${l.time}]</span>
                    <strong style="color:${l.level === 'error' ? '#ff5252' : (l.level === 'warn' ? '#ffd54f' : (l.level === 'success' ? '#81c784' : '#64b5f6'))};">[${l.tag}]</strong>
                    <span>${this.escapeHtml(l.message)}</span>
                  </div>
                `).join('') : '<div style="color:#777; font-style:italic;">No events recorded for this item yet.</div>'}
              </div>
            ` : ''}
          </div>

          <div class="torrent-actions-row">
            <div class="torrent-actions-left">
              ${isPaused ? 
                `<button class="torrent-action-btn" onclick="window.torrentEngine.resume('${id}')"><span class="material-symbols-outlined" style="font-size: 14px;">play_arrow</span> RESUME</button>` :
                (!isDone ? `<button class="torrent-action-btn" onclick="window.torrentEngine.pause('${id}')"><span class="material-symbols-outlined" style="font-size: 14px;">pause</span> PAUSE</button>` : '')
              }
              <button class="torrent-action-btn btn-stream-action" onclick="window.torrentEngine.stream('${id}')" title="Stream Video in Browser">
                <span class="material-symbols-outlined" style="font-size: 14px;">play_circle</span> STREAM / WATCH
              </button>
              <button class="torrent-action-btn btn-export-action" onclick="window.torrentEngine.exportFile('${id}')" title="Save / Export File to Device (Web Share / Files app)">
                <span class="material-symbols-outlined" style="font-size: 14px;">ios_share</span> SAVE / EXPORT
              </button>
            </div>
            <div class="torrent-actions-right">
              ${entry.meta.magnet ? `<button class="torrent-action-btn" onclick="window.torrentEngine.copyMagnet('${encodeURIComponent(entry.meta.magnet)}')" title="Copy Magnet"><span class="material-symbols-outlined" style="font-size: 14px;">link</span></button>` : ''}
              <button class="torrent-action-btn btn-delete-action" onclick="window.torrentEngine.remove('${id}')" title="Remove Torrent"><span class="material-symbols-outlined" style="font-size: 14px;">delete</span></button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = 2;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  formatSpeed(bytesPerSec) {
    if (!bytesPerSec || bytesPerSec === 0) return '0.0 KB/s';
    if (bytesPerSec < 1024 * 1024) {
      return (bytesPerSec / 1024).toFixed(1) + ' KB/s';
    }
    return (bytesPerSec / (1024 * 1024)).toFixed(2) + ' MB/s';
  }

  formatETA(ms) {
    if (!ms || ms === Infinity || isNaN(ms)) return '--';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

function initTorrentEngine() {
  window.torrentEngine = new TorrentEngineManager();
  window.torrentEngine.init();
}

