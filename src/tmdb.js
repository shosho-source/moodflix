/**
 * TMDB - The Movie Database API Client & Provider.
 * High-performance movie & TV show discovery with live v3/v4 API, Bearer Token authentication,
 * multi-page search, and tiered relevance ranking.
 */

import { Storage } from './storage.js';
import { FuzzyMatcher } from './fuzzyMatcher.js';
import { NameCleaner } from './nameCleaner.js';

export class TMDB {
  static BASE_URL = 'https://api.themoviedb.org/3';
  static IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

  static MOVIE_GENRE_MAP = {
    28: 'Action',
    12: 'Adventure',
    16: 'Animation',
    35: 'Comedy',
    80: 'Crime',
    99: 'Documentary',
    18: 'Drama',
    10751: 'Family',
    14: 'Fantasy',
    36: 'History',
    27: 'Horror',
    10402: 'Music',
    9648: 'Mystery',
    10749: 'Romance',
    878: 'Sci-Fi',
    10770: 'TV Movie',
    53: 'Thriller',
    10752: 'War',
    37: 'Western'
  };

  static TV_GENRE_MAP = {
    10759: 'Action & Adventure',
    16: 'Animation',
    35: 'Comedy',
    80: 'Crime',
    99: 'Documentary',
    18: 'Drama',
    10751: 'Family',
    10762: 'Kids',
    9648: 'Mystery',
    10763: 'News',
    10764: 'Reality',
    10765: 'Sci-Fi & Fantasy',
    10766: 'Soap',
    10767: 'Talk',
    10768: 'War & Politics',
    37: 'Western'
  };

