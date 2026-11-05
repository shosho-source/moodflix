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

    const seen = new Set();
    const combined = [];
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

    let items = [];
    try {
      if (search) {
        items = await TMDB.searchAnimeLive(search, mediaType, headers, queryParams);
      } else {
        items = await TMDB.fetchAnimeCategoryLive(category, mediaType, headers, queryParams);
      }
    } catch (err) {
      items = [];
    }

    if (!Array.isArray(items)) {
      items = [];
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

    let items = [];
    const { headers, queryParams, hasAuth } = TMDB.getAuthHeadersAndParams(options);

    if (hasAuth) {
      try {
        if (search) {
          items = await TMDB.searchMediaLive(search, type, headers, queryParams);
        } else {
          items = await TMDB.fetchCategoryLive(type, category, headers, queryParams);
        }
      } catch (err) {
        items = [];
      }
    }

    if (!Array.isArray(items)) {
      items = [];
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
   * Fetch similar movies or TV shows for a given ID.
   */
  static async getSimilarMedia(id, type = 'movie', options = {}) {
    const { headers, queryParams, hasAuth } = TMDB.getAuthHeadersAndParams(options);
    if (!hasAuth) return [];

    const endpoint = type === 'tv' ? `/tv/${id}/similar` : `/movie/${id}/similar`;
    const url = `${TMDB.BASE_URL}${endpoint}?${queryParams.toString()}`;

    try {
      const res = await TMDB.fetchWithRetry(url, { headers });
      if (res && res.ok) {
        const data = await res.json();
        const results = data.results || [];
        return results.slice(0, 14).map(item => ({
          ...(type === 'tv' ? TMDB.mapTMDBTVResult(item) : TMDB.mapTMDBMovieResult(item)),
          category: 'similar'
        }));
      }
    } catch (e) {
      console.warn(`Failed to fetch similar media for ${type} ${id}:`, e);
    }
    return [];
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
      } catch (e) {}
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
      } catch (e) {}
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
      } catch (e) {}
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
      } catch (e) {}
    }

    return finalResults.slice(0, 24);
  }

  /**
   * Fetch category feeds for Movies or TV Series.
   */
  static async fetchCategoryLive(type = 'movie', category, headers, baseParams) {
    let endpoint;
    if (type === 'tv') {
      endpoint = '/trending/tv/week';
      if (category === 'top_rated') endpoint = '/tv/top_rated';
      if (category === 'popular') endpoint = '/tv/popular';
      if (category === 'on_the_air' || category === 'now_playing') endpoint = '/tv/on_the_air';
    } else {
      endpoint = '/trending/movie/week';
      if (category === 'top_rated') endpoint = '/movie/top_rated';
      if (category === 'popular') endpoint = '/movie/popular';
      if (category === 'now_playing') endpoint = '/movie/now_playing';
    }

    const fetchPage = async (page) => {
      const params = new URLSearchParams(baseParams);
      params.set('page', page.toString());
      const url = `${TMDB.BASE_URL}${endpoint}?${params.toString()}`;
      const res = await TMDB.fetchWithRetry(url, { headers });
      if (!res || !res.ok) return [];
      const data = await res.json();
      return data.results || [];
    };

    const [page1, page2] = await Promise.all([fetchPage(1), fetchPage(2)]);
    const combined = [...page1, ...page2];

    return combined.map(r => ({
      ...(type === 'tv' ? TMDB.mapTMDBTVResult(r) : TMDB.mapTMDBMovieResult(r)),
      category: category === 'all' ? 'trending' : category
    }));
  }

  /**
   * Fetch category feeds for Anime (TV series and Movies).
   */
  static async fetchAnimeCategoryLive(category = 'all', mediaType = 'all', headers, baseParams) {
    const fetchAnimeFor = async (type, page = 1) => {
      const endpoint = type === 'tv' ? '/discover/tv' : '/discover/movie';
      const params = new URLSearchParams(baseParams);
      params.set('with_genres', '16');
      params.set('with_original_language', 'ja');
      params.set('page', page.toString());

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
      } catch (e) {}
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

  /**
   * Search YouTube for an official trailer key if TMDB lacks one.
   */
  static async findYouTubeTrailer(title, year = '', type = 'movie') {
    if (!title) return null;
    const cacheKey = `${type}:${title}:${year}`.toLowerCase();
    if (TMDB.trailerCache && TMDB.trailerCache.has(cacheKey)) {
      return TMDB.trailerCache.get(cacheKey);
    }

    const typeKeyword = type === 'tv' ? 'tv series' : 'movie';
    const query = `${title} ${year ? year : ''} ${typeKeyword} official trailer`.replace(/\s+/g, ' ').trim();
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

    try {
      const res = await TMDB.fetchWithRetry(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      if (!res || !res.ok) return null;

      const text = await res.text();
      const matches = [...text.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)];
      if (matches.length > 0) {
        const foundKey = matches[0][1];
        if (TMDB.trailerCache) {
          if (TMDB.trailerCache.size > 200) {
            const firstKey = TMDB.trailerCache.keys().next().value;
            TMDB.trailerCache.delete(firstKey);
          }
          TMDB.trailerCache.set(cacheKey, foundKey);
        }
        return foundKey;
      }
    } catch (err) {
      console.warn(`[TMDB] YouTube trailer fallback search error for "${title}":`, err.message);
    }

    return null;
  }

  /**
   * Fetch media details including runtime, trailer, and watch providers.
   */
  static async getDetails(id, type = 'movie', options = {}) {
    const { headers, queryParams } = TMDB.getAuthHeadersAndParams(options);
    queryParams.append('append_to_response', 'videos,watch/providers,credits');
    queryParams.set('include_video_language', 'en,null,ja,ko,es,fr,de,zh,it,pt,ru,hi');
    
    const url = `${TMDB.BASE_URL}/${type}/${id}?${queryParams.toString()}`;
    const res = await TMDB.fetchWithRetry(url, { headers });
    
    if (!res || !res.ok) return null;
    
    const data = await res.json();
    
    let trailerKey = null;
    const trailerKeys = [];
    const seenTrailerKeys = new Set();
    const addTrailerKey = (key) => {
      if (key && typeof key === 'string' && key.length === 11 && !seenTrailerKeys.has(key)) {
        seenTrailerKeys.add(key);
        trailerKeys.push(key);
      }
    };

    if (data.videos && Array.isArray(data.videos.results) && data.videos.results.length > 0) {
      const ytVideos = data.videos.results.filter(v => v.site === 'YouTube' && v.key);
      const officialTrailers = ytVideos.filter(v => v.type === 'Trailer' && v.official === true);
      const anyTrailers = ytVideos.filter(v => v.type === 'Trailer');
      const anyTeasers = ytVideos.filter(v => v.type === 'Teaser');
      const anyClips = ytVideos.filter(v => v.type === 'Clip' || v.type === 'Opening Credits' || v.type === 'Featurette');
      
      [...officialTrailers, ...anyTrailers, ...anyTeasers, ...anyClips, ...ytVideos].forEach(v => addTrailerKey(v.key));
    }

    // Always fetch or fallback to YouTube search if fewer than 2 keys exist to provide alternatives
    const mediaTitle = data.title || data.name || options.fallbackTitle || '';
    const mediaYear = (data.release_date || data.first_air_date || options.fallbackYear || '').substring(0, 4);
    if (trailerKeys.length < 2 && mediaTitle) {
      try {
        const ytSearchKey = await TMDB.findYouTubeTrailer(mediaTitle, mediaYear, type);
        if (ytSearchKey) addTrailerKey(ytSearchKey);
      } catch (e) {}
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

    // Parse cast members for the details card
    let cast = [];
    const rawCast = data.credits?.cast || data.aggregate_credits?.cast || [];
    if (Array.isArray(rawCast) && rawCast.length > 0) {
      cast = rawCast.slice(0, 16).map(c => ({
        id: c.id,
        name: c.name || c.original_name,
        character: (c.character || (c.roles && c.roles[0]?.character) || '').trim(),
        profile: c.profile_path ? `${TMDB.IMAGE_BASE_URL}${c.profile_path}` : null,
        order: c.order ?? 999
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
    
    return {
      id: data.id,
      mediaType: type,
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
      rating: Math.round((data.vote_average || 0) * 10) / 10,
      voteCount: data.vote_count || 0
    };
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

    // 1. Check knowledge map
    let matchEntry = null;
    if (TMDB.CHARACTER_ACTORS[raw]) {
      matchEntry = TMDB.CHARACTER_ACTORS[raw];
    } else {
      for (const [charKey, val] of Object.entries(TMDB.CHARACTER_ACTORS)) {
        if (raw === charKey || raw.includes(charKey) || (charKey.length > 4 && charKey.includes(raw))) {
          matchEntry = val;
          break;
        }
      }
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
      } catch (e) {}
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
      } catch (err) {}
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

    // Check if query is a known fictional character first
    const isKnownCharacter = Object.keys(TMDB.CHARACTER_ACTORS).some(key => 
      cleanLower === key || (key.length >= 4 && (cleanLower.includes(key) || key.includes(cleanLower)))
    );

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