  /**
   * Resilient HTTP fetch with rate limit / timeout retry.
   */
  static async fetchWithRetry(url, options = {}, retries = 3) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeout);

        if (res.ok) {
          return res;
        }

        if ((res.status === 429 || res.status >= 500) && attempt < retries) {
          await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
          continue;
        }
      } catch (err) {
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
      }
    }
    return null;
  }

  /**
   * Builds authentication headers and base URL query parameters.
   */
  static getAuthHeadersAndParams(options = {}) {
    const settings = Storage.getSettings();
    const token = (options.token && String(options.token).trim()) ||
      (settings.tmdbReadToken && String(settings.tmdbReadToken).trim()) ||
      (process.env.TMDB_READ_TOKEN && String(process.env.TMDB_READ_TOKEN).trim()) ||
      '';

    const apiKey = (options.apiKey && String(options.apiKey).trim()) ||
      (settings.tmdbApiKey && String(settings.tmdbApiKey).trim()) ||
      (process.env.TMDB_API_KEY && String(process.env.TMDB_API_KEY).trim()) ||
      '';

    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TheMovieCine/2.0'
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const queryParams = new URLSearchParams();
    if (!token && apiKey) {
      queryParams.append('api_key', apiKey);
    }
    queryParams.append('include_adult', 'false');

    return { headers, queryParams, hasAuth: Boolean(token || apiKey) };
  }

  /**
   * Fetch movies from live TMDB API.
   */

  /**
   * Evaluates whether an item's release year matches a year or decade filter.
   */
  static matchesYearFilter(itemYear, filterValue) {
    if (!filterValue || filterValue === 'all') return true;
    const y = parseInt(itemYear, 10);
    if (!y || isNaN(y)) return false;

    // Direct 4-digit year match
    if (/^\d{4}$/.test(filterValue)) {
      return y === parseInt(filterValue, 10);
    }

    // Decade matching: e.g. '2020s', '2010s', '2000s', '1990s', '1980s', '1970s', '1960s'
    const decadeMatch = String(filterValue).match(/^(\d{4})s$/i);
    if (decadeMatch) {
      const start = parseInt(decadeMatch[1], 10);
      return y >= start && y <= start + 9;
    }

    // Classic / pre-1970 or pre-1980
    if (filterValue === 'classic' || filterValue === 'pre_1970' || filterValue === 'pre_1980') {
      const maxYear = filterValue === 'pre_1980' ? 1979 : 1969;
      return y <= maxYear;
    }

    return true;
  }

  /**
   * Injects release year constraints into TMDB API query parameters.
   */
  static applyYearParamsToQuery(params, type, year) {
    if (!year || year === 'all' || !params) return;

    const setParam = (key, val) => {
      if (typeof params.set === 'function') {
        params.set(key, String(val));
      } else if (typeof params === 'object') {
        params[key] = val;
      }
    };

    if (/^\d{4}$/.test(year)) {
      if (type === 'tv') setParam('first_air_date_year', year);
      else setParam('primary_release_year', year);
      return;
    }

    const decadeMatch = String(year).match(/^(\d{4})s$/i);
    if (decadeMatch) {
      const start = parseInt(decadeMatch[1], 10);
      if (type === 'tv') {
        setParam('first_air_date.gte', `${start}-01-01`);
        setParam('first_air_date.lte', `${start + 9}-12-31`);
      } else {
        setParam('primary_release_date.gte', `${start}-01-01`);
        setParam('primary_release_date.lte', `${start + 9}-12-31`);
      }
      return;
    }

    if (year === 'classic' || year === 'pre_1970' || year === 'pre_1980') {
      const maxYear = year === 'pre_1980' ? '1979-12-31' : '1969-12-31';
      if (type === 'tv') setParam('first_air_date.lte', maxYear);
      else setParam('primary_release_date.lte', maxYear);
    }
  }

  static async getMovies(options = {}) {
    return TMDB.getMedia({ ...options, type: 'movie' });
  }

  /**
   * Fetch TV shows from live TMDB API.
   */
  static async getTVShows(options = {}) {
    return TMDB.getMedia({ ...options, type: 'tv' });
  }

  /**
   * Fetch combined Movies and TV shows from live TMDB API.
   */
  static async getCombinedMedia(options = {}) {
    const type = options.type || 'all';
    const search = (options.search || '').trim();
    const category = options.category || 'all';

    if (type === 'movie') return TMDB.getMovies(options);
    if (type === 'tv') return TMDB.getTVShows(options);

    const [movies, tvShows] = await Promise.all([
      TMDB.getMovies({ ...options, type: 'movie' }),
      TMDB.getTVShows({ ...options, type: 'tv' })
    ]);

    const year = options.year || 'all';
    const seen = new Set();
    let combined = [];
    const maxLen = Math.max(movies.length, tvShows.length);
    for (let i = 0; i < maxLen; i++) {
      if (movies[i] && !seen.has(`movie_${movies[i].id}`)) {
        seen.add(`movie_${movies[i].id}`);
        combined.push(movies[i]);
      }
      if (tvShows[i] && !seen.has(`tv_${tvShows[i].id}`)) {
        seen.add(`tv_${tvShows[i].id}`);
        combined.push(tvShows[i]);
      }
    }

    if (year && year !== 'all') {
      combined = combined.filter(m => TMDB.matchesYearFilter(m.year, year));
    }

    if (search && combined.length > 0) {
      return FuzzyMatcher.rankByRelevance(combined, search).slice(0, 24);
    }

    return combined.slice(0, 24);
  }

  /**
   * Fetch Anime (TV series and Movies) from live TMDB API.
   */
  static async getAnime(options = {}) {
    const search = (options.search || '').trim();
    const category = options.category || 'all';
    const mediaType = options.type || 'all'; // 'all' | 'tv' | 'movie'

    const { headers, queryParams, hasAuth } = TMDB.getAuthHeadersAndParams(options);
    if (!hasAuth) return [];

    const year = options.year || 'all';
    let items = [];
    try {
      if (search) {
        items = await TMDB.searchAnimeLive(search, mediaType, headers, queryParams, year);
      } else {
        items = await TMDB.fetchAnimeCategoryLive(category, mediaType, headers, queryParams, year);
      }
    } catch (err) {
      items = [];
    }

    if (!Array.isArray(items)) {
      items = [];
    }

    if (year && year !== 'all') {
      items = items.filter(m => TMDB.matchesYearFilter(m.year, year));
    }

    if (search && items.length > 0) {
      items = FuzzyMatcher.rankByRelevance(items, search);
    }

    return items.slice(0, 24);
  }

  /**
   * Universal media fetcher for both Movies and TV Shows.
   */
  static async getMedia(options = {}) {
    const type = options.type || 'movie';
    const search = (options.search || '').trim();
    const category = options.category || 'all';
    const year = options.year || 'all';

    let items = [];
    const { headers, queryParams, hasAuth } = TMDB.getAuthHeadersAndParams(options);

    if (hasAuth) {
      try {
        if (search) {
          items = await TMDB.searchMediaLive(search, type, headers, queryParams, year);
        } else {
          items = await TMDB.fetchCategoryLive(type, category, headers, queryParams, year);
        }
      } catch (err) {
        items = [];
      }
    }

    if (!Array.isArray(items)) {
      items = [];
    }

    if (year && year !== 'all') {
      items = items.filter(m => TMDB.matchesYearFilter(m.year, year));
    }

    // Rank search results with best match on top
    if (search && items.length > 0) {
      items = FuzzyMatcher.rankByRelevance(items, search);
    }

    if (!search && category && category !== 'all') {
      items = items.filter(m => m.category === category);
    }

    return items.slice(0, 24);
  }

  /**
   * Fetch genuinely similar movies or TV shows for a given ID.
   * Multi-tiered strategy:
   *  1. Direct franchise / collection installments (highest relevance)
   *  2. Collaborative-filtering recommendations (/recommendations)
   *  3. Shared director's acclaimed works in same tone/genre
   *  4. Algorithmic fallback (/similar)
   */
  static async getSimilarMedia(id, type = 'movie', options = {}) {
    const { headers, queryParams, hasAuth } = TMDB.getAuthHeadersAndParams(options);
    if (!hasAuth) return [];

    let effectiveType = (type || 'movie').toLowerCase();
    if (effectiveType === 'anime') effectiveType = 'tv';
    if (effectiveType !== 'tv' && effectiveType !== 'movie') effectiveType = 'movie';

    const isValidNumericId = id != null && /^\d+$/.test(String(id).trim());
    if (!isValidNumericId) return [];

    const isTv = effectiveType === 'tv';
    const targetId = parseInt(id, 10);
    const candidateMap = new Map();

    const addCandidate = (item, priorityScore = 1) => {
      if (!item || !item.id) return;
      const itemId = parseInt(item.id, 10);
      if (itemId === targetId) return; // Never recommend self
      if (!item.poster_path && !item.poster) return; // Must have poster image

      if (!candidateMap.has(itemId)) {
        candidateMap.set(itemId, {
          raw: item,
          score: priorityScore
        });
      } else {
        const existing = candidateMap.get(itemId);
        existing.score += priorityScore;
      }
    };

    // 1. Fetch recommendations endpoint (TMDB collaborative filtering recommendations)
    try {
      const recEndpoint = isTv ? `/tv/${id}/recommendations` : `/movie/${id}/recommendations`;
      const recUrl = `${TMDB.BASE_URL}${recEndpoint}?${queryParams.toString()}`;
      const recRes = await TMDB.fetchWithRetry(recUrl, { headers });
      if (recRes && recRes.ok) {
        const recData = await recRes.json();
        const recList = recData.results || [];
        recList.forEach((rec, idx) => {
          const rankBonus = Math.max(0, 30 - idx * 2);
          addCandidate(rec, 50 + rankBonus);
        });
      }
    } catch (e) {
      console.warn(`Failed to fetch recommendations for ${type} ${id}:`, e);
    }

    // 2. For movies: Check if part of a collection/franchise (e.g. Dark Knight, Dune, John Wick)
    if (!isTv) {
      try {
        const detailUrl = `${TMDB.BASE_URL}/movie/${id}?${queryParams.toString()}`;
        const detailRes = await TMDB.fetchWithRetry(detailUrl, { headers });
        if (detailRes && detailRes.ok) {
          const detailData = await detailRes.json();
          if (detailData && detailData.belongs_to_collection?.id) {
            const collUrl = `${TMDB.BASE_URL}/collection/${detailData.belongs_to_collection.id}?${queryParams.toString()}`;
            const collRes = await TMDB.fetchWithRetry(collUrl, { headers });
            if (collRes && collRes.ok) {
              const collData = await collRes.json();
              if (collData && Array.isArray(collData.parts)) {
                collData.parts.forEach(part => {
                  addCandidate(part, 120); // Top tier
                });
              }
            }
          }
        }
      } catch (e) { }
    }

    // 3. Fallback / backfill with /similar if candidate pool is under 12
    if (candidateMap.size < 12) {
      try {
        const simEndpoint = isTv ? `/tv/${id}/similar` : `/movie/${id}/similar`;
        const simUrl = `${TMDB.BASE_URL}${simEndpoint}?${queryParams.toString()}`;
        const simRes = await TMDB.fetchWithRetry(simUrl, { headers });
        if (simRes && simRes.ok) {
          const simData = await simRes.json();
          const simList = simData.results || [];
          simList.forEach((sim, idx) => {
            const rankBonus = Math.max(0, 15 - idx);
            addCandidate(sim, 10 + rankBonus);
          });
        }
      } catch (e) { }
    }

    // Sort by composite score, then by vote average / rating
    const sorted = Array.from(candidateMap.values())
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (b.raw.vote_average || 0) - (a.raw.vote_average || 0);
      })
      .slice(0, 18)
      .map(entry => {
        const item = entry.raw;
        return {
          ...(isTv ? TMDB.mapTMDBTVResult(item) : TMDB.mapTMDBMovieResult(item)),
          category: 'similar'
        };
      });

    return sorted;
  }

  /**
   * Live search against TMDB for Movies or TV Shows.
   */
  static async searchMediaLive(query, type = 'movie', headers, baseParams) {
    const raw = query.trim();
    const cleaner = new NameCleaner(raw);
    const extractedYear = cleaner.getReleaseYear();
    const cleanTitle = NameCleaner.clean(raw);

    const seenIds = new Set();
    const items = [];
    const endpoint = type === 'tv' ? '/search/tv' : '/search/movie';

    // Helper to fetch search page from TMDB
    const fetchSearchPage = async (searchTerm, year = null, page = 1) => {
      const params = new URLSearchParams(baseParams);
      params.set('query', searchTerm);
      params.set('page', page.toString());
      if (year) {
        if (type === 'tv') params.set('first_air_date_year', year);
        else params.set('primary_release_year', year);
      }

      const url = `${TMDB.BASE_URL}${endpoint}?${params.toString()}`;
      try {
        const res = await TMDB.fetchWithRetry(url, { headers });
        if (res && res.ok) {
          const data = await res.json();
          for (const item of data.results || []) {
            if (!seenIds.has(item.id)) {
              seenIds.add(item.id);
              items.push(type === 'tv' ? TMDB.mapTMDBTVResult(item) : TMDB.mapTMDBMovieResult(item));
            }
          }
        }
      } catch (e) { }
    };

    // 1. Direct query page 1 and page 2 (to gather full franchises / all installments)
    await fetchSearchPage(raw, extractedYear, 1);
    if (items.length >= 15) {
      await fetchSearchPage(raw, extractedYear, 2);
    }

    // 2. Clean query without year if year was extracted
    if (cleanTitle && cleanTitle !== raw && items.length < 10) {
      await fetchSearchPage(cleanTitle, null, 1);
    }

    // 3. Typo tolerance: If few or 0 results found, resolve spelling mistake and search again
    let corrected = null;
    if (items.length < 3) {
      corrected = await FuzzyMatcher.suggestCorrection(cleanTitle || raw);
      if (corrected && corrected.toLowerCase() !== raw.toLowerCase()) {
        const preCount = items.length;
        await fetchSearchPage(corrected, extractedYear, 1);
        if (items.length > preCount) {
          items.forEach(it => {
            if (!it.correctedQuery) it.correctedQuery = corrected;
          });
        }
      }
    }

    // 4. Fallback: If 0 results found (e.g. severe typo), search against popular/trending pool
    if (items.length === 0) {
      try {
        const popular = await TMDB.fetchCategoryLive(type, 'popular', headers, baseParams);
        const trending = await TMDB.fetchCategoryLive(type, 'trending', headers, baseParams);
        const topRated = await TMDB.fetchCategoryLive(type, 'top_rated', headers, baseParams);
        const pool = [...popular, ...trending, ...topRated];

        for (const item of pool) {
          if (!seenIds.has(item.id)) {
            const rel = FuzzyMatcher.calculateRelevanceScore(corrected || raw, item.title, item.year);
            if (rel >= 45) {
              seenIds.add(item.id);
              if (corrected) item.correctedQuery = corrected;
              items.push(item);
            }
          }
        }
      } catch (e) { }
    }

    return items;
  }

  /**
   * Translates Quiz Answers into TMDB Discover API parameters
   */
  /**
   * Translates Quiz Answers into tailored TMDB Discover API recommendations
   */
  static async getQuizRecommendations(answers = {}, options = {}) {
    const { headers, queryParams, hasAuth } = TMDB.getAuthHeadersAndParams(options);
    if (!hasAuth) return [];

    const REVERSE_GENRE_MAP = {
      "action": "28", "adventure": "12", "animation": "16", "comedy": "35", "crime": "80",
      "documentary": "99", "drama": "18", "family": "10751", "fantasy": "14", "history": "36",
      "horror": "27", "music": "10402", "mystery": "9648", "romance": "10749",
      "sci-fi": "878", "sci fi": "878", "science fiction": "878",
      "thriller": "53", "war": "10752", "western": "37", "tv movie": "10770"
    };

    const TV_REVERSE_GENRE_MAP = {
      "action": "10759", "adventure": "10759", "action & adventure": "10759", "action and adventure": "10759",
      "animation": "16", "comedy": "35", "crime": "80", "documentary": "99", "drama": "18",
      "family": "10751", "kids": "10762", "fantasy": "10765", "history": "99", "mystery": "9648", "news": "10763",
      "reality": "10764", "romance": "18", "sci-fi": "10765", "sci fi": "10765", "science fiction": "10765",
      "sci-fi & fantasy": "10765", "sci-fi and fantasy": "10765", "soap": "10766", "talk": "10767",
      "thriller": "9648", "horror": "9648", "war": "10768", "war & politics": "10768",
      "western": "37"
    };

    // Track whether genres were explicitly picked
    const hasExplicitGenres = Array.isArray(answers.genres) && answers.genres.length > 0;
    const isHorrorExplicit = hasExplicitGenres && answers.genres.some(g => String(g).toLowerCase() === 'horror');

    // Special handling for Mind Benders preset: must return genuine mind benders, not generic sci-fi
    const isMindBender = Boolean(
      answers.isMindBender ||
      answers.moodPreset === 'mind' ||
      (hasExplicitGenres && answers.genres.some(g => /mind\s*bender|mindfuck|psychological/i.test(String(g))))
    );
    if (isMindBender) {
      return TMDB.getMindBenderRecommendations(answers, options);
    }

    // Determine targeted genre IDs
    const getGenreIdsForType = (dType) => {
      const mapToUse = dType === 'tv' ? TV_REVERSE_GENRE_MAP : REVERSE_GENRE_MAP;

      // 1. User explicitly picked genres
      if (hasExplicitGenres) {
        const explicit = answers.genres.map(g => mapToUse[String(g).toLowerCase()]).filter(Boolean);
        // Deduplicate (e.g. Action & Adventure both map to 10759 for TV)
        if (explicit.length > 0) return [...new Set(explicit)];
      }

      // 2. Derive focused genres from mood & occasion if user left genres empty
      const derived = new Set();
      if (answers.mood === 'happy') {
        derived.add(mapToUse['comedy']);
        derived.add(mapToUse['animation']);
        derived.add(mapToUse['family']);
      } else if (answers.mood === 'sad') {
        derived.add(mapToUse['drama']);
        derived.add(mapToUse['romance']);
      } else if (answers.mood === 'neutral') {
        derived.add(mapToUse['science fiction']);
        derived.add(mapToUse['adventure']);
        derived.add(mapToUse['mystery']);
      }

      if (answers.occasion === 'date') {
        derived.add(mapToUse['romance']);
        derived.add(mapToUse['comedy']);
      } else if (answers.occasion === 'family') {
        derived.add(mapToUse['family']);
        derived.add(mapToUse['animation']);
      } else if (answers.occasion === 'friends') {
        derived.add(mapToUse['action']);
        derived.add(mapToUse['comedy']);
        derived.add(mapToUse['adventure']);
      } else if (answers.occasion === 'solo') {
        derived.add(mapToUse['thriller']);
        derived.add(mapToUse['mystery']);
        derived.add(mapToUse['crime']);
      } else if (answers.occasion === 'partner') {
        derived.add(mapToUse['romance']);
        derived.add(mapToUse['drama']);
      }

      return Array.from(derived).filter(Boolean);
    };

    // Pick a random page (1-3) to add variety across repeated quiz runs
    const randomPage = () => Math.floor(Math.random() * 3) + 1;

    // Shuffle array in-place (Fisher-Yates) — keeps results fresh each run
    const shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };

    const fetchDiscover = async (dType, sortBy = 'popularity.desc', minVotes = 120, minRating = 6.4, page = 1) => {
      const endpoint = dType === 'tv' ? '/discover/tv' : '/discover/movie';
      const params = new URLSearchParams(queryParams);
      params.set('sort_by', sortBy);
      params.set('vote_count.gte', String(minVotes));
      params.set('vote_average.gte', String(minRating));

      const genreIds = getGenreIdsForType(dType);
      if (genreIds.length > 0) {
        if (isHorrorExplicit && dType === 'movie') {
          // If Horror is chosen for movies, MUST include Horror (27)
          const otherGenreIds = genreIds.filter(id => id !== '27');
          if (otherGenreIds.length > 0) {
            // Horror + other genres: require Horror (27) AND one of the others
            params.set('with_genres', `27,${otherGenreIds.join('|')}`);
          } else {
            params.set('with_genres', '27');
          }
          // Exclude kids/family and music shorts when horror is requested (unless explicitly chosen)
          const exclude = [];
          if (!answers.genres?.some(g => /family/i.test(g))) exclude.push('10751');
          if (!answers.genres?.some(g => /music/i.test(g))) exclude.push('10402');
          if (exclude.length > 0) params.set('without_genres', exclude.join(','));
        } else if (isHorrorExplicit && dType === 'tv') {
          // For TV: filter to Mystery / Sci-Fi & Fantasy and exclude lighthearted categories
          params.set('with_genres', '9648|10765');
          params.set('without_genres', '10751,10762,10763,10764,10766,10767');
        } else {
          // User-selected genres: use | (OR) so picking more genres broadens results
          // Derived genres: use , (AND) so mood+occasion combo narrows to specific overlap
          const joinOp = hasExplicitGenres ? '|' : ',';
          params.set('with_genres', genreIds.join(joinOp));
        }
      }

      // Recency filter
      if (answers.recency && answers.recency !== 'any') {
        const cutoff = new Date().getFullYear() - parseInt(answers.recency, 10);
        if (dType === 'tv') {
          params.set('first_air_date.gte', `${cutoff}-01-01`);
        } else {
          params.set('primary_release_date.gte', `${cutoff}-01-01`);
        }
      }

      params.set('page', String(page));
      const url = `${TMDB.BASE_URL}${endpoint}?${params.toString()}`;

      try {
        const res = await TMDB.fetchWithRetry(url, { headers });
        if (!res || !res.ok) return [];
        const data = await res.json();
        let mapped = (data.results || []).map(r => ({
          ...(dType === 'tv' ? TMDB.mapTMDBTVResult(r) : TMDB.mapTMDBMovieResult(r)),
          category: 'quiz'
        }));

        // Strict post-filter for horror
        if (isHorrorExplicit) {
          if (dType === 'movie') {
            // Strictly require Horror in the genres list
            mapped = mapped.filter(m => m.genres && m.genres.some(g => String(g).toLowerCase() === 'horror'));
          } else {
            // Exclude kids/family/reality/soaps for TV
            mapped = mapped.filter(s => s.genres && !s.genres.some(g => /kids|family|reality|soap|news|talk/i.test(g)));
          }
        }

        return mapped;
      } catch (e) {
        return [];
      }
    };

    const fetchCategorySet = async (dType) => {
      // Fetch from random pages and multiple sort strategies for variety
      const popPage = randomPage();
      const topPage = randomPage();

      const [popularList, topRatedList] = await Promise.all([
        fetchDiscover(dType, 'popularity.desc', 80, 6.0, popPage),
        fetchDiscover(dType, 'vote_average.desc', 200, 6.5, topPage)
      ]);

      // If a random page returned 0 results, retry with page 1
      const safePop = popularList.length > 0 ? popularList :
        await fetchDiscover(dType, 'popularity.desc', 60, 5.8, 1);
      const safeTop = topRatedList.length > 0 ? topRatedList :
        await fetchDiscover(dType, 'vote_average.desc', 150, 6.2, 1);

      const seen = new Set();
      const merged = [];

      // Interleave popular and top-rated
      const maxLen = Math.max(safePop.length, safeTop.length);
      for (let i = 0; i < maxLen; i++) {
        if (safePop[i] && !seen.has(safePop[i].id)) {
          seen.add(safePop[i].id);
          merged.push(safePop[i]);
        }
        if (safeTop[i] && !seen.has(safeTop[i].id)) {
          seen.add(safeTop[i].id);
          merged.push(safeTop[i]);
        }
      }

      // If multiple genres were requested with Horror, rank hybrid matches first
      if (isHorrorExplicit && hasExplicitGenres && answers.genres.length > 1) {
        const otherGenresLower = answers.genres
          .map(g => String(g).toLowerCase())
          .filter(g => g !== 'horror');

        merged.sort((a, b) => {
          const aHasOther = a.genres.some(g => otherGenresLower.includes(String(g).toLowerCase()));
          const bHasOther = b.genres.some(g => otherGenresLower.includes(String(g).toLowerCase()));
          if (aHasOther && !bHasOther) return -1;
          if (!aHasOther && bHasOther) return 1;
          return 0;
        });
        return merged;
      }

      // Shuffle the merged results so the order isn't always the same
      return shuffle(merged);
    };

    let finalResults = [];
    if (answers.mediaPreference === 'both') {
      const [movieSet, tvSet] = await Promise.all([
        fetchCategorySet('movie'),
        fetchCategorySet('tv')
      ]);
      const maxLen = Math.max(movieSet.length, tvSet.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < movieSet.length) finalResults.push(movieSet[i]);
        if (i < tvSet.length) finalResults.push(tvSet[i]);
      }
    } else if (answers.mediaPreference === 'tv') {
      finalResults = await fetchCategorySet('tv');
    } else {
      finalResults = await fetchCategorySet('movie');
    }

    // Fallback: if AND-joined derived genres were too strict, retry with OR
    if (finalResults.length === 0 && !hasExplicitGenres) {
      const dType = answers.mediaPreference === 'tv' ? 'tv' : 'movie';
      // Re-derive genre IDs from mood/occasion but join with OR this time
      const genreIds = getGenreIdsForType(dType);

      // Manual OR-joined discover call
      const endpoint = dType === 'tv' ? '/discover/tv' : '/discover/movie';
      const params = new URLSearchParams(queryParams);
      params.set('sort_by', 'popularity.desc');
      params.set('vote_count.gte', '50');
      params.set('vote_average.gte', '5.5');
      if (genreIds.length > 0) {
        params.set('with_genres', genreIds.join('|'));
      }
      if (answers.recency && answers.recency !== 'any') {
        const cutoff = new Date().getFullYear() - parseInt(answers.recency, 10);
        const dateKey = dType === 'tv' ? 'first_air_date.gte' : 'primary_release_date.gte';
        params.set(dateKey, `${cutoff}-01-01`);
      }
      params.set('page', '1');

      try {
        const url = `${TMDB.BASE_URL}${endpoint}?${params.toString()}`;
        const res = await TMDB.fetchWithRetry(url, { headers });
        if (res && res.ok) {
          const data = await res.json();
          finalResults = (data.results || []).map(r => ({
            ...(dType === 'tv' ? TMDB.mapTMDBTVResult(r) : TMDB.mapTMDBMovieResult(r)),
            category: 'quiz'
          }));
        }
      } catch (e) { }
    }

    // Final fallback if everything was too strict (maintaining horror constraint if requested)
    if (finalResults.length === 0) {
      const dType = answers.mediaPreference === 'tv' ? 'tv' : 'movie';
      const endpoint = dType === 'tv' ? '/discover/tv' : '/discover/movie';
      const params = new URLSearchParams(queryParams);
      params.set('sort_by', 'popularity.desc');
      params.set('vote_count.gte', '20');
      params.set('vote_average.gte', '4.5');
      if (isHorrorExplicit && dType === 'movie') {
        params.set('with_genres', '27');
      }
      params.set('page', '1');
      try {
        const url = `${TMDB.BASE_URL}${endpoint}?${params.toString()}`;
        const res = await TMDB.fetchWithRetry(url, { headers });
        if (res && res.ok) {
          const data = await res.json();
          let items = (data.results || []).map(r => ({
            ...(dType === 'tv' ? TMDB.mapTMDBTVResult(r) : TMDB.mapTMDBMovieResult(r)),
            category: 'quiz'
          }));
          if (isHorrorExplicit && dType === 'movie') {
            items = items.filter(m => m.genres && m.genres.some(g => String(g).toLowerCase() === 'horror'));
          }
          finalResults = shuffle(items);
        }
      } catch (e) { }
    }

    return finalResults.slice(0, 24);
  }

  /**
   * Dedicated recommendation engine for Mind Benders.
   * Ensures only genuine mind benders, cerebral mysteries, psychological thrillers,
   * and reality-bending films are returned, while strictly filtering out generic sci-fi,
   * superhero/popcorn action, family movies, and kids animation.
   */
  static async getMindBenderRecommendations(answers = {}, options = {}) {
    const { headers, queryParams, hasAuth } = TMDB.getAuthHeadersAndParams(options);
    if (!hasAuth) return [];

    const mediaPreference = answers.mediaPreference || 'movies';
    const isTV = mediaPreference === 'tv';
    const isBoth = mediaPreference === 'both';

    // Curated canon of verified legendary movie Mind Benders
    const CANONICAL_MIND_BENDERS = [
      { id: 27205, title: 'Inception', year: 2010, rating: 8.4, ratingPercent: 84, voteCount: 36000, genres: ['Action', 'Sci-Fi', 'Crime'], backdrop: 'https://image.tmdb.org/t/p/w1280/8ZTVqvKDQU8emYGUxPtZji9umPL.jpg', poster: `${TMDB.IMAGE_BASE_URL}/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg`, synopsis: 'Cobb, a skilled thief who commits corporate espionage by infiltrating the subconscious of his targets, is offered a chance to regain his old life as payment for a task considered to be impossible: inception.' },
      { id: 11324, title: 'Shutter Island', year: 2010, rating: 8.2, ratingPercent: 82, voteCount: 23500, genres: ['Drama', 'Thriller', 'Mystery'], backdrop: 'https://image.tmdb.org/t/p/w1280/c24sv2weTHPsmDa7jEMN0m2P3RT.jpg', poster: `${TMDB.IMAGE_BASE_URL}/4GDy0PHYX3VRXUtwK5ysFbg3kEx.jpg`, synopsis: "World War II soldier-turned-U.S. Marshal Teddy Daniels investigates the disappearance of a patient from Boston's Shutter Island Ashecliffe Hospital." },
      { id: 77, title: 'Memento', year: 2000, rating: 8.2, ratingPercent: 82, voteCount: 14800, genres: ['Mystery', 'Thriller'], backdrop: 'https://image.tmdb.org/t/p/w1280/mMZWTv4tE6EupQ04kYp0v8K4P9v.jpg', poster: `${TMDB.IMAGE_BASE_URL}/yuNs09hvpHVU1cBTCA99x5w2Qyn.jpg`, synopsis: 'Leonard Shelby is tracking down the man who raped and murdered his wife while suffering from a rare, untreatable form of short-term memory loss.' },
      { id: 1124, title: 'The Prestige', year: 2006, rating: 8.2, ratingPercent: 82, voteCount: 16000, genres: ['Drama', 'Mystery', 'Sci-Fi'], backdrop: 'https://image.tmdb.org/t/p/w1280/bdp5F76lYmE9V7vGjR8mE7oR60F.jpg', poster: `${TMDB.IMAGE_BASE_URL}/tRNlZbgNCNOpLpbPEz5L8G8A0JN.jpg`, synopsis: 'A mysterious story of two magicians whose intense rivalry leads them on a life-long battle for supremacy -- full of obsession, deceit and jealousy.' },
      { id: 550, title: 'Fight Club', year: 1999, rating: 8.4, ratingPercent: 84, voteCount: 29000, genres: ['Drama', 'Thriller'], backdrop: 'https://image.tmdb.org/t/p/w1280/hZkgoQYus5vegHoetLkCJzb17zJ.jpg', poster: `${TMDB.IMAGE_BASE_URL}/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg`, synopsis: 'A ticking-time-bomb insomniac and a slippery soap salesman channel primal male aggression into a shocking new form of therapy.' },
      { id: 603, title: 'The Matrix', year: 1999, rating: 8.2, ratingPercent: 82, voteCount: 25000, genres: ['Action', 'Sci-Fi'], backdrop: 'https://image.tmdb.org/t/p/w1280/fNG7i7rqMErkcqhohV2a6JWdlv0.jpg', poster: `${TMDB.IMAGE_BASE_URL}/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg`, synopsis: 'A computer hacker learns from mysterious rebels about the true nature of his reality and his role in the war against its controllers.' },
      { id: 157336, title: 'Interstellar', year: 2014, rating: 8.4, ratingPercent: 84, voteCount: 35000, genres: ['Adventure', 'Drama', 'Sci-Fi'], backdrop: 'https://image.tmdb.org/t/p/w1280/xJHokMbljvjADYdit5fK5VQsXEG.jpg', poster: `${TMDB.IMAGE_BASE_URL}/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg`, synopsis: 'The adventures of a group of explorers who make use of a newly discovered wormhole to surpass the limitations on human space travel.' },
      { id: 141, title: 'Donnie Darko', year: 2001, rating: 7.8, ratingPercent: 78, voteCount: 12500, genres: ['Fantasy', 'Drama', 'Mystery'], backdrop: 'https://image.tmdb.org/t/p/w1280/bM4u6m5jVv7G9r8L0Y6wN3Z2b9y.jpg', poster: `${TMDB.IMAGE_BASE_URL}/jdfZ080i1rW0zG7V13Jp0xP4T4B.jpg`, synopsis: 'After narrowly escaping a bizarre accident, a troubled teenager is plagued by visions of a large bunny rabbit that manipulates him into crimes.' },
      { id: 220289, title: 'Coherence', year: 2013, rating: 7.3, ratingPercent: 73, voteCount: 2600, genres: ['Thriller', 'Sci-Fi', 'Mystery'], backdrop: 'https://image.tmdb.org/t/p/w1280/qf2e2h1mP6Bv8K7Y1V9t3e5v7x9.jpg', poster: `${TMDB.IMAGE_BASE_URL}/jWc0bK2Q9v7k3x7B1v3y8N1x7Y9.jpg`, synopsis: 'Strange things begin to happen when a group of friends gather for a dinner party on an evening when a comet passes overhead.' },
      { id: 206487, title: 'Predestination', year: 2014, rating: 7.4, ratingPercent: 74, voteCount: 6200, genres: ['Sci-Fi', 'Thriller'], backdrop: 'https://image.tmdb.org/t/p/w1280/m9N8j7Y1V9t3e5v7x9P6Bv8K7Y1.jpg', poster: `${TMDB.IMAGE_BASE_URL}/n5H9x7B1v3y8N1x7Y9jWc0bK2Q9.jpg`, synopsis: 'The life of a time-traveling Temporal Agent on his final assignment, pursuing an elusive criminal throughout time.' },
      { id: 38, title: 'Eternal Sunshine of the Spotless Mind', year: 2004, rating: 8.1, ratingPercent: 81, voteCount: 14500, genres: ['Sci-Fi', 'Drama', 'Romance'], backdrop: 'https://image.tmdb.org/t/p/w1280/57T5PecWvX6a6pA4M5Z4q2H6p0r.jpg', poster: `${TMDB.IMAGE_BASE_URL}/5MwkWH9tYHv3mV9OdYTMR5qreIz.jpg`, synopsis: 'Joel Barish, heartbroken that his girlfriend underwent a procedure to erase him from her memory, decides to undergo the same procedure.' },
      { id: 329865, title: 'Arrival', year: 2016, rating: 7.6, ratingPercent: 76, voteCount: 17500, genres: ['Drama', 'Sci-Fi', 'Mystery'], backdrop: 'https://image.tmdb.org/t/p/w1280/y2Ajnh24Xv3Mv9OdYTMR5qreIz.jpg', poster: `${TMDB.IMAGE_BASE_URL}/x2OgozgDp5r6bRm6QL40vC7tV9y.jpg`, synopsis: 'An expert linguist is recruited by the military to determine whether alien crafts appearing around the world come in peace or are a threat.' },
      { id: 577922, title: 'Tenet', year: 2020, rating: 7.2, ratingPercent: 72, voteCount: 9600, genres: ['Action', 'Sci-Fi', 'Thriller'], backdrop: 'https://image.tmdb.org/t/p/w1280/wzJRB4NaiQDAuRY9xqi5IRagGFt.jpg', poster: `${TMDB.IMAGE_BASE_URL}/k68nPLbIST6NP96JmTxmZijEvCA.jpg`, synopsis: 'Armed with only one word - Tenet - and fighting for the survival of the entire world, the Protagonist journeys through international espionage.' },
      { id: 37165, title: 'The Truman Show', year: 1998, rating: 8.1, ratingPercent: 81, voteCount: 18000, genres: ['Comedy', 'Drama', 'Sci-Fi'], backdrop: 'https://image.tmdb.org/t/p/w1280/7C921bu0P78iW4qM5Z4q2H6p0r.jpg', poster: `${TMDB.IMAGE_BASE_URL}/vuza0WqY239muDc1EVj4657Z1Z.jpg`, synopsis: 'An insurance salesman discovers his whole life is actually a reality TV show broadcast live to the entire world.' },
      { id: 45612, title: 'Source Code', year: 2011, rating: 7.3, ratingPercent: 73, voteCount: 9200, genres: ['Thriller', 'Sci-Fi', 'Mystery'], backdrop: 'https://image.tmdb.org/t/p/w1280/qf2e2h1mP6Bv8K7Y1V9t3e5v7x9.jpg', poster: `${TMDB.IMAGE_BASE_URL}/ogsqhLss2gQvO6v5eJ1q6F7tV9y.jpg`, synopsis: 'A soldier wakes up in the body of an unknown commuter in an 8-minute loop to identify the bomber of a Chicago train.' },
      { id: 26466, title: 'Triangle', year: 2009, rating: 6.9, ratingPercent: 69, voteCount: 2500, genres: ['Horror', 'Mystery', 'Thriller'], backdrop: 'https://image.tmdb.org/t/p/w1280/bM4u6m5jVv7G9r8L0Y6wN3Z2b9y.jpg', poster: `${TMDB.IMAGE_BASE_URL}/7C921bu0P78iW4qM5Z4q2H6p0r.jpg`, synopsis: 'The passengers of a yachting trip in the Atlantic Ocean take shelter on a derelict ocean liner that is caught in an eerie time loop.' },
      { id: 745, title: 'The Sixth Sense', year: 1999, rating: 8.0, ratingPercent: 80, voteCount: 11000, genres: ['Mystery', 'Thriller', 'Drama'], backdrop: 'https://image.tmdb.org/t/p/w1280/bdp5F76lYmE9V7vGjR8mE7oR60F.jpg', poster: `${TMDB.IMAGE_BASE_URL}/4AfSDjjCy6T5LA1BCisGRSmGi2a.jpg`, synopsis: 'A child psychologist starts treating an isolated young boy who claims to see dead people.' },
      { id: 264660, title: 'Ex Machina', year: 2014, rating: 7.6, ratingPercent: 76, voteCount: 13000, genres: ['Drama', 'Sci-Fi'], backdrop: 'https://image.tmdb.org/t/p/w1280/mMZWTv4tE6EupQ04kYp0v8K4P9v.jpg', poster: `${TMDB.IMAGE_BASE_URL}/tl7O7W51k2iSgV4F6q7W51k2iSg.jpg`, synopsis: 'A young programmer evaluates the human qualities of a breathtaking humanoid A.I. at a remote mountain retreat.' },
      { id: 2666, title: 'Dark City', year: 1998, rating: 7.3, ratingPercent: 73, voteCount: 2800, genres: ['Mystery', 'Sci-Fi'], backdrop: 'https://image.tmdb.org/t/p/w1280/xJHokMbljvjADYdit5fK5VQsXEG.jpg', poster: `${TMDB.IMAGE_BASE_URL}/9w1XG1yX7o1M8b0Y6wN3Z2b9y.jpg`, synopsis: 'A man struggles with memories in a nightmarish, nocturnal world controlled by beings with telekinetic powers.' },
      { id: 4553, title: 'The Machinist', year: 2004, rating: 7.5, ratingPercent: 75, voteCount: 5600, genres: ['Drama', 'Thriller'], backdrop: 'https://image.tmdb.org/t/p/w1280/mMZWTv4tE6EupQ04kYp0v8K4P9v.jpg', poster: `${TMDB.IMAGE_BASE_URL}/vU5W4q2H6p0r5MwkWH9tYHv3mV9.jpg`, synopsis: "An industrial worker who hasn't slept in a year begins to doubt his own sanity as bizarre occurrences torment him." },
      { id: 2832, title: 'Identity', year: 2003, rating: 7.2, ratingPercent: 72, voteCount: 3800, genres: ['Mystery', 'Thriller'], backdrop: 'https://image.tmdb.org/t/p/w1280/bM4u6m5jVv7G9r8L0Y6wN3Z2b9y.jpg', poster: `${TMDB.IMAGE_BASE_URL}/tRNlZbgNCNOpLpbPEz5L8G8A0JN.jpg`, synopsis: 'Ten strangers stranded at a remote Nevada motel during a storm are mysteriously murdered one by one.' },
      { id: 670, title: 'Oldboy', year: 2003, rating: 8.3, ratingPercent: 83, voteCount: 8600, genres: ['Action', 'Drama', 'Mystery', 'Thriller'], backdrop: 'https://image.tmdb.org/t/p/w1280/mMZWTv4tE6EupQ04kYp0v8K4P9v.jpg', poster: `${TMDB.IMAGE_BASE_URL}/pWDtHJqTGv97Y95YrENyP7UMnvB.jpg`, synopsis: 'After being imprisoned for 15 years, a man is released and must discover the identity of his captor.' },
      { id: 411088, title: 'The Invisible Guest', year: 2016, rating: 8.1, ratingPercent: 81, voteCount: 4700, genres: ['Crime', 'Mystery', 'Thriller'], backdrop: 'https://image.tmdb.org/t/p/w1280/mMZWTv4tE6EupQ04kYp0v8K4P9v.jpg', poster: `${TMDB.IMAGE_BASE_URL}/7C921bu0P78iW4qM5Z4q2H6p0r.jpg`, synopsis: 'A successful businessman accused of murder works with a witness preparation expert to devise his defense in a gripping puzzle.' },
      { id: 807, title: 'Se7en', year: 1995, rating: 8.4, ratingPercent: 84, voteCount: 21000, genres: ['Crime', 'Mystery', 'Thriller'], backdrop: 'https://image.tmdb.org/t/p/w1280/mMZWTv4tE6EupQ04kYp0v8K4P9v.jpg', poster: `${TMDB.IMAGE_BASE_URL}/6yoghtyTpznpBik8EngEmJskVUO.jpg`, synopsis: 'Two detectives hunt a serial killer who stages elaborate murders inspired by the seven deadly sins.' },
      { id: 629, title: 'The Usual Suspects', year: 1995, rating: 8.2, ratingPercent: 82, voteCount: 10400, genres: ['Drama', 'Crime', 'Thriller'], backdrop: 'https://image.tmdb.org/t/p/w1280/mMZWTv4tE6EupQ04kYp0v8K4P9v.jpg', poster: `${TMDB.IMAGE_BASE_URL}/bUPmtQzrRhzg2KiVYMpVIv23Qm1.jpg`, synopsis: 'Held in an L.A. interrogation room, a crippled con man weaves a tale of the elusive mastermind Keyser Söze.' },
      { id: 146233, title: 'Prisoners', year: 2013, rating: 8.1, ratingPercent: 81, voteCount: 12100, genres: ['Drama', 'Thriller', 'Mystery'], backdrop: 'https://image.tmdb.org/t/p/w1280/mMZWTv4tE6EupQ04kYp0v8K4P9v.jpg', poster: `${TMDB.IMAGE_BASE_URL}/uhvi6kud6mcl5zgvF4iJgHq81X.jpg`, synopsis: "When a father's daughter goes missing and the police release the primary suspect, he takes matters into his own hands." },
      { id: 210577, title: 'Gone Girl', year: 2014, rating: 7.9, ratingPercent: 79, voteCount: 18500, genres: ['Mystery', 'Thriller', 'Drama'], backdrop: 'https://image.tmdb.org/t/p/w1280/mMZWTv4tE6EupQ04kYp0v8K4P9v.jpg', poster: `${TMDB.IMAGE_BASE_URL}/qymaZZQb5xsTQ2BYu99XgCgxiqU.jpg`, synopsis: 'A man becomes the center of an intense media circus and criminal investigation after his wife mysteriously vanishes.' },
      { id: 496243, title: 'Parasite', year: 2019, rating: 8.5, ratingPercent: 85, voteCount: 18000, genres: ['Comedy', 'Thriller', 'Drama'], backdrop: 'https://image.tmdb.org/t/p/w1280/mMZWTv4tE6EupQ04kYp0v8K4P9v.jpg', poster: `${TMDB.IMAGE_BASE_URL}/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg`, synopsis: 'A poor family schemes to become employed by a wealthy family by infiltrating their household, sparking unforeseen consequences.' },
      { id: 10494, title: 'Perfect Blue', year: 1998, rating: 8.3, ratingPercent: 83, voteCount: 2700, genres: ['Animation', 'Thriller'], backdrop: 'https://image.tmdb.org/t/p/original/mHG7dpLb0ZScSY3LpP443IHRmjy.jpg', poster: 'https://image.tmdb.org/t/p/w500/6WTiOCfDPP8XV4jqfloiVWf7KHq.jpg', synopsis: 'A pop idol sheds her innocent image to become an actress, but slips into a descent where reality and delusion blur.' },
      { id: 419430, title: 'Get Out', year: 2017, rating: 7.6, ratingPercent: 76, voteCount: 17000, genres: ['Mystery', 'Thriller', 'Horror'], backdrop: 'https://image.tmdb.org/t/p/w1280/mMZWTv4tE6EupQ04kYp0v8K4P9v.jpg', poster: `${TMDB.IMAGE_BASE_URL}/tFXcEccSQMf3lfhfXKSU9iRBpa3.jpg`, synopsis: "A young African-American visits his white girlfriend's parents for the weekend, where a disturbing secret unravels." },
      { id: 1954, title: 'The Butterfly Effect', year: 2004, rating: 7.5, ratingPercent: 75, voteCount: 7800, genres: ['Sci-Fi', 'Thriller'], backdrop: 'https://image.tmdb.org/t/p/w1280/mMZWTv4tE6EupQ04kYp0v8K4P9v.jpg', poster: `${TMDB.IMAGE_BASE_URL}/pWDtHJqTGv97Y95YrENyP7UMnvB.jpg`, synopsis: 'A young man discovers he can travel back in time to change his past, but each change alters the future with devastating consequences.' },
      { id: 1018, title: 'Mulholland Drive', year: 2001, rating: 7.9, ratingPercent: 79, voteCount: 6300, genres: ['Thriller', 'Drama', 'Mystery'], backdrop: 'https://image.tmdb.org/t/p/original/g9ClaS5EqU0Hk8WIbMNhld0Bk6f.jpg', poster: 'https://image.tmdb.org/t/p/w500/x7A59t6ySylr1L7aubOQEA480vM.jpg', synopsis: 'An aspiring actress befriends an amnesiac woman recovering from a car accident as dreams and reality warp in Hollywood.' },
      { id: 63, title: 'Twelve Monkeys', year: 1995, rating: 7.6, ratingPercent: 76, voteCount: 8200, genres: ['Mystery', 'Sci-Fi', 'Thriller'], backdrop: 'https://image.tmdb.org/t/p/original/mKIkGoyuR71qz6FdiEiOjxvBQcS.jpg', poster: 'https://image.tmdb.org/t/p/w500/gt3iyguaCIw8DpQZI1LIN5TohM2.jpg', synopsis: 'In a future world devastated by disease, a convict is sent back in time to gather information about the origin of the deadly virus.' },
      { id: 44214, title: 'Black Swan', year: 2010, rating: 7.7, ratingPercent: 77, voteCount: 14000, genres: ['Drama', 'Thriller'], backdrop: 'https://image.tmdb.org/t/p/original/eDLp4uFdqP1gpy9oMrutwH6Q64I.jpg', poster: 'https://image.tmdb.org/t/p/w500/viWheBd44bouiLCHgNMvahLThqx.jpg', synopsis: 'A ballet dancer wins the lead in "Swan Lake" and is pushed to the edge of sanity as she struggles to embrace her dark side.' },
      { id: 619264, title: 'The Platform', year: 2019, rating: 7.0, ratingPercent: 70, voteCount: 6800, genres: ['Sci-Fi', 'Thriller', 'Drama'], backdrop: 'https://image.tmdb.org/t/p/original/3tkDMNfM2YuIAJlvGO6rfIzAnfG.jpg', poster: 'https://image.tmdb.org/t/p/w500/iXvQnzy6JCAx1PiQEKXuTY04ZHl.jpg', synopsis: 'A vertical prison with one cell per level. Two people per cell. Only one food platform and two minutes per day to feed.' },
      { id: 431, title: 'Cube', year: 1997, rating: 6.9, ratingPercent: 69, voteCount: 3400, genres: ['Thriller', 'Mystery', 'Sci-Fi'], backdrop: 'https://image.tmdb.org/t/p/original/3TimUBrXMVblpnTsyg4HssGVbBv.jpg', poster: 'https://image.tmdb.org/t/p/w500/x4BTjxdrOKC27FcSkBh8KPEgnum.jpg', synopsis: 'Six strangers awake in a bizarre endless labyrinth of deadly booby-trapped cubes.' }
    ].map(m => ({ ...m, mediaType: 'movie' }));

    // Curated canon of verified legendary TV Series Mind Benders
    const CANONICAL_TV_MIND_BENDERS = [
      { id: 70523, title: 'Dark', year: 2017, rating: 8.4, ratingPercent: 84, voteCount: 6200, mediaType: 'tv', genres: ['Sci-Fi & Fantasy', 'Drama', 'Mystery'], backdrop: 'https://image.tmdb.org/t/p/w1280/3lBDg3i6nn5R2NKFCJHgGry0ahS.jpg', poster: `${TMDB.IMAGE_BASE_URL}/apbrbWs8M9lyOpJYU5WXrpFbk1Z.jpg`, synopsis: 'A missing child sets four families on a frantic hunt for answers as they unearth a mind-bending mystery that spans three generations.' },
      { id: 95396, title: 'Severance', year: 2022, rating: 8.4, ratingPercent: 84, voteCount: 3100, mediaType: 'tv', genres: ['Drama', 'Mystery', 'Sci-Fi & Fantasy'], backdrop: 'https://image.tmdb.org/t/p/w1280/ixgFmf1X59PUZam2qbAfskx2gQr.jpg', poster: 'https://image.tmdb.org/t/p/w500/pPHpeI2X1qEd1CS1SeyrdhZ4qnT.jpg', synopsis: 'Mark leads a team of office workers whose memories have been surgically divided between their work and personal lives.' },
      { id: 42009, title: 'Black Mirror', year: 2011, rating: 8.3, ratingPercent: 83, voteCount: 4900, mediaType: 'tv', genres: ['Sci-Fi & Fantasy', 'Drama', 'Mystery'], backdrop: 'https://image.tmdb.org/t/p/original/dg3OindVAGZBjlT3xYKqIAdukPL.jpg', poster: 'https://image.tmdb.org/t/p/w500/seN6rRfN0I6n8iDXjlSMk1QjNcq.jpg', synopsis: 'A contemporary British anthology series with twist-laden tales exploring twisted high-tech near futures.' },
      { id: 63247, title: 'Westworld', year: 2016, rating: 8.0, ratingPercent: 80, voteCount: 5200, mediaType: 'tv', genres: ['Sci-Fi & Fantasy', 'Western', 'Drama'], backdrop: 'https://image.tmdb.org/t/p/original/rX5hvSRB2k4YoIvRg6Zky52rWk0.jpg', poster: 'https://image.tmdb.org/t/p/w500/8MfgyFHf7XEboZJPZXCIDqqiz6e.jpg', synopsis: 'A dark odyssey about the dawn of artificial consciousness and the evolution of sin.' },
      { id: 62560, title: 'Mr. Robot', year: 2015, rating: 8.2, ratingPercent: 82, voteCount: 4600, mediaType: 'tv', genres: ['Crime', 'Drama'], backdrop: 'https://image.tmdb.org/t/p/original/uJUe985oIuRiD3hmHQYskIMc2WU.jpg', poster: 'https://image.tmdb.org/t/p/w500/kv1nRqgebSsREnd7vdC2pSGjpLo.jpg', synopsis: 'A cyber-security engineer and vigilante hacker with social anxiety disorder is recruited by an insurrectionary anarchist.' },
      { id: 46648, title: 'True Detective', year: 2014, rating: 8.3, ratingPercent: 83, voteCount: 3500, mediaType: 'tv', genres: ['Drama', 'Crime', 'Mystery'], backdrop: 'https://image.tmdb.org/t/p/original/v8YFr8BbU9qsO8PYIulzTeM6Qk.jpg', poster: 'https://image.tmdb.org/t/p/w500/cuV2O5ZyDLHSOWzg3nLVljp1ubw.jpg', synopsis: 'An anthology series in which police investigations unearth the personal and professional secrets of those involved.' },
      { id: 67744, title: 'Mindhunter', year: 2017, rating: 8.1, ratingPercent: 81, voteCount: 2600, mediaType: 'tv', genres: ['Drama', 'Crime'], backdrop: 'https://image.tmdb.org/t/p/w1280/67744.jpg', poster: `${TMDB.IMAGE_BASE_URL}/67744.jpg`, synopsis: 'In the late 1970s two FBI agents expand criminal science by delving into the psychology of murder.' },
      { id: 125988, title: 'Silo', year: 2023, rating: 8.1, ratingPercent: 81, voteCount: 1300, mediaType: 'tv', genres: ['Sci-Fi & Fantasy', 'Drama'], backdrop: 'https://image.tmdb.org/t/p/w1280/125988.jpg', poster: `${TMDB.IMAGE_BASE_URL}/125988.jpg`, synopsis: 'Men and women live in a giant underground silo with regulations they believe are meant to protect them.' },
      { id: 75219, title: 'Russian Doll', year: 2019, rating: 7.3, ratingPercent: 73, voteCount: 1100, mediaType: 'tv', genres: ['Comedy', 'Drama', 'Mystery'], backdrop: 'https://image.tmdb.org/t/p/w1280/75219.jpg', poster: `${TMDB.IMAGE_BASE_URL}/75219.jpg`, synopsis: 'A woman gets caught in a mysterious loop, repeatedly attending the same party and dying at the end of the night.' },
      { id: 54344, title: 'The Leftovers', year: 2014, rating: 7.7, ratingPercent: 77, voteCount: 1400, mediaType: 'tv', genres: ['Drama', 'Mystery', 'Sci-Fi & Fantasy'], backdrop: 'https://image.tmdb.org/t/p/w1280/54344.jpg', poster: `${TMDB.IMAGE_BASE_URL}/54344.jpg`, synopsis: 'Revolves around the mysterious disappearance of two percent of the global population.' }
    ];

    // Helper to shuffle array in-place
    const shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };

    // Known franchises and superhero/popcorn keywords to explicitly exclude
    const POPCORN_FRANCHISE_REGEX = /spider-man|superman|avengers|doctor strange|fantastic 4|batman v superman|iron man|thor|captain america|ant-man|black panther|guardians of the galaxy|shazam|aquaman|justice league|the flash|deadpool|x-men|wolverine|fast & furious|transformers|jurassic world|jurassic park|godzilla|kong|star wars|star trek|rebel moon|resident evil|alien vs predator|battleship|space jam|meg 2|bad boys|expendables/i;

    // TMDB Keywords that specifically designate mind benders / psychological twists:
    // 12565: psychological thriller, 374835: mind fuck, 326438: twist ending,
    // 362567: mind-bending, 10854: time loop, 174089: unreliable narrator,
    // 272553: psychological, 175629: alternative reality, 1453: amnesia,
    // 2340: paranoia, 851: dual identity, 1566: dreams, 288859: psychological fantasy
    const MIND_KEYWORDS = [12565, 374835, 326438, 362567, 10854, 174089, 272553, 175629, 1453, 2340, 851, 1566, 288859];

    // Discover real-time mind benders from TMDB
    const discoverMindBenders = async (dType = 'movie') => {
      const endpoint = dType === 'tv' ? '/discover/tv' : '/discover/movie';
      const page = Math.floor(Math.random() * 2) + 1; // 1 or 2 for variety
      const params = new URLSearchParams(queryParams);
      params.set('sort_by', 'popularity.desc');
      params.set('vote_count.gte', dType === 'tv' ? '80' : '120');
      params.set('vote_average.gte', '6.6');
      // Strictly exclude family, kids, music, documentary
      params.set('without_genres', '10751,10762,10402,99');
      if (dType === 'movie') {
        params.set('with_keywords', MIND_KEYWORDS.join('|'));
      } else {
        // For TV, use Mystery / Drama / Sci-Fi with psychological focus
        params.set('with_genres', '9648|10765');
      }
      if (answers.recency && answers.recency !== 'any') {
        const cutoff = new Date().getFullYear() - parseInt(answers.recency, 10);
        const dateKey = dType === 'tv' ? 'first_air_date.gte' : 'primary_release_date.gte';
        params.set(dateKey, `${cutoff}-01-01`);
      }
      params.set('page', String(page));

      try {
        const url = `${TMDB.BASE_URL}${endpoint}?${params.toString()}`;
        const res = await TMDB.fetchWithRetry(url, { headers });
        if (!res || !res.ok) return [];
        const data = await res.json();
        const raw = (data.results || []).map(r => (dType === 'tv' ? TMDB.mapTMDBTVResult(r) : TMDB.mapTMDBMovieResult(r)));

        // Strict post-filter: reject generic sci-fi, kids animation, superhero movies
        return raw.filter(m => {
          const title = (m.title || '').trim();
          if (POPCORN_FRANCHISE_REGEX.test(title)) return false;

          const genresLower = (m.genres || []).map(g => String(g).toLowerCase());
          // If sci-fi is present, it MUST also have a cerebral / mystery / thriller / drama genre
          const hasSciFi = genresLower.includes('sci-fi') || genresLower.includes('science fiction') || genresLower.includes('sci-fi & fantasy');
          if (hasSciFi) {
            const hasCerebralGenre = genresLower.some(g => ['mystery', 'thriller', 'drama', 'crime', 'horror'].includes(g));
            if (!hasCerebralGenre) return false;
          }

          // Exclude non-thriller animations
          if (genresLower.includes('animation') && !genresLower.includes('thriller') && !genresLower.includes('mystery')) {
            return false;
          }

          return true;
        });
      } catch (err) {
        return [];
      }
    };

    let discoveredMovies = [];
    let discoveredTV = [];

    if (isTV) {
      discoveredTV = await discoverMindBenders('tv');
    } else if (isBoth) {
      const [m, t] = await Promise.all([
        discoverMindBenders('movie'),
        discoverMindBenders('tv')
      ]);
      discoveredMovies = m;
      discoveredTV = t;
    } else {
      discoveredMovies = await discoverMindBenders('movie');
    }

    // Filter canonical items by recency if specified
    const recencyCutoff = (answers.recency && answers.recency !== 'any')
      ? new Date().getFullYear() - parseInt(answers.recency, 10)
      : null;

    const filterCanonicalByRecency = (items) => {
      if (!recencyCutoff) return items;
      return items.filter(i => {
        const y = parseInt(i.year, 10);
        return !isNaN(y) && y >= recencyCutoff;
      });
    };

    const eligibleCanonicalMovies = filterCanonicalByRecency(CANONICAL_MIND_BENDERS);
    const eligibleCanonicalTV = filterCanonicalByRecency(CANONICAL_TV_MIND_BENDERS);

    // Pick a randomized sample of canonical mind benders
    const shuffledCanonicalMovies = shuffle([...eligibleCanonicalMovies]).slice(0, 10);
    const shuffledCanonicalTV = shuffle([...eligibleCanonicalTV]).slice(0, 5);

    // Merge and deduplicate
    const seenIds = new Set();
    const finalResults = [];

    const addUnique = (item) => {
      if (!item || !item.id || seenIds.has(item.id)) return;
      seenIds.add(item.id);
      finalResults.push({
        ...item,
        category: 'quiz'
      });
    };

    if (isTV) {
      shuffledCanonicalTV.forEach(addUnique);
      discoveredTV.forEach(addUnique);
    } else if (isBoth) {
      const maxLen = Math.max(shuffledCanonicalMovies.length + discoveredMovies.length, shuffledCanonicalTV.length + discoveredTV.length);
      const allMovies = [...shuffledCanonicalMovies, ...discoveredMovies];
      const allTV = [...shuffledCanonicalTV, ...discoveredTV];
      for (let i = 0; i < maxLen; i++) {
        if (i < allMovies.length) addUnique(allMovies[i]);
        if (i < allTV.length) addUnique(allTV[i]);
      }
    } else {
      // Movies preference (default for Mind Benders button)
      // Interleave canonical masterpieces with dynamic discovered gems
      const totalLen = Math.max(shuffledCanonicalMovies.length, discoveredMovies.length);
      for (let i = 0; i < totalLen; i++) {
        if (i < shuffledCanonicalMovies.length) addUnique(shuffledCanonicalMovies[i]);
        if (i < discoveredMovies.length) addUnique(discoveredMovies[i]);
      }
    }

    // If still empty (e.g. strict recency had 0 results), fallback to canonical movies
    if (finalResults.length === 0) {
      CANONICAL_MIND_BENDERS.slice(0, 24).forEach(addUnique);
    }

    return finalResults.slice(0, 24);
  }

  /**
   * Fetch category feeds for Movies or TV Series.
   */
  static async fetchCategoryLive(type = 'movie', category, headers, baseParams, year = 'all') {
    let endpoint;
    const hasYear = Boolean(year && year !== 'all');
    if (type === 'tv') {
      endpoint = hasYear ? '/discover/tv' : '/trending/tv/week';
      if (category === 'top_rated') endpoint = hasYear ? '/discover/tv' : '/tv/top_rated';
      if (category === 'popular') endpoint = hasYear ? '/discover/tv' : '/tv/popular';
      if (category === 'on_the_air' || category === 'now_playing') endpoint = hasYear ? '/discover/tv' : '/tv/on_the_air';
    } else {
      endpoint = hasYear ? '/discover/movie' : '/trending/movie/week';
      if (category === 'top_rated') endpoint = hasYear ? '/discover/movie' : '/movie/top_rated';
      if (category === 'popular') endpoint = hasYear ? '/discover/movie' : '/movie/popular';
      if (category === 'now_playing') endpoint = hasYear ? '/discover/movie' : '/movie/now_playing';
    }

    const fetchPage = async (page) => {
      const params = new URLSearchParams(baseParams);
      params.set('page', page.toString());

      if (hasYear) {
        if (category === 'top_rated') {
          params.set('sort_by', 'vote_average.desc');
          params.set('vote_count.gte', '100');
        } else {
          params.set('sort_by', 'popularity.desc');
        }
        TMDB.applyYearParamsToQuery(params, type, year);
      }

      const url = `${TMDB.BASE_URL}${endpoint}?${params.toString()}`;
      const res = await TMDB.fetchWithRetry(url, { headers });
      if (!res || !res.ok) return [];
      const data = await res.json();
      return data.results || [];
    };

    const [page1, page2] = await Promise.all([fetchPage(1), fetchPage(2)]);
    const combined = [...page1, ...page2];

    let results = combined.map(r => ({
      ...(type === 'tv' ? TMDB.mapTMDBTVResult(r) : TMDB.mapTMDBMovieResult(r)),
      category: category === 'all' ? 'trending' : category
    }));

    if (hasYear) {
      results = results.filter(item => TMDB.matchesYearFilter(item.year, year));
    }

    return results;
  }

  /**
   * Fetch category feeds for Anime (TV series and Movies).
   */
  static async fetchAnimeCategoryLive(category = 'all', mediaType = 'all', headers, baseParams, year = 'all') {
    const fetchAnimeFor = async (type, page = 1) => {
      const endpoint = type === 'tv' ? '/discover/tv' : '/discover/movie';
      const params = new URLSearchParams(baseParams);
      params.set('with_genres', '16');
      params.set('with_original_language', 'ja');
      params.set('page', page.toString());
      if (year && year !== 'all') {
        TMDB.applyYearParamsToQuery(params, type, year);
      }

      if (category === 'top_rated') {
        params.set('sort_by', 'vote_average.desc');
        params.set('vote_count.gte', '50');
      } else if (category === 'popular') {
        params.set('sort_by', 'popularity.desc');
      } else if (category === 'airing' || category === 'on_the_air' || category === 'now_playing') {
        params.set('sort_by', 'popularity.desc');
        const now = new Date().toISOString().slice(0, 10);
        if (type === 'tv') {
          params.set('air_date.lte', now);
        } else {
          params.set('primary_release_date.lte', now);
        }
      } else {
        params.set('sort_by', 'popularity.desc');
      }

      const url = `${TMDB.BASE_URL}${endpoint}?${params.toString()}`;
      try {
        const res = await TMDB.fetchWithRetry(url, { headers });
        if (!res || !res.ok) return [];
        const data = await res.json();
        return (data.results || []).map(r => ({
          ...(type === 'tv' ? TMDB.mapTMDBTVResult(r) : TMDB.mapTMDBMovieResult(r)),
          category: category === 'all' ? 'trending' : category,
          isAnime: true
        }));
      } catch (e) {
        return [];
      }
    };

    if (mediaType === 'tv') {
      const [p1, p2] = await Promise.all([fetchAnimeFor('tv', 1), fetchAnimeFor('tv', 2)]);
      return [...p1, ...p2];
    } else if (mediaType === 'movie') {
      const [p1, p2] = await Promise.all([fetchAnimeFor('movie', 1), fetchAnimeFor('movie', 2)]);
      return [...p1, ...p2];
    } else {
      const [tvItems, movieItems] = await Promise.all([
        fetchAnimeFor('tv', 1),
        fetchAnimeFor('movie', 1)
      ]);
      const combined = [];
      const seen = new Set();
      const maxLen = Math.max(tvItems.length, movieItems.length);
      for (let i = 0; i < maxLen; i++) {
        if (tvItems[i] && !seen.has(`tv_${tvItems[i].id}`)) {
          seen.add(`tv_${tvItems[i].id}`);
          combined.push(tvItems[i]);
        }
        if (movieItems[i] && !seen.has(`movie_${movieItems[i].id}`)) {
          seen.add(`movie_${movieItems[i].id}`);
          combined.push(movieItems[i]);
        }
      }
      return combined;
    }
  }

  /**
   * Search Anime across TV series and Movies with typo tolerance.
   */
  static async searchAnimeLive(query, mediaType = 'all', headers, baseParams) {
    const raw = query.trim();
    const cleanTitle = NameCleaner.clean(raw);
    const seenIds = new Set();
    const items = [];

    const fetchSearchFor = async (type, searchTerm, page = 1) => {
      const endpoint = type === 'tv' ? '/search/tv' : '/search/movie';
      const params = new URLSearchParams(baseParams);
      params.set('query', searchTerm);
      params.set('page', page.toString());
      const url = `${TMDB.BASE_URL}${endpoint}?${params.toString()}`;
      try {
        const res = await TMDB.fetchWithRetry(url, { headers });
        if (res && res.ok) {
          const data = await res.json();
          return data.results || [];
        }
      } catch (e) { }
      return [];
    };

    const isAnimeMatch = (r) => {
      const hasAnimGenre = Array.isArray(r.genre_ids) && r.genre_ids.includes(16);
      const isJapanese = r.original_language === 'ja' || (Array.isArray(r.origin_country) && r.origin_country.includes('JP'));
      return hasAnimGenre || isJapanese;
    };

    const processResults = (results, type, corrected = null) => {
      const added = [];
      for (const item of results) {
        const key = `${type}_${item.id}`;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          const mapped = type === 'tv' ? TMDB.mapTMDBTVResult(item) : TMDB.mapTMDBMovieResult(item);
          mapped.isAnime = true;
          if (corrected) mapped.correctedQuery = corrected;
          added.push(mapped);
        }
      }
      return added;
    };

    const runSearch = async (term, corrected = null) => {
      const typesToSearch = mediaType === 'all' ? ['tv', 'movie'] : [mediaType];
      const searchPromises = typesToSearch.map(t => fetchSearchFor(t, term, 1));
      const resLists = await Promise.all(searchPromises);

      let found = [];
      resLists.forEach((results, idx) => {
        const t = typesToSearch[idx];
        const animeFiltered = results.filter(isAnimeMatch);
        const candidates = animeFiltered.length > 0 ? animeFiltered : results.filter(r => Array.isArray(r.genre_ids) && r.genre_ids.includes(16));
        found.push(...processResults(candidates.length > 0 ? candidates : results.slice(0, 5), t, corrected));
      });
      return found;
    };

    items.push(...await runSearch(raw));

    if (cleanTitle && cleanTitle !== raw && items.length < 5) {
      items.push(...await runSearch(cleanTitle));
    }

    let corrected = null;
    if (items.length < 3) {
      corrected = await FuzzyMatcher.suggestCorrection(cleanTitle || raw);
      if (corrected && corrected.toLowerCase() !== raw.toLowerCase()) {
        const correctedItems = await runSearch(corrected, corrected);
        items.push(...correctedItems);
      }
    }

    return items;
  }

  /**
   * Normalizes TMDB movie response object.
   */
  static mapTMDBMovieResult(item) {
    const rating = Math.round((item.vote_average || 0) * 10) / 10;
    const ratingPercent = Math.round((item.vote_average || 0) * 10);
    const releaseDate = item.release_date || '';
    const year = releaseDate ? parseInt(releaseDate.slice(0, 4), 10) : new Date().getFullYear();
    const genres = (item.genre_ids || []).map(id => TMDB.MOVIE_GENRE_MAP[id]).filter(Boolean);

    return {
      id: item.id,
      mediaType: 'movie',
      title: item.title || item.original_title,
      year,
      rating,
      ratingPercent,
      voteCount: item.vote_count || 0,
      popularity: item.popularity || 0,
      genres: genres.length > 0 ? genres : ['Movie'],
      releaseDate,
      poster: item.poster_path ? `${TMDB.IMAGE_BASE_URL}${item.poster_path}` : 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500',
      backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
      synopsis: item.overview || 'No synopsis available.',
      category: 'trending'
    };
  }

  /**
   * Normalizes TMDB TV Series response object.
   */
  static mapTMDBTVResult(item) {
    const rating = Math.round((item.vote_average || 0) * 10) / 10;
    const ratingPercent = Math.round((item.vote_average || 0) * 10);
    const firstAirDate = item.first_air_date || '';
    const year = firstAirDate ? parseInt(firstAirDate.slice(0, 4), 10) : new Date().getFullYear();
    const genres = (item.genre_ids || []).map(id => TMDB.TV_GENRE_MAP[id]).filter(Boolean);

    return {
      id: item.id,
      mediaType: 'tv',
      title: item.name || item.original_name,
      year,
      rating,
      ratingPercent,
      voteCount: item.vote_count || 0,
      popularity: item.popularity || 0,
      genres: genres.length > 0 ? genres : ['TV Series'],
      releaseDate: firstAirDate,
      firstAirDate,
      poster: item.poster_path ? `${TMDB.IMAGE_BASE_URL}${item.poster_path}` : 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=500',
      backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
      synopsis: item.overview || 'No synopsis available.',
      category: 'trending'
    };
  }

  static trailerCache = new Map();
  static _pendingTrailerFetch = new Map();

  static setTrailerCache(key, value) {
    if (!TMDB.trailerCache) TMDB.trailerCache = new Map();
    if (TMDB.trailerCache.has(key)) {
      TMDB.trailerCache.delete(key);
    } else if (TMDB.trailerCache.size >= 200) {
      const firstKey = TMDB.trailerCache.keys().next().value;
      if (firstKey) TMDB.trailerCache.delete(firstKey);
    }
    TMDB.trailerCache.set(key, value);
  }

  /**
   * Evaluates whether two titles loosely match (case/punctuation insensitive, handles subtitles).
   */
  static isTitleLooseMatch(t1, t2) {
    if (!t1 || !t2) return false;
    const clean = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    const c1 = clean(t1);
    const c2 = clean(t2);
    if (!c1 || !c2) return false;
    if (c1 === c2) return true;
    if (c1.length >= 4 && c2.length >= 4) {
      return c1.includes(c2) || c2.includes(c1);
    }
    return false;
  }

  /**
   * Search YouTube for a verified trailer key matching title and year if TMDB lacks one.
   */
  static async findYouTubeTrailer(title, year = '', type = 'movie') {
    if (!title) return null;
    const cleanTitle = String(title).trim();
    let effectiveType = (type || 'movie').toLowerCase();
    if (effectiveType === 'anime') effectiveType = 'tv';
    if (effectiveType !== 'tv' && effectiveType !== 'movie') effectiveType = 'movie';

    const cacheKey = `${effectiveType}:${cleanTitle}:${year || ''}`.toLowerCase();
    if (TMDB.trailerCache && TMDB.trailerCache.has(cacheKey)) {
      const val = TMDB.trailerCache.get(cacheKey);
      TMDB.setTrailerCache(cacheKey, val);
      return val;
    }
    if (TMDB._pendingTrailerFetch && TMDB._pendingTrailerFetch.has(cacheKey)) {
      return TMDB._pendingTrailerFetch.get(cacheKey);
    }

    const fetchPromise = (async () => {
      try {
        // 1. FIRST: Check TMDB API directly for this title! (TMDB indexes official studio trailers)
        try {
          const { headers, queryParams } = TMDB.getAuthHeadersAndParams();
          const sParams = new URLSearchParams(queryParams);
          sParams.set('query', cleanTitle);
          sParams.set('page', '1');
          const searchUrl = `${TMDB.BASE_URL}/search/multi?${sParams.toString()}`;
          const sRes = await TMDB.fetchWithRetry(searchUrl, { headers });
          if (sRes && sRes.ok) {
            const sData = await sRes.json();
            const results = (sData.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv');
            if (results.length > 0) {
              const best = (year ? results.find(r => (r.release_date || r.first_air_date || '').substring(0, 4) === String(year) && TMDB.isTitleLooseMatch(cleanTitle, r.title || r.name)) : null)
                || results.find(r => TMDB.isTitleLooseMatch(cleanTitle, r.title || r.name))
                || results[0];

              if (best && best.id) {
                const origLang = (best.original_language || 'en').toLowerCase();
                const vUrl = `${TMDB.BASE_URL}/${best.media_type}/${best.id}/videos?include_video_language=en,null,${origLang}`;
                const vRes = await TMDB.fetchWithRetry(vUrl, { headers });
                if (vRes && vRes.ok) {
                  const vData = await vRes.json();
                  const trailers = (vData.results || []).filter(v => v.site === 'YouTube' && v.key && (v.type === 'Trailer' || v.type === 'Teaser'));
                  if (trailers.length > 0) {
                    const topTrailer = trailers.find(v => v.official && v.iso_639_1 === 'en')
                      || trailers.find(v => v.type === 'Trailer')
                      || trailers[0];
                    if (topTrailer && topTrailer.key) {
                      TMDB.setTrailerCache(cacheKey, topTrailer.key);
                      return topTrailer.key;
                    }
                  }
                }
              }
            }
          }
        } catch (tmdbErr) {
          console.warn('[TMDB findYouTubeTrailer TMDB search error]:', tmdbErr.message);
        }

        // 2. SECOND: Scrape YouTube search for genuine trailers
        const isAnime = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff]|anime/i.test(cleanTitle) || type === 'anime';
        let query;
        if (isAnime) {
          query = `${cleanTitle} official anime trailer`;
        } else {
          query = `${cleanTitle} ${year ? year : ''} official trailer`;
        }
        query = query.replace(/\s+/g, ' ').trim();
        const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

        const res = await TMDB.fetchWithRetry(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9'
          }
        });
        if (!res || !res.ok) return null;

        const text = await res.text();

        // Extract video items with title from YouTube's videoRenderer
        const candidates = [];
        const seen = new Set();
        const vrBlocks = text.split('"videoRenderer":{');
        for (let i = 1; i < vrBlocks.length; i++) {
          const block = vrBlocks[i].slice(0, 2000);
          const idMatch = block.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
          const titleMatch = block.match(/"title":\{"runs":\[\{"text":"(.*?)"\}\]/);
          if (idMatch && titleMatch && !seen.has(idMatch[1])) {
            seen.add(idMatch[1]);
            candidates.push({ id: idMatch[1], title: titleMatch[1] });
          }
        }

        // Fallback extraction pattern for title
        if (candidates.length === 0) {
          const altRegex = /"videoId":"([a-zA-Z0-9_-]{11})"[^}]+?"title":\{"runs":\[\{"text":"([^"]+)"\}\]/g;
          let m;
          while ((m = altRegex.exec(text)) !== null) {
            if (!seen.has(m[1])) {
              seen.add(m[1]);
              candidates.push({ id: m[1], title: m[2] });
            }
          }
        }

        let bestKey = null;

        if (candidates.length > 0) {
          const mLower = cleanTitle.toLowerCase();
          const mediaWords = mLower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
          const badWords = [
            'soundtrack', 'full ost', 'official audio', 'music video', 'reaction',
            'review', 'ending explained', 'recap', 'breakdown', 'gameplay',
            'cover song', 'full movie', 'parody', 'instrumental', 'remix',
            'vlog', 'unboxing', 'live performance', 'karaoke'
          ];

          let highestScore = -Infinity;
          for (const cand of candidates) {
            const vLower = (cand.title || '').toLowerCase();
            if (badWords.some(bad => vLower.includes(bad))) continue;

            let score = 0;
            const matchedWords = mediaWords.filter(w => vLower.includes(w));
            if (mediaWords.length > 0 && matchedWords.length === 0) continue; // title words must match!
            score += (matchedWords.length / Math.max(1, mediaWords.length)) * 50;

            if (vLower.includes('official trailer') || vLower.includes('main trailer')) score += 60;
            else if (vLower.includes('theatrical trailer')) score += 40;
            else if (vLower.includes('trailer')) score += 30;
            else if (vLower.includes('teaser')) score += 10;

            if (vLower.includes('official')) score += 20;
            if (year && vLower.includes(String(year))) score += 15;
            if (vLower.includes('promo') || vLower.includes('preview') || vLower.includes('episode') || /\b\d+x\d+\b/.test(vLower)) {
              score -= 40;
            }

            if (score > highestScore) {
              highestScore = score;
              bestKey = cand.id;
            }
          }

          if (!bestKey && candidates.length > 0) {
            const nonBad = candidates.find(c => {
              const cLower = (c.title || '').toLowerCase();
              return !badWords.some(b => cLower.includes(b)) && (mediaWords.length === 0 || mediaWords.some(w => cLower.includes(w)));
            });
            if (nonBad) bestKey = nonBad.id;
          }
        }

        // Only cache and return if we found a verified candidate!
        // Never fall back to arbitrary unverified video IDs.
        if (bestKey) {
          TMDB.setTrailerCache(cacheKey, bestKey);
          return bestKey;
        }
      } catch (err) {
        console.warn(`[TMDB] YouTube trailer fallback search error for "${cleanTitle}":`, err.message);
      } finally {
        TMDB._pendingTrailerFetch.delete(cacheKey);
      }
      return null;
    })();

    TMDB._pendingTrailerFetch.set(cacheKey, fetchPromise);
    return await fetchPromise;
  }

  /**
   * Fetch media details including runtime, trailer, and watch providers.
   */
  static async getDetails(id, type = 'movie', options = {}) {
    const { headers, queryParams } = TMDB.getAuthHeadersAndParams(options);
    queryParams.append('append_to_response', 'videos,watch/providers,credits,aggregate_credits,images');
    queryParams.set('include_video_language', 'en,null,ja,ko,es,fr,de,zh,it,pt,ru,hi');
    queryParams.set('include_image_language', 'en,null,ja,ko,es,fr,de,zh,it,pt,ru,hi');

    let effectiveType = (type || 'movie').toLowerCase();
    if (effectiveType === 'anime') effectiveType = 'tv';
    if (effectiveType !== 'tv' && effectiveType !== 'movie') effectiveType = 'movie';

    const isValidNumericId = id != null && /^\d+$/.test(String(id).trim());
    const numericId = isValidNumericId ? String(id).trim() : null;

    let data = null;
    let resolvedType = effectiveType;

    if (numericId) {
      const url = `${TMDB.BASE_URL}/${resolvedType}/${numericId}?${queryParams.toString()}`;
      const res = await TMDB.fetchWithRetry(url, { headers });
      if (res && res.ok) {
        const fetched = await res.json();
        if (options.fallbackTitle) {
          const fetchedTitle = fetched.title || fetched.name || '';
          if (TMDB.isTitleLooseMatch(options.fallbackTitle, fetchedTitle)) {
            data = fetched;
          } else {
            // Check alternate media type in case movie/tv id collided (e.g. 550)
            const altType = resolvedType === 'movie' ? 'tv' : 'movie';
            const altUrl = `${TMDB.BASE_URL}/${altType}/${numericId}?${queryParams.toString()}`;
            const altRes = await TMDB.fetchWithRetry(altUrl, { headers });
            if (altRes && altRes.ok) {
              const altFetched = await altRes.json();
              const altTitle = altFetched.title || altFetched.name || '';
              if (TMDB.isTitleLooseMatch(options.fallbackTitle, altTitle)) {
                data = altFetched;
                resolvedType = altType;
              }
            }
          }
        } else {
          data = fetched;
        }
      }
    }

    // Fallback: If direct ID returned null or mismatched title, search TMDB directly
    if (!data && options.fallbackTitle) {
      try {
        const sParams = new URLSearchParams(queryParams);
        sParams.delete('append_to_response');
        sParams.set('query', String(options.fallbackTitle).trim());
        sParams.set('page', '1');
        const searchUrl = `${TMDB.BASE_URL}/search/multi?${sParams.toString()}`;
        const sRes = await TMDB.fetchWithRetry(searchUrl, { headers });
        if (sRes && sRes.ok) {
          const sData = await sRes.json();
          const results = (sData.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv');
          if (results.length > 0) {
            const targetYear = options.fallbackYear ? String(options.fallbackYear).trim() : '';
            const best = (targetYear ? results.find(r => (r.release_date || r.first_air_date || '').substring(0, 4) === targetYear && TMDB.isTitleLooseMatch(options.fallbackTitle, r.title || r.name)) : null)
              || results.find(r => TMDB.isTitleLooseMatch(options.fallbackTitle, r.title || r.name))
              || results[0];

            if (best && best.id) {
              resolvedType = best.media_type || resolvedType;
              const detailUrl = `${TMDB.BASE_URL}/${resolvedType}/${best.id}?${queryParams.toString()}`;
              const dRes = await TMDB.fetchWithRetry(detailUrl, { headers });
              if (dRes && dRes.ok) {
                data = await dRes.json();
              }
            }
          }
        }
      } catch (searchErr) {
        console.warn('[TMDB getDetails fallback search error]:', searchErr.message);
      }
    }

    if (!data) return null;

    let trailerKey = null;
    const trailerKeys = [];
    const seenTrailerKeys = new Set();
    const addTrailerKey = (key) => {
      if (key && typeof key === 'string' && key.length === 11 && !seenTrailerKeys.has(key)) {
        seenTrailerKeys.add(key);
        trailerKeys.push(key);
      }
    };

    const origLang = (data.original_language || 'en').toLowerCase();

    const scoreVideo = (v) => {
      let score = 0;
      const vName = (v.name || '').toLowerCase();
      const vLang = (v.iso_639_1 || '').toLowerCase();

      // 1. Type scoring
      if (v.type === 'Trailer') score += 100;
      else if (v.type === 'Teaser') score += 40;
      else if (v.type === 'Clip') score += 10;
      else score += 5;

      // 2. Official
      if (v.official) score += 50;

      // 3. Language preference: English or original language prioritized
      if (vLang === 'en') {
        score += 60;
      } else if (vLang === origLang) {
        score += 40;
      } else {
        score -= 40; // Penalize foreign dubs (e.g. Japanese dub for Inception)
      }

      // 4. Title relevance
      if (vName.includes('official trailer') || vName.includes('main trailer')) score += 40;
      else if (vName.includes('theatrical trailer')) score += 30;
      else if (vName.includes('trailer')) score += 20;

      if (vName.includes('trailer 1') || vName.includes('pv 1') || vName.includes('pv1') || vName.includes('pv第1弾') || vName.includes('first trailer')) score += 25;
      if (vName.includes('subtitled') || vName.includes('english')) score += 20;

      // 5. Avoid selecting later season previews for root show
      if (vName.includes('season 4') || vName.includes('season 3') || vName.includes('final season') || vName.includes('part 2') || vName.includes('part.2')) {
        score -= 15;
      }

      return score;
    };

    if (data.videos && Array.isArray(data.videos.results) && data.videos.results.length > 0) {
      const ytVideos = data.videos.results.filter(v => v.site === 'YouTube' && v.key);
      const sortedVideos = [...ytVideos].sort((a, b) => scoreVideo(b) - scoreVideo(a));
      sortedVideos.forEach(v => addTrailerKey(v.key));
    }

    // If append_to_response yielded 0 trailer keys, query TMDB videos endpoint directly with multiple languages
    if (trailerKeys.length === 0 && data.id) {
      try {
        const vUrl = `${TMDB.BASE_URL}/${resolvedType}/${data.id}/videos?include_video_language=en,null,${origLang}`;
        const vRes = await TMDB.fetchWithRetry(vUrl, { headers });
        if (vRes && vRes.ok) {
          const vData = await vRes.json();
          const ytVideos = (vData.results || []).filter(v => v.site === 'YouTube' && v.key);
          const sortedVideos = [...ytVideos].sort((a, b) => scoreVideo(b) - scoreVideo(a));
          sortedVideos.forEach(v => addTrailerKey(v.key));
        }

        if (trailerKeys.length === 0 && resolvedType === 'tv') {
          const s1Url = `${TMDB.BASE_URL}/tv/${data.id}/season/1/videos?include_video_language=en,null,${origLang}`;
          const s1Res = await TMDB.fetchWithRetry(s1Url, { headers });
          if (s1Res && s1Res.ok) {
            const s1Data = await s1Res.json();
            const s1Videos = (s1Data.results || []).filter(v => v.site === 'YouTube' && v.key);
            const sortedS1 = [...s1Videos].sort((a, b) => scoreVideo(b) - scoreVideo(a));
            sortedS1.forEach(v => addTrailerKey(v.key));
          }
        }
      } catch (videoErr) {
        console.warn('[TMDB getDetails video fetch error]:', videoErr.message);
      }
    }

    // Only query YouTube fallback search if TMDB has zero trailer keys
    const mediaTitle = data.title || data.name || options.fallbackTitle || '';
    const mediaYear = (data.release_date || data.first_air_date || options.fallbackYear || '').substring(0, 4);
    if (trailerKeys.length === 0 && mediaTitle) {
      try {
        const ytSearchKey = await TMDB.findYouTubeTrailer(mediaTitle, mediaYear, resolvedType);
        if (ytSearchKey) addTrailerKey(ytSearchKey);
      } catch (e) { }
    }

    trailerKey = trailerKeys[0] || null;

    // Regional Streaming Providers
    const region = (options.region || 'US').toUpperCase();
    const allProvidersResults = data['watch/providers']?.results || {};
    const regionData = allProvidersResults[region] || allProvidersResults['US'] || Object.values(allProvidersResults)[0] || {};

    const formatProvider = p => ({
      provider_id: p.provider_id,
      provider_name: p.provider_name,
      logo: p.logo_path ? `https://image.tmdb.org/t/p/original${p.logo_path}` : null,
      display_priority: p.display_priority
    });

    const streamingFlatrate = (regionData.flatrate || []).map(formatProvider);
    const streamingRent = (regionData.rent || []).map(formatProvider);
    const streamingBuy = (regionData.buy || []).map(formatProvider);
    const streamingFree = (regionData.free || regionData.ads || []).map(formatProvider);

    let watchProviders = [];
    const seenProviders = new Set();
    [...streamingFlatrate, ...streamingFree, ...streamingRent, ...streamingBuy].forEach(p => {
      if (!seenProviders.has(p.provider_id)) {
        seenProviders.add(p.provider_id);
        watchProviders.push(p);
      }
    });

    const availableRegions = Object.keys(allProvidersResults);

    // Parse cast members for the details card - return all billed cast members
    let cast = [];
    const rawCast = (resolvedType === 'tv' && data.aggregate_credits?.cast && data.aggregate_credits.cast.length > 0)
      ? data.aggregate_credits.cast
      : (data.credits?.cast || data.aggregate_credits?.cast || []);

    if (Array.isArray(rawCast) && rawCast.length > 0) {
      cast = rawCast
        .filter(c => c && (c.name || c.original_name))
        .slice(0, 100)
        .map(c => ({
          id: c.id,
          name: c.name || c.original_name,
          character: (c.character || (c.roles && c.roles[0]?.character) || '').trim(),
          profile: c.profile_path ? `${TMDB.IMAGE_BASE_URL}${c.profile_path}` : null,
          order: c.order ?? (c.roles && c.roles[0]?.episode_count ? (1000 - c.roles[0].episode_count) : 999)
        }));
    }

    const seasons = (data.seasons || []).map(s => ({
      id: s.id,
      name: s.name,
      season_number: s.season_number,
      episode_count: s.episode_count,
      air_date: s.air_date,
      poster: s.poster_path ? `${TMDB.IMAGE_BASE_URL}${s.poster_path}` : null,
      overview: s.overview
    }));

    // Extract high-resolution widescreen scene stills / frames (movies, tv shows, and anime)
    // Strictly exclude vertical images, posters (aspect ratio < 1.3 or width < height), and non-scene promotional posters
    const rawBackdrops = (data.images?.backdrops || []).filter(b => {
      if (!b || !b.file_path) return false;
      const ratio = b.aspect_ratio || (b.width && b.height ? b.width / b.height : 0);
      return ratio >= 1.3 && (!b.width || !b.height || b.width > b.height);
    });

    const cleanSceneFrames = rawBackdrops.filter(b => !b.iso_639_1);
    const otherWidescreen = rawBackdrops.filter(b => b.iso_639_1);
    const candidateFrames = cleanSceneFrames.length >= 10 ? cleanSceneFrames : [...cleanSceneFrames, ...otherWidescreen];

    const frames = candidateFrames
      .slice(0, 48)
      .map((b, idx) => ({
        id: idx + 1,
        aspectRatio: b.aspect_ratio || 1.78,
        width: b.width || 1920,
        height: b.height || 1080,
        thumbnail: `https://image.tmdb.org/t/p/w780${b.file_path}`,
        full: `https://image.tmdb.org/t/p/original${b.file_path}`,
        filePath: b.file_path,
        voteAverage: b.vote_average || 0
      }));

    return {
      id: data.id,
      mediaType: resolvedType,
      title: data.title || data.name || options.fallbackTitle || '',
      year: (data.release_date || data.first_air_date || options.fallbackYear || '').substring(0, 4),
      releaseDate: data.release_date || data.first_air_date || '',
      overview: data.overview || '',
      genres: (data.genres || []).map(g => g.name),
      runtime: data.runtime || (data.episode_run_time && data.episode_run_time[0]) || 0,
      trailerKey,
      trailerKeys,
      watchProviders,
      streamingDetails: {
        region,
        availableRegions,
        flatrate: streamingFlatrate,
        rent: streamingRent,
        buy: streamingBuy,
        free: streamingFree
      },
      poster: data.poster_path ? `${TMDB.IMAGE_BASE_URL}${data.poster_path}` : null,
      backdrop: data.backdrop_path ? `https://image.tmdb.org/t/p/original${data.backdrop_path}` : null,
      budget: data.budget,
      revenue: data.revenue,
      status: data.status,
      numberOfSeasons: data.number_of_seasons || seasons.filter(s => s.season_number > 0).length || 1,
      numberOfEpisodes: data.number_of_episodes || 0,
      nextEpisodeToAir: data.next_episode_to_air ? {
        airDate: data.next_episode_to_air.air_date,
        episodeNumber: data.next_episode_to_air.episode_number,
        seasonNumber: data.next_episode_to_air.season_number,
        name: data.next_episode_to_air.name,
        overview: data.next_episode_to_air.overview
      } : null,
      lastEpisodeToAir: data.last_episode_to_air ? {
        airDate: data.last_episode_to_air.air_date,
        episodeNumber: data.last_episode_to_air.episode_number,
        seasonNumber: data.last_episode_to_air.season_number,
        name: data.last_episode_to_air.name
      } : null,
      seasons,
      cast,
      frames,
      rating: Math.round((data.vote_average || 0) * 10) / 10,
      voteCount: data.vote_count || 0
    };
  }

  /**
   * Fetch high-resolution scene frames and stills for a media title (movies, TV shows, and anime).
   */
  static async getFrames(id, type = 'movie', options = {}) {
    if (!id) return [];
    try {
      const details = await TMDB.getDetails(id, type, options);
      if (details?.frames && details.frames.length > 0) {
        return details.frames;
      }
      const { headers, queryParams, hasAuth } = TMDB.getAuthHeadersAndParams(options);
      if (!hasAuth) return [];
      queryParams.set('include_image_language', 'en,null,ja,ko,es,fr,de,zh,it,pt,ru,hi');
      const url = `${TMDB.BASE_URL}/${type}/${id}/images?${queryParams.toString()}`;
      const res = await TMDB.fetchWithRetry(url, { headers });
      if (!res || !res.ok) return [];
      const data = await res.json();
      const rawBackdrops = (data.backdrops || []).filter(b => {
        if (!b || !b.file_path) return false;
        const ratio = b.aspect_ratio || (b.width && b.height ? b.width / b.height : 0);
        return ratio >= 1.3 && (!b.width || !b.height || b.width > b.height);
      });
      const cleanSceneFrames = rawBackdrops.filter(b => !b.iso_639_1);
      const otherWidescreen = rawBackdrops.filter(b => b.iso_639_1);
      const candidateFrames = cleanSceneFrames.length >= 10 ? cleanSceneFrames : [...cleanSceneFrames, ...otherWidescreen];

      return candidateFrames
        .slice(0, 48)
        .map((b, idx) => ({
          id: idx + 1,
          aspectRatio: b.aspect_ratio || 1.78,
          width: b.width || 1920,
          height: b.height || 1080,
          thumbnail: `https://image.tmdb.org/t/p/w780${b.file_path}`,
          full: `https://image.tmdb.org/t/p/original${b.file_path}`,
          filePath: b.file_path,
          voteAverage: b.vote_average || 0
        }));
    } catch (e) {
      return [];
    }
  }

  /**
   * Rapid title entry search - returns high-speed auto-complete results with rich metadata.
   */
  static async rapidSearch(query, type = 'all', options = {}) {
    const raw = (query || '').trim();
    if (!raw) return [];

    const { headers, queryParams, hasAuth } = TMDB.getAuthHeadersAndParams(options);
    if (!hasAuth) return [];

    let endpoint = '/search/multi';
    if (type === 'movie') endpoint = '/search/movie';
    else if (type === 'tv') endpoint = '/search/tv';

    const params = new URLSearchParams(queryParams);
    params.set('query', raw);
    params.set('page', '1');

    const url = `${TMDB.BASE_URL}${endpoint}?${params.toString()}`;
    try {
      const res = await TMDB.fetchWithRetry(url, { headers });
      if (!res || !res.ok) return [];
      const data = await res.json();
      const results = (data.results || []).filter(item => {
        if (type === 'movie') return true;
        if (type === 'tv') return true;
        return item.media_type === 'movie' || item.media_type === 'tv';
      });

      return results.slice(0, 10).map(item => {
        const itemType = item.media_type || type || (item.title ? 'movie' : 'tv');
        const isTv = itemType === 'tv';
        const genres = (item.genre_ids || []).map(id => isTv ? TMDB.TV_GENRE_MAP[id] : TMDB.MOVIE_GENRE_MAP[id]).filter(Boolean);
        const relDate = item.release_date || item.first_air_date || '';
        const year = relDate ? parseInt(relDate.slice(0, 4), 10) : '';

        return {
          id: item.id,
          tmdbId: item.id,
          mediaType: itemType,
          title: item.title || item.name || item.original_title || item.original_name,
          year,
          releaseDate: relDate,
          rating: Math.round((item.vote_average || 0) * 10) / 10,
          voteCount: item.vote_count || 0,
          genres,
          overview: item.overview || '',
          poster: item.poster_path ? `${TMDB.IMAGE_BASE_URL}${item.poster_path}` : 'images/hero.webp',
          backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null
        };
      });
    } catch (e) {
      return [];
    }
  }

  /**
   * Fetch TV Show episodes for a specific season.
   */
  static async getTVEpisodes(id, seasonNumber, options = {}) {
    const { headers, queryParams } = TMDB.getAuthHeadersAndParams(options);
    const url = `${TMDB.BASE_URL}/tv/${id}/season/${seasonNumber}?${queryParams.toString()}`;
    const res = await TMDB.fetchWithRetry(url, { headers });

    if (!res || !res.ok) return null;
    const data = await res.json();
    return data;
  }

  /**
   * Fetch similar media (delegates to getSimilarMedia).
   */
  static async getSimilar(id, type = 'movie', options = {}) {
    return TMDB.getSimilarMedia(id, type, options);
  }

  static CHARACTER_ACTORS = {
    // Iconic TV & Sitcom Characters
    'barney stinson': { character: 'Barney Stinson', actors: ['Neil Patrick Harris'] },
    'ted mosby': { character: 'Ted Mosby', actors: ['Josh Radnor'] },
    'marshall eriksen': { character: 'Marshall Eriksen', actors: ['Jason Segel'] },
    'robin scherbatsky': { character: 'Robin Scherbatsky', actors: ['Cobie Smulders'] },
    'lily aldrin': { character: 'Lily Aldrin', actors: ['Alyson Hannigan'] },
    'michael scott': { character: 'Michael Scott', actors: ['Steve Carell'] },
    'dwight schrute': { character: 'Dwight Schrute', actors: ['Rainn Wilson'] },
    'jim halpert': { character: 'Jim Halpert', actors: ['John Krasinski'] },
    'pam beesly': { character: 'Pam Beesly', actors: ['Jenna Fischer'] },
    'ron swanson': { character: 'Ron Swanson', actors: ['Nick Offerman'] },
    'leslie knope': { character: 'Leslie Knope', actors: ['Amy Poehler'] },
    'jake peralta': { character: 'Jake Peralta', actors: ['Andy Samberg'] },
    'captain holt': { character: 'Captain Raymond Holt', actors: ['Andre Braugher'] },
    'raymond holt': { character: 'Captain Raymond Holt', actors: ['Andre Braugher'] },
    'chandler bing': { character: 'Chandler Bing', actors: ['Matthew Perry'] },
    'joey tribbiani': { character: 'Joey Tribbiani', actors: ['Matt LeBlanc'] },
    'ross geller': { character: 'Ross Geller', actors: ['David Schwimmer'] },
    'rachel green': { character: 'Rachel Green', actors: ['Jennifer Aniston'] },
    'monica geller': { character: 'Monica Geller', actors: ['Courteney Cox'] },
    'phoebe buffay': { character: 'Phoebe Buffay', actors: ['Lisa Kudrow'] },
    'sheldon cooper': { character: 'Sheldon Cooper', actors: ['Jim Parsons'] },
    'sheldon': { character: 'Sheldon Cooper', actors: ['Jim Parsons'] },
    'rajesh koothrappali': { character: 'Rajesh Koothrappali', actors: ['Kunal Nayyar'] },
    'rajesh koothrapalli': { character: 'Rajesh Koothrappali', actors: ['Kunal Nayyar'] },
    'raj koothrappali': { character: 'Rajesh Koothrappali', actors: ['Kunal Nayyar'] },
    'rajesh': { character: 'Rajesh Koothrappali', actors: ['Kunal Nayyar'] },
    'howard wolowitz': { character: 'Howard Wolowitz', actors: ['Simon Helberg'] },
    'howard wallowitz': { character: 'Howard Wolowitz', actors: ['Simon Helberg'] },
    'howard': { character: 'Howard Wolowitz', actors: ['Simon Helberg'] },
    'penny': { character: 'Penny', actors: ['Kaley Cuoco'] },
    'penny hofstadter': { character: 'Penny', actors: ['Kaley Cuoco'] },
    'leonard hofstadter': { character: 'Leonard Hofstadter', actors: ['Johnny Galecki'] },
    'leonard': { character: 'Leonard Hofstadter', actors: ['Johnny Galecki'] },
    'bernadette rostenkowski': { character: 'Bernadette Rostenkowski', actors: ['Melissa Rauch'] },
    'amy farrah fowler': { character: 'Amy Farrah Fowler', actors: ['Mayim Bialik'] },

    // Modern Family
    'phil dunphy': { character: 'Phil Dunphy', actors: ['Ty Burrell'] },
    'alex dunphy': { character: 'Alex Dunphy', actors: ['Ariel Winter'] },
    'claire dunphy': { character: 'Claire Dunphy', actors: ['Julie Bowen'] },
    'haley dunphy': { character: 'Haley Dunphy', actors: ['Sarah Hyland'] },
    'luke dunphy': { character: 'Luke Dunphy', actors: ['Nolan Gould'] },
    'gloria delgado-pritchett': { character: 'Gloria Delgado-Pritchett', actors: ['Sofía Vergara'] },
    'gloria delgado': { character: 'Gloria Delgado-Pritchett', actors: ['Sofía Vergara'] },
    'gloria pritchett': { character: 'Gloria Delgado-Pritchett', actors: ['Sofía Vergara'] },
    'jay pritchett': { character: 'Jay Pritchett', actors: ['Ed O\'Neill'] },
    'cameron tucker': { character: 'Cameron Tucker', actors: ['Eric Stonestreet'] },
    'cam tucker': { character: 'Cameron Tucker', actors: ['Eric Stonestreet'] },
    'mitchell pritchett': { character: 'Mitchell Pritchett', actors: ['Jesse Tyler Ferguson'] },
    'mitch pritchett': { character: 'Mitchell Pritchett', actors: ['Jesse Tyler Ferguson'] },
    'manny delgado': { character: 'Manny Delgado', actors: ['Rico Rodriguez'] },

    // Breaking Bad & Better Call Saul
    'walter white': { character: 'Walter White', actors: ['Bryan Cranston'] },
    'heisenberg': { character: 'Walter White', actors: ['Bryan Cranston'] },
    'jesse pinkman': { character: 'Jesse Pinkman', actors: ['Aaron Paul'] },
    'saul goodman': { character: 'Saul Goodman', actors: ['Bob Odenkirk'] },
    'jimmy mcgill': { character: 'Saul Goodman', actors: ['Bob Odenkirk'] },
    'gus fring': { character: 'Gus Fring', actors: ['Giancarlo Esposito'] },
    'gustavo fring': { character: 'Gus Fring', actors: ['Giancarlo Esposito'] },
    'mike ehrmantraut': { character: 'Mike Ehrmantraut', actors: ['Jonathan Banks'] },
    'hank schrader': { character: 'Hank Schrader', actors: ['Dean Norris'] },
    'kim wexler': { character: 'Kim Wexler', actors: ['Rhea Seehorn'] },
    'lalo salamanca': { character: 'Lalo Salamanca', actors: ['Tony Dalton'] },

    // Peaky Blinders
    'tommy shelby': { character: 'Tommy Shelby', actors: ['Cillian Murphy'] },
    'thomas shelby': { character: 'Tommy Shelby', actors: ['Cillian Murphy'] },
    'arthur shelby': { character: 'Arthur Shelby Jr.', actors: ['Paul Anderson'] },
    'polly gray': { character: 'Polly Gray', actors: ['Helen McCrory'] },
    'alfie solomons': { character: 'Alfie Solomons', actors: ['Tom Hardy'] },

    // The Boys
    'homelander': { character: 'Homelander', actors: ['Antony Starr'] },
    'billy butcher': { character: 'Billy Butcher', actors: ['Karl Urban'] },
    'hughie campbell': { character: 'Hughie Campbell', actors: ['Jack Quaid'] },
    'starlight': { character: 'Starlight / Annie January', actors: ['Erin Moriarty'] },
    'annie january': { character: 'Starlight / Annie January', actors: ['Erin Moriarty'] },
    'soldier boy': { character: 'Soldier Boy', actors: ['Jensen Ackles'] },
    'a-train': { character: 'A-Train', actors: ['Jessie T. Usher'] },
    'frenchie': { character: 'Frenchie', actors: ['Tomer Capone'] },

    // Succession
    'kendall roy': { character: 'Kendall Roy', actors: ['Jeremy Strong'] },
    'logan roy': { character: 'Logan Roy', actors: ['Brian Cox'] },
    'roman roy': { character: 'Roman Roy', actors: ['Kieran Culkin'] },
    'shiv roy': { character: 'Shiv Roy', actors: ['Sarah Snook'] },
    'tom wambsgans': { character: 'Tom Wambsgans', actors: ['Matthew Macfadyen'] },
    'cousin greg': { character: 'Greg Hirsch', actors: ['Nicholas Braun'] },

    // Game of Thrones & House of the Dragon
    'jon snow': { character: 'Jon Snow', actors: ['Kit Harington'] },
    'daenerys targaryen': { character: 'Daenerys Targaryen', actors: ['Emilia Clarke'] },
    'daenerys': { character: 'Daenerys Targaryen', actors: ['Emilia Clarke'] },
    'tyrion lannister': { character: 'Tyrion Lannister', actors: ['Peter Dinklage'] },
    'tyrion': { character: 'Tyrion Lannister', actors: ['Peter Dinklage'] },
    'arya stark': { character: 'Arya Stark', actors: ['Maisie Williams'] },
    'sansa stark': { character: 'Sansa Stark', actors: ['Sophie Turner'] },
    'cersei lannister': { character: 'Cersei Lannister', actors: ['Lena Headey'] },
    'jaime lannister': { character: 'Jaime Lannister', actors: ['Nikolaj Coster-Waldau'] },
    'ned stark': { character: 'Ned Stark', actors: ['Sean Bean'] },
    'joffrey baratheon': { character: 'Joffrey Baratheon', actors: ['Jack Gleeson'] },
    'ramsay bolton': { character: 'Ramsay Bolton', actors: ['Iwan Rheon'] },
    'the hound': { character: 'Sandor Clegane / The Hound', actors: ['Rory McCann'] },
    'sandor clegane': { character: 'Sandor Clegane / The Hound', actors: ['Rory McCann'] },
    'daemon targaryen': { character: 'Daemon Targaryen', actors: ['Matt Smith'] },
    'rhaenyra targaryen': { character: 'Rhaenyra Targaryen', actors: ['Emma D\'Arcy', 'Milly Alcock'] },
    'aemond targaryen': { character: 'Aemond Targaryen', actors: ['Ewan Mitchell'] },
    'alicent hightower': { character: 'Alicent Hightower', actors: ['Olivia Cooke', 'Emily Carey'] },

    // Stranger Things & Pop TV
    'eleven': { character: 'Eleven', actors: ['Millie Bobby Brown'] },
    'mike wheeler': { character: 'Mike Wheeler', actors: ['Finn Wolfhard'] },
    'dustin henderson': { character: 'Dustin Henderson', actors: ['Gaten Matarazzo'] },
    'steve harrington': { character: 'Steve Harrington', actors: ['Joe Keery'] },
    'eddie munson': { character: 'Eddie Munson', actors: ['Joseph Quinn'] },
    'jim hopper': { character: 'Jim Hopper', actors: ['David Harbour'] },
    'hopper': { character: 'Jim Hopper', actors: ['David Harbour'] },
    'wednesday addams': { character: 'Wednesday Addams', actors: ['Jenna Ortega', 'Christina Ricci'] },
    'wednesday': { character: 'Wednesday Addams', actors: ['Jenna Ortega', 'Christina Ricci'] },
    'tony soprano': { character: 'Tony Soprano', actors: ['James Gandolfini'] },
    'don draper': { character: 'Don Draper', actors: ['Jon Hamm'] },
    'dexter morgan': { character: 'Dexter Morgan', actors: ['Michael C. Hall'] },
    'dexter': { character: 'Dexter Morgan', actors: ['Michael C. Hall'] },
    'lucifer morningstar': { character: 'Lucifer Morningstar', actors: ['Tom Ellis'] },
    'lucifer': { character: 'Lucifer Morningstar', actors: ['Tom Ellis'] },
    'beth harmon': { character: 'Beth Harmon', actors: ['Anya Taylor-Joy'] },
    'dean winchester': { character: 'Dean Winchester', actors: ['Jensen Ackles'] },
    'sam winchester': { character: 'Sam Winchester', actors: ['Jared Padalecki'] },
    'peacemaker': { character: 'Peacemaker', actors: ['John Cena'] },

    // DC Comics & Gotham
    'superman': { character: 'Superman', actors: ['Henry Cavill', 'Christopher Reeve', 'David Corenswet', 'Tyler Hoechlin', 'Brandon Routh', 'Tom Welling', 'Dean Cain'] },
    'clark kent': { character: 'Superman', actors: ['Henry Cavill', 'Christopher Reeve', 'David Corenswet', 'Tyler Hoechlin', 'Brandon Routh', 'Tom Welling'] },
    'batman': { character: 'Batman', actors: ['Christian Bale', 'Robert Pattinson', 'Ben Affleck', 'Michael Keaton', 'Adam West', 'George Clooney', 'Val Kilmer'] },
    'bruce wayne': { character: 'Batman', actors: ['Christian Bale', 'Robert Pattinson', 'Ben Affleck', 'Michael Keaton', 'Adam West', 'George Clooney', 'Val Kilmer'] },
    'the joker': { character: 'The Joker', actors: ['Heath Ledger', 'Joaquin Phoenix', 'Jack Nicholson', 'Barry Keoghan', 'Cameron Monaghan'] },
    'joker': { character: 'The Joker', actors: ['Heath Ledger', 'Joaquin Phoenix', 'Jack Nicholson', 'Barry Keoghan', 'Cameron Monaghan'] },
    'arthur fleck': { character: 'Arthur Fleck / Joker', actors: ['Joaquin Phoenix'] },
    'harley quinn': { character: 'Harley Quinn', actors: ['Margot Robbie', 'Lady Gaga', 'Kaley Cuoco'] },
    'wonder woman': { character: 'Wonder Woman', actors: ['Gal Gadot', 'Lynda Carter'] },
    'diana prince': { character: 'Wonder Woman', actors: ['Gal Gadot', 'Lynda Carter'] },
    'aquaman': { character: 'Aquaman', actors: ['Jason Momoa'] },
    'arthur curry': { character: 'Aquaman', actors: ['Jason Momoa'] },
    'the flash': { character: 'The Flash', actors: ['Grant Gustin', 'Ezra Miller'] },
    'flash': { character: 'The Flash', actors: ['Grant Gustin', 'Ezra Miller'] },
    'barry allen': { character: 'The Flash', actors: ['Grant Gustin', 'Ezra Miller'] },
    'catwoman': { character: 'Catwoman / Selina Kyle', actors: ['Zoë Kravitz', 'Anne Hathaway', 'Michelle Pfeiffer'] },
    'selina kyle': { character: 'Catwoman / Selina Kyle', actors: ['Zoë Kravitz', 'Anne Hathaway', 'Michelle Pfeiffer'] },
    'penguin': { character: 'The Penguin / Oswald Cobblepot', actors: ['Colin Farrell', 'Danny DeVito', 'Robin Lord Taylor'] },
    'oswald cobblepot': { character: 'The Penguin / Oswald Cobblepot', actors: ['Colin Farrell', 'Danny DeVito', 'Robin Lord Taylor'] },
    'riddler': { character: 'The Riddler / Edward Nygma', actors: ['Paul Dano', 'Jim Carrey', 'Cory Michael Smith'] },
    'edward nygma': { character: 'The Riddler / Edward Nygma', actors: ['Paul Dano', 'Jim Carrey', 'Cory Michael Smith'] },
    'jim gordon': { character: 'Jim Gordon', actors: ['Gary Oldman', 'Jeffrey Wright', 'Ben McKenzie'] },
    'gordon': { character: 'Jim Gordon', actors: ['Gary Oldman', 'Jeffrey Wright', 'Ben McKenzie'] },
    'alfred pennyworth': { character: 'Alfred Pennyworth', actors: ['Michael Caine', 'Andy Serkis', 'Jeremy Irons'] },
    'alfred': { character: 'Alfred Pennyworth', actors: ['Michael Caine', 'Andy Serkis', 'Jeremy Irons'] },
    'bane': { character: 'Bane', actors: ['Tom Hardy'] },
    'lex luthor': { character: 'Lex Luthor', actors: ['Gene Hackman', 'Jesse Eisenberg', 'Nicholas Hoult', 'Kevin Spacey'] },
    'lois lane': { character: 'Lois Lane', actors: ['Amy Adams', 'Margot Kidder', 'Rachel Brosnahan'] },

    // Marvel Universe
    'spider-man': { character: 'Spider-Man', actors: ['Tom Holland', 'Tobey Maguire', 'Andrew Garfield'] },
    'spiderman': { character: 'Spider-Man', actors: ['Tom Holland', 'Tobey Maguire', 'Andrew Garfield'] },
    'peter parker': { character: 'Spider-Man', actors: ['Tom Holland', 'Tobey Maguire', 'Andrew Garfield'] },
    'miles morales': { character: 'Miles Morales / Spider-Man', actors: ['Shameik Moore'] },
    'gwen stacy': { character: 'Gwen Stacy / Spider-Gwen', actors: ['Hailee Steinfeld', 'Emma Stone'] },
    'iron man': { character: 'Iron Man', actors: ['Robert Downey Jr.'] },
    'tony stark': { character: 'Iron Man', actors: ['Robert Downey Jr.'] },
    'captain america': { character: 'Captain America', actors: ['Chris Evans', 'Anthony Mackie'] },
    'steve rogers': { character: 'Captain America', actors: ['Chris Evans'] },
    'thor': { character: 'Thor', actors: ['Chris Hemsworth'] },
    'loki': { character: 'Loki', actors: ['Tom Hiddleston'] },
    'black widow': { character: 'Black Widow', actors: ['Scarlett Johansson', 'Florence Pugh'] },
    'natasha romanoff': { character: 'Black Widow', actors: ['Scarlett Johansson'] },
    'hawkeye': { character: 'Hawkeye', actors: ['Jeremy Renner'] },
    'clint barton': { character: 'Hawkeye', actors: ['Jeremy Renner'] },
    'hulk': { character: 'Hulk', actors: ['Mark Ruffalo', 'Edward Norton'] },
    'bruce banner': { character: 'Bruce Banner / Hulk', actors: ['Mark Ruffalo', 'Edward Norton'] },
    'thanos': { character: 'Thanos', actors: ['Josh Brolin'] },
    'deadpool': { character: 'Deadpool', actors: ['Ryan Reynolds'] },
    'wade wilson': { character: 'Deadpool', actors: ['Ryan Reynolds'] },
    'wolverine': { character: 'Wolverine', actors: ['Hugh Jackman'] },
    'logan': { character: 'Wolverine', actors: ['Hugh Jackman'] },
    'doctor strange': { character: 'Doctor Strange', actors: ['Benedict Cumberbatch'] },
    'stephen strange': { character: 'Doctor Strange', actors: ['Benedict Cumberbatch'] },
    'scarlet witch': { character: 'Scarlet Witch / Wanda Maximoff', actors: ['Elizabeth Olsen'] },
    'wanda maximoff': { character: 'Scarlet Witch / Wanda Maximoff', actors: ['Elizabeth Olsen'] },
    'black panther': { character: 'Black Panther / T\'Challa', actors: ['Chadwick Boseman'] },
    't\'challa': { character: 'Black Panther / T\'Challa', actors: ['Chadwick Boseman'] },
    'daredevil': { character: 'Daredevil / Matt Murdock', actors: ['Charlie Cox', 'Ben Affleck'] },
    'matt murdock': { character: 'Daredevil / Matt Murdock', actors: ['Charlie Cox', 'Ben Affleck'] },
    'punisher': { character: 'The Punisher / Frank Castle', actors: ['Jon Bernthal', 'Thomas Jane'] },
    'frank castle': { character: 'The Punisher / Frank Castle', actors: ['Jon Bernthal', 'Thomas Jane'] },
    'star-lord': { character: 'Star-Lord / Peter Quill', actors: ['Chris Pratt'] },
    'peter quill': { character: 'Star-Lord / Peter Quill', actors: ['Chris Pratt'] },
    'professor x': { character: 'Professor X', actors: ['Patrick Stewart', 'James McAvoy'] },
    'charles xavier': { character: 'Professor X', actors: ['Patrick Stewart', 'James McAvoy'] },
    'magneto': { character: 'Magneto', actors: ['Ian McKellen', 'Michael Fassbender'] },
    'erik lehnsherr': { character: 'Magneto', actors: ['Ian McKellen', 'Michael Fassbender'] },

    // Star Wars
    'luke skywalker': { character: 'Luke Skywalker', actors: ['Mark Hamill'] },
    'darth vader': { character: 'Darth Vader', actors: ['Hayden Christensen', 'James Earl Jones'] },
    'anakin skywalker': { character: 'Anakin Skywalker', actors: ['Hayden Christensen'] },
    'obi-wan kenobi': { character: 'Obi-Wan Kenobi', actors: ['Ewan McGregor', 'Alec Guinness'] },
    'obi-wan': { character: 'Obi-Wan Kenobi', actors: ['Ewan McGregor', 'Alec Guinness'] },
    'obi wan': { character: 'Obi-Wan Kenobi', actors: ['Ewan McGregor', 'Alec Guinness'] },
    'han solo': { character: 'Han Solo', actors: ['Harrison Ford', 'Alden Ehrenreich'] },
    'princess leia': { character: 'Princess Leia', actors: ['Carrie Fisher'] },
    'leia': { character: 'Princess Leia', actors: ['Carrie Fisher'] },
    'yoda': { character: 'Yoda', actors: ['Frank Oz'] },
    'mando': { character: 'The Mandalorian / Din Djarin', actors: ['Pedro Pascal'] },
    'din djarin': { character: 'The Mandalorian / Din Djarin', actors: ['Pedro Pascal'] },
    'the mandalorian': { character: 'The Mandalorian / Din Djarin', actors: ['Pedro Pascal'] },
    'ahsoka tano': { character: 'Ahsoka Tano', actors: ['Rosario Dawson', 'Ashley Eckstein'] },
    'ahsoka': { character: 'Ahsoka Tano', actors: ['Rosario Dawson', 'Ashley Eckstein'] },
    'boba fett': { character: 'Boba Fett', actors: ['Temuera Morrison'] },
    'kylo ren': { character: 'Kylo Ren', actors: ['Adam Driver'] },
    'rey': { character: 'Rey', actors: ['Daisy Ridley'] },
    'cassian andor': { character: 'Cassian Andor', actors: ['Diego Luna'] },
    'andor': { character: 'Cassian Andor', actors: ['Diego Luna'] },

    // Dune
    'paul atreides': { character: 'Paul Atreides', actors: ['Timothée Chalamet', 'Kyle MacLachlan'] },
    'chani': { character: 'Chani', actors: ['Zendaya'] },

    // Harry Potter & Lord of the Rings
    'harry potter': { character: 'Harry Potter', actors: ['Daniel Radcliffe'] },
    'hermione granger': { character: 'Hermione Granger', actors: ['Emma Watson'] },
    'ron weasley': { character: 'Ron Weasley', actors: ['Rupert Grint'] },
    'lord voldemort': { character: 'Lord Voldemort', actors: ['Ralph Fiennes'] },
    'voldemort': { character: 'Lord Voldemort', actors: ['Ralph Fiennes'] },
    'severus snape': { character: 'Severus Snape', actors: ['Alan Rickman'] },
    'snape': { character: 'Severus Snape', actors: ['Alan Rickman'] },
    'albus dumbledore': { character: 'Albus Dumbledore', actors: ['Michael Gambon', 'Richard Harris', 'Jude Law'] },
    'dumbledore': { character: 'Albus Dumbledore', actors: ['Michael Gambon', 'Richard Harris', 'Jude Law'] },
    'sirius black': { character: 'Sirius Black', actors: ['Gary Oldman'] },
    'frodo baggins': { character: 'Frodo Baggins', actors: ['Elijah Wood'] },
    'frodo': { character: 'Frodo Baggins', actors: ['Elijah Wood'] },
    'gandalf': { character: 'Gandalf', actors: ['Ian McKellen'] },
    'aragorn': { character: 'Aragorn', actors: ['Viggo Mortensen'] },
    'legolas': { character: 'Legolas', actors: ['Orlando Bloom'] },
    'gimli': { character: 'Gimli', actors: ['John Rhys-Davies'] },
    'samwise gamgee': { character: 'Samwise Gamgee', actors: ['Sean Astin'] },
    'sam gamgee': { character: 'Samwise Gamgee', actors: ['Sean Astin'] },
    'gollum': { character: 'Gollum', actors: ['Andy Serkis'] },
    'sauron': { character: 'Sauron', actors: ['Charlie Vickers'] },
    'bilbo baggins': { character: 'Bilbo Baggins', actors: ['Martin Freeman', 'Ian Holm'] },
    'bilbo': { character: 'Bilbo Baggins', actors: ['Martin Freeman', 'Ian Holm'] },

    // Cinema Icons & Blockbusters
    'neo': { character: 'Neo', actors: ['Keanu Reeves'] },
    'john wick': { character: 'John Wick', actors: ['Keanu Reeves'] },
    'morpheus': { character: 'Morpheus', actors: ['Laurence Fishburne', 'Yahya Abdul-Mateen II'] },
    'trinity': { character: 'Trinity', actors: ['Carrie-Anne Moss'] },
    'ethan hunt': { character: 'Ethan Hunt', actors: ['Tom Cruise'] },
    'maverick': { character: 'Pete "Maverick" Mitchell', actors: ['Tom Cruise'] },
    'pete mitchell': { character: 'Pete "Maverick" Mitchell', actors: ['Tom Cruise'] },
    'jack reacher': { character: 'Jack Reacher', actors: ['Alan Ritchson', 'Tom Cruise'] },
    'reacher': { character: 'Jack Reacher', actors: ['Alan Ritchson', 'Tom Cruise'] },
    'james bond': { character: 'James Bond', actors: ['Daniel Craig', 'Sean Connery', 'Pierce Brosnan', 'Roger Moore', 'Timothy Dalton'] },
    '007': { character: 'James Bond', actors: ['Daniel Craig', 'Sean Connery', 'Pierce Brosnan', 'Roger Moore', 'Timothy Dalton'] },
    'indiana jones': { character: 'Indiana Jones', actors: ['Harrison Ford'] },
    'jack sparrow': { character: 'Captain Jack Sparrow', actors: ['Johnny Depp'] },
    'captain jack sparrow': { character: 'Captain Jack Sparrow', actors: ['Johnny Depp'] },
    'tyler durden': { character: 'Tyler Durden', actors: ['Brad Pitt'] },
    'patrick bateman': { character: 'Patrick Bateman', actors: ['Christian Bale'] },
    'forrest gump': { character: 'Forrest Gump', actors: ['Tom Hanks'] },
    'michael corleone': { character: 'Michael Corleone', actors: ['Al Pacino'] },
    'tony montana': { character: 'Tony Montana', actors: ['Al Pacino'] },
    'vito corleone': { character: 'Vito Corleone', actors: ['Marlon Brando', 'Robert De Niro'] },
    'oppenheimer': { character: 'J. Robert Oppenheimer', actors: ['Cillian Murphy'] },
    'barbie': { character: 'Barbie', actors: ['Margot Robbie'] },
    'ken': { character: 'Ken', actors: ['Ryan Gosling'] },
    'katniss everdeen': { character: 'Katniss Everdeen', actors: ['Jennifer Lawrence'] },
    'katniss': { character: 'Katniss Everdeen', actors: ['Jennifer Lawrence'] },
    'bella swan': { character: 'Bella Swan', actors: ['Kristen Stewart'] },
    'edward cullen': { character: 'Edward Cullen', actors: ['Robert Pattinson'] },
    'sherlock holmes': { character: 'Sherlock Holmes', actors: ['Benedict Cumberbatch', 'Robert Downey Jr.', 'Henry Cavill', 'Jonny Lee Miller', 'Ian McKellen'] },
    'sherlock': { character: 'Sherlock Holmes', actors: ['Benedict Cumberbatch', 'Robert Downey Jr.', 'Henry Cavill', 'Jonny Lee Miller'] },
    'dr watson': { character: 'Dr. John Watson', actors: ['Martin Freeman', 'Jude Law'] },
    'john watson': { character: 'Dr. John Watson', actors: ['Martin Freeman', 'Jude Law'] },
    'hercule poirot': { character: 'Hercule Poirot', actors: ['Kenneth Branagh', 'David Suchet'] },
    'hannibal lecter': { character: 'Hannibal Lecter', actors: ['Anthony Hopkins', 'Mads Mikkelsen'] },
    'dominic toretto': { character: 'Dominic Toretto', actors: ['Vin Diesel'] },
    'dom toretto': { character: 'Dominic Toretto', actors: ['Vin Diesel'] },
    'brian o\'conner': { character: 'Brian O\'Conner', actors: ['Paul Walker'] },
    'terminator': { character: 'The Terminator / T-800', actors: ['Arnold Schwarzenegger'] },
    't-800': { character: 'The Terminator / T-800', actors: ['Arnold Schwarzenegger'] },
    'sarah connor': { character: 'Sarah Connor', actors: ['Linda Hamilton', 'Emilia Clarke'] },
    'ellen ripley': { character: 'Ellen Ripley', actors: ['Sigourney Weaver'] },
    'ripley': { character: 'Ellen Ripley', actors: ['Sigourney Weaver'] },
    'john mcclane': { character: 'John McClane', actors: ['Bruce Willis'] },
    'mad max': { character: 'Mad Max', actors: ['Tom Hardy', 'Mel Gibson'] },
    'furiosa': { character: 'Imperator Furiosa', actors: ['Charlize Theron', 'Anya Taylor-Joy'] },
    'hans landa': { character: 'Col. Hans Landa', actors: ['Christoph Waltz'] },
    'rust cohle': { character: 'Rust Cohle', actors: ['Matthew McConaughey'] },
    'dom cobb': { character: 'Dom Cobb', actors: ['Leonardo DiCaprio'] },
    'cobb': { character: 'Dom Cobb', actors: ['Leonardo DiCaprio'] },
    'jordan belfort': { character: 'Jordan Belfort', actors: ['Leonardo DiCaprio'] },

    // Gaming & Anime Adaptations
    'joel': { character: 'Joel Miller', actors: ['Pedro Pascal'] },
    'joel miller': { character: 'Joel Miller', actors: ['Pedro Pascal'] },
    'ellie': { character: 'Ellie Williams', actors: ['Bella Ramsey', 'Ashley Johnson'] },
    'ellie williams': { character: 'Ellie Williams', actors: ['Bella Ramsey', 'Ashley Johnson'] },
    'geralt of rivia': { character: 'Geralt of Rivia', actors: ['Henry Cavill', 'Liam Hemsworth'] },
    'the witcher': { character: 'Geralt of Rivia', actors: ['Henry Cavill', 'Liam Hemsworth'] },
    'luffy': { character: 'Monkey D. Luffy', actors: ['Iñaki Godoy', 'Mayumi Tanaka'] },
    'monkey d. luffy': { character: 'Monkey D. Luffy', actors: ['Iñaki Godoy', 'Mayumi Tanaka'] },
    'zoro': { character: 'Roronoa Zoro', actors: ['Mackenyu', 'Kazuya Nakai'] },
    'roronoa zoro': { character: 'Roronoa Zoro', actors: ['Mackenyu', 'Kazuya Nakai'] },
    'naruto': { character: 'Naruto Uzumaki', actors: ['Junko Takeuchi', 'Maile Flanagan'] },
    'naruto uzumaki': { character: 'Naruto Uzumaki', actors: ['Junko Takeuchi', 'Maile Flanagan'] },
    'goku': { character: 'Son Goku', actors: ['Masako Nozawa', 'Sean Schemmel'] },
    'son goku': { character: 'Son Goku', actors: ['Masako Nozawa', 'Sean Schemmel'] },
    'levi ackerman': { character: 'Levi Ackerman', actors: ['Hiroshi Kamiya', 'Matthew Mercer'] },
    'eren yeager': { character: 'Eren Yeager', actors: ['Yuki Kaji', 'Bryce Papenbrook'] },
    'gojo': { character: 'Gojo Satoru', actors: ['Yuichi Nakamura', 'Kaiji Tang'] },
    'gojo satoru': { character: 'Gojo Satoru', actors: ['Yuichi Nakamura', 'Kaiji Tang'] },
    'tanjiro': { character: 'Tanjiro Kamado', actors: ['Natsuki Hanae', 'Zach Aguilar'] },
    'tanjiro kamado': { character: 'Tanjiro Kamado', actors: ['Natsuki Hanae', 'Zach Aguilar'] },
    'bojack horseman': { character: 'BoJack Horseman', actors: ['Will Arnett'] },
    'bojack': { character: 'BoJack Horseman', actors: ['Will Arnett'] },
    'rick sanchez': { character: 'Rick Sanchez', actors: ['Justin Roiland', 'Ian Cardoni'] },
    'morty smith': { character: 'Morty Smith', actors: ['Justin Roiland', 'Harry Belden'] }
  };

  static levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  /**
   * Safe matching of a fictional character query against TMDB.CHARACTER_ACTORS.
   * Matches full name, multi-word containment, distinct whole words (min 4 chars), or close typos.
   * Strictly prevents false positives on partial substrings (e.g. "bar", "in", "son").
   */
  static matchKnownCharacterKey(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const clean = raw.toLowerCase().replace(/['"!?.]/g, '').trim();
    if (clean.length < 3) return null;

    if (TMDB.CHARACTER_ACTORS[clean]) return clean;

    const rawWords = clean.split(/\s+/).filter(Boolean);

    for (const [charKey] of Object.entries(TMDB.CHARACTER_ACTORS)) {
      if (clean === charKey || clean.includes(charKey)) return charKey;

      const keyWords = charKey.split(/\s+/).filter(Boolean);
      if (keyWords.some(w => w.length >= 4 && w === clean)) return charKey;

      if (rawWords.length > 1 && keyWords.every(w => rawWords.includes(w))) return charKey;

      // Fuzzy matching for multi-word queries with small typos (e.g. "rajesh koothrapalli", "howard wallowitz")
      if (rawWords.length === keyWords.length && rawWords.length >= 2) {
        const wordsMatch = keyWords.every((kw, idx) => {
          const rw = rawWords[idx];
          if (kw === rw) return true;
          if (kw.length >= 5 && rw.length >= 5) {
            return TMDB.levenshtein(kw, rw) <= 2;
          }
          return false;
        });
        if (wordsMatch) return charKey;
      }
    }

    return null;
  }

  /**
   * Find actors who portrayed a fictional character.
   */
  static async findActorsByCharacter(query, options = {}) {
    if (!query || !query.trim()) return [];

    // Clean common prefixes (e.g. "who played batman", "character: walter white", "actor for luffy")
    const cleaned = query
      .trim()
      .replace(/^(?:who\s+(?:played|portrayed|voices)|character(?:\s*:\s*|\s+)|actor\s+for\s+)/i, '')
      .trim();
    const raw = cleaned.toLowerCase().replace(/['"!?.]/g, '');

    // 1. Check knowledge map via safe word-boundary matching
    let matchEntry = null;
    const matchedKey = TMDB.matchKnownCharacterKey(raw);
    if (matchedKey && TMDB.CHARACTER_ACTORS[matchedKey]) {
      matchEntry = TMDB.CHARACTER_ACTORS[matchedKey];
    }

    let actorNames = matchEntry ? [...matchEntry.actors] : [];
    let characterName = matchEntry ? matchEntry.character : cleaned;

    // 2. Dynamic fallback: Wikipedia Search API + Summary Extraction
    if (actorNames.length === 0) {
      try {
        const regexList = [
          /(?:portrayed|played|voices|voiced)\s+by\s+([A-Z][a-zA-Z\s\.\-]+?)(?:[,.]|\s+in\s+|\s+and\s+|\s+as\s+)/i,
          /(?:played by|portrayed by|voiced by)\s+([A-Z][a-zA-Z\s\.\-]+?)(?:[,.]|\s+in\s+|\s+and\s+)/i,
          /(?:starring|stars)\s+([A-Z][a-zA-Z\s\.\-]+?)\s+as\s+/i,
          /([A-Z][a-zA-Z\s\.\-]+?)\s+(?:portrays|plays|voices|stars as)\s+/i,
          /as\s+the\s+character[,\s]+played\s+by\s+([A-Z][a-zA-Z\s\.\-]+?)[,.]/i,
          /([A-Z][a-zA-Z\s\.\-]+?)\s+as\s+(?:the\s+character\s+)?([A-Z][a-zA-Z\s\.\-]+?)[,.]/i
        ];

        // First attempt direct slug
        const directSlug = encodeURIComponent(cleaned.replace(/\s+/g, '_'));
        const directRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${directSlug}`, {
          headers: { 'User-Agent': 'MoodFlix/2.0 (contact@moodflix.dev)' }
        }).catch(() => null);

        let candidates = [];
        if (directRes && directRes.ok) {
          const directData = await directRes.json();
          candidates.push(directData);
        }

        // If direct slug produced no hit or no actor, query Wikipedia search
        if (candidates.length === 0 || !candidates[0].extract) {
          const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleaned + ' fictional character')}&format=json`;
          const sRes = await fetch(searchUrl, { headers: { 'User-Agent': 'MoodFlix/2.0 (contact@moodflix.dev)' } }).catch(() => null);
          if (sRes && sRes.ok) {
            const sData = await sRes.json();
            const hits = (sData.query?.search || []).slice(0, 3);
            for (const hit of hits) {
              const sumRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.title)}`, {
                headers: { 'User-Agent': 'MoodFlix/2.0 (contact@moodflix.dev)' }
              }).catch(() => null);
              if (sumRes && sumRes.ok) {
                const sumData = await sumRes.json();
                candidates.push(sumData);
              }
            }
          }
        }

        for (const cand of candidates) {
          const extract = cand.extract || '';
          for (const reg of regexList) {
            const m = extract.match(reg);
            if (m && m[1]) {
              const candidate = m[1].trim();
              if (candidate.length >= 3 && candidate.length <= 35 && !/^(The|He|She|In|On|At|When|American|British|Canadian|Australian)\b/i.test(candidate)) {
                actorNames.push(candidate);
                characterName = (cand.title || cleaned).replace(/\s*\([^)]*\)/g, '').trim();
                break;
              }
            }
          }
          if (actorNames.length > 0) break;
        }
      } catch (e) { }
    }

    if (actorNames.length === 0) return [];

    // 3. Resolve actor details from TMDB
    const { headers, queryParams, hasAuth } = TMDB.getAuthHeadersAndParams(options);
    if (!hasAuth) return [];

    const actorResults = [];
    const seenIds = new Set();
    for (const name of actorNames) {
      try {
        const searchParams = new URLSearchParams(queryParams);
        searchParams.set('query', name);
        searchParams.set('include_adult', 'false');
        const searchUrl = `${TMDB.BASE_URL}/search/person?${searchParams.toString()}`;
        const res = await TMDB.fetchWithRetry(searchUrl, { headers });
        if (res && res.ok) {
          const data = await res.json();
          const first = (data.results || [])[0];
          if (first && !seenIds.has(first.id)) {
            seenIds.add(first.id);
            actorResults.push({
              id: first.id,
              name: first.name,
              profile: first.profile_path ? `${TMDB.IMAGE_BASE_URL}${first.profile_path}` : null,
              knownForDepartment: first.known_for_department || 'Acting',
              popularity: first.popularity || 0,
              knownFor: (first.known_for || []).map(k => k.title || k.name).filter(Boolean).slice(0, 4),
              characterPlayed: characterName,
              isCharacterMatch: true
            });
          }
        }
      } catch (err) { }
    }

    return actorResults;
  }

  /**
   * Search artists and performers on TMDB, with seamless character resolution.
   */
  static async searchArtists(query, options = {}) {
    if (!query || !query.trim()) return [];
    const { headers, queryParams, hasAuth } = TMDB.getAuthHeadersAndParams(options);
    if (!hasAuth) return [];

    const rawQuery = query.trim();
    const strippedQuery = rawQuery
      .replace(/^(?:who\s+(?:played|portrayed|voices)|character(?:\s*:\s*|\s+)|actor\s+for\s+)/i, '')
      .trim();
    const cleanLower = strippedQuery.toLowerCase().replace(/['"!?.]/g, '');

    // Check if query is a known fictional character first (via safe word-boundary matching)
    const isKnownCharacter = Boolean(TMDB.matchKnownCharacterKey(cleanLower));

    if (isKnownCharacter) {
      const characterActors = await TMDB.findActorsByCharacter(rawQuery, options);
      if (characterActors.length > 0) {
        return characterActors;
      }
    }

    queryParams.set('query', rawQuery);
    queryParams.set('include_adult', 'false');
    const url = `${TMDB.BASE_URL}/search/person?${queryParams.toString()}`;

    try {
      const res = await TMDB.fetchWithRetry(url, { headers });
      let results = [];
      if (res && res.ok) {
        const data = await res.json();
        results = data.results || [];
      }

      // Typo tolerance: If TMDB returns 0 matches for artist query, try character resolution or spell suggestion!
      let correctedQuery = null;
      if (results.length === 0) {
        // Dynamic character resolution fallback
        const dynamicCharActors = await TMDB.findActorsByCharacter(rawQuery, options);
        if (dynamicCharActors.length > 0) {
          return dynamicCharActors;
        }

        const corrected = await FuzzyMatcher.suggestCorrection(rawQuery);
        if (corrected && corrected.toLowerCase() !== rawQuery.toLowerCase()) {
          // Check if corrected query is a character
          const correctedCharActors = await TMDB.findActorsByCharacter(corrected, options);
          if (correctedCharActors.length > 0) {
            return correctedCharActors;
          }

          correctedQuery = corrected;
          queryParams.set('query', corrected);
          const retryRes = await TMDB.fetchWithRetry(`${TMDB.BASE_URL}/search/person?${queryParams.toString()}`, { headers });
          if (retryRes && retryRes.ok) {
            const retryData = await retryRes.json();
            results = retryData.results || [];
          }
        }
      }

      const filtered = results
        .filter(p => p.name && (p.known_for_department === 'Acting' || p.popularity > 2 || (p.known_for && p.known_for.length > 0)))
        .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
        .slice(0, 10);

      // Rank by fuzzy relevance
      const searchTarget = correctedQuery || rawQuery;
      const ranked = FuzzyMatcher.rankByRelevance(filtered, searchTarget, 'name');

      return ranked.map(p => ({
        id: p.id,
        name: p.name,
        profile: p.profile_path ? `${TMDB.IMAGE_BASE_URL}${p.profile_path}` : null,
        knownForDepartment: p.known_for_department || 'Acting',
        popularity: p.popularity || 0,
        knownFor: (p.known_for || []).map(k => k.title || k.name).filter(Boolean).slice(0, 4),
        correctedQuery: correctedQuery || null
      }));
    } catch (err) {
      console.warn('Artist search error:', err);
      return [];
    }
  }

  /**
   * Backward-compatible alias for searchArtists.
   */
  static async searchActors(query, options = {}) {
    return TMDB.searchArtists(query, options);
  }

  /**
   * Fetch Google Knowledge & Wikipedia summary for an artist.
   */
  static async getGoogleKnowledgeData(artistName) {
    const cleanName = (artistName || '').trim();
    if (!cleanName) return null;

    const baseResult = {
      searchUrl: `https://www.google.com/search?q=${encodeURIComponent(cleanName + ' artist')}`,
      newsUrl: `https://www.google.com/search?q=${encodeURIComponent(cleanName + ' artist')}&tbm=nws`,
      imagesUrl: `https://www.google.com/search?q=${encodeURIComponent(cleanName + ' artist')}&tbm=isch`,
      description: 'Film & Television Artist',
      extract: '',
      wikiUrl: '',
      source: 'Google Knowledge & Wikipedia'
    };

    try {
      const wikiSlug = encodeURIComponent(cleanName.replace(/\s+/g, '_'));
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${wikiSlug}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'MoodFlix/2.0 (contact@moodflix.dev)' }
      });

      if (res && res.ok) {
        const data = await res.json();
        if (data && data.type !== 'disambiguation') {
          baseResult.description = data.description || baseResult.description;
          baseResult.extract = data.extract || '';
          baseResult.wikiUrl = data.content_urls?.desktop?.page || '';
          if (data.thumbnail && data.thumbnail.source) {
            baseResult.thumbnail = data.thumbnail.source;
          }
        }
      }
    } catch (e) {
      // Non-blocking fallback to Google search URLs
    }

    return baseResult;
  }

  /**
   * Fetch full artist profile, credits/filmography, and Google Knowledge enrichment.
   */
  static async getArtistDetails(personId, options = {}) {
    const { headers, queryParams, hasAuth } = TMDB.getAuthHeadersAndParams(options);
    if (!hasAuth) return null;

    queryParams.set('append_to_response', 'combined_credits,external_ids');
    const url = `${TMDB.BASE_URL}/person/${personId}?${queryParams.toString()}`;

    try {
      const res = await TMDB.fetchWithRetry(url, { headers });
      if (!res || !res.ok) return null;

      const data = await res.json();
      const googleData = await TMDB.getGoogleKnowledgeData(data.name);

      // Process credits
      const rawCredits = data.combined_credits?.cast || [];
      const seen = new Set();
      const credits = [];

      for (const c of rawCredits) {
        const mediaType = c.media_type === 'tv' ? 'tv' : 'movie';
        const key = `${mediaType}_${c.id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const title = c.title || c.name || c.original_title || c.original_name;
        if (!title) continue;

        const dateStr = c.release_date || c.first_air_date || '';
        const year = dateStr ? parseInt(dateStr.slice(0, 4), 10) : null;

        credits.push({
          id: c.id,
          mediaType,
          title,
          character: c.character ? c.character.trim() : 'Self / Featured',
          year: year || null,
          releaseDate: dateStr,
          rating: c.vote_average ? Math.round(c.vote_average * 10) / 10 : 0,
          ratingPercent: Math.round((c.vote_average || 0) * 10),
          voteCount: c.vote_count || 0,
          popularity: c.popularity || 0,
          poster: c.poster_path ? `${TMDB.IMAGE_BASE_URL}${c.poster_path}` : 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=500',
          backdrop: c.backdrop_path ? `https://image.tmdb.org/t/p/w1280${c.backdrop_path}` : null,
          synopsis: c.overview || 'No synopsis available.'
        });
      }

      // Sort by popularity and vote count
      credits.sort((a, b) => {
        if ((b.voteCount || 0) > 50 && (a.voteCount || 0) > 50) {
          return (b.popularity || 0) - (a.popularity || 0);
        }
        return (b.voteCount || 0) - (a.voteCount || 0);
      });

      // Calculate age if born
      let age = null;
      if (data.birthday) {
        const birthDate = new Date(data.birthday);
        const endDate = data.deathday ? new Date(data.deathday) : new Date();
        age = Math.floor((endDate - birthDate) / (365.25 * 24 * 60 * 60 * 1000));
      }

      return {
        id: data.id,
        name: data.name,
        profile: data.profile_path ? `${TMDB.IMAGE_BASE_URL}${data.profile_path}` : (googleData?.thumbnail || null),
        biography: data.biography || googleData?.extract || 'No biography available.',
        birthday: data.birthday || null,
        deathday: data.deathday || null,
        age,
        placeOfBirth: data.place_of_birth || null,
        popularity: data.popularity || 0,
        knownForDepartment: data.known_for_department || 'Acting',
        google: googleData,
        external: {
          imdbId: data.external_ids?.imdb_id || null,
          imdbUrl: data.external_ids?.imdb_id ? `https://www.imdb.com/name/${data.external_ids.imdb_id}/` : null,
          wikidataId: data.external_ids?.wikidata_id || null,
          tmdbUrl: `https://www.themoviedb.org/person/${data.id}`
        },
        creditsCount: credits.length,
        credits
      };
    } catch (err) {
      console.warn('Artist details error:', err);
      return null;
    }
  }

  /**
   * Backward-compatible alias for getArtistDetails.
   */
  static async getActorDetails(personId, options = {}) {
    return TMDB.getArtistDetails(personId, options);
  }
}

