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

    // 3. Fallback: If 0 results found (e.g. typo), search against popular/trending pool
    if (items.length === 0) {
      try {
        const popular = await TMDB.fetchCategoryLive(type, 'popular', headers, baseParams);
        const trending = await TMDB.fetchCategoryLive(type, 'trending', headers, baseParams);
        const topRated = await TMDB.fetchCategoryLive(type, 'top_rated', headers, baseParams);
        const pool = [...popular, ...trending, ...topRated];

        for (const item of pool) {
          if (!seenIds.has(item.id)) {
            const rel = FuzzyMatcher.calculateRelevanceScore(raw, item.title, item.year);
            if (rel >= 45) {
              seenIds.add(item.id);
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

  /**
   * Fetch media details including runtime, trailer, and watch providers.
   */
  static async getDetails(id, type = 'movie', options = {}) {
    const { headers, queryParams } = TMDB.getAuthHeadersAndParams(options);
    queryParams.append('append_to_response', 'videos,watch/providers');
    
    const url = `${TMDB.BASE_URL}/${type}/${id}?${queryParams.toString()}`;
    const res = await TMDB.fetchWithRetry(url, { headers });
    
    if (!res || !res.ok) return null;
    
    const data = await res.json();
    
    let trailerKey = null;
    if (data.videos && data.videos.results) {
      const trailer = data.videos.results.find(v => v.type === 'Trailer' && v.site === 'YouTube');
      if (trailer) trailerKey = trailer.key;
    }
    
    let watchProviders = [];
    if (data['watch/providers'] && data['watch/providers'].results && data['watch/providers'].results.US) {
      const usProviders = data['watch/providers'].results.US;
      if (usProviders.flatrate) watchProviders.push(...usProviders.flatrate);
      if (usProviders.rent) watchProviders.push(...usProviders.rent);
      if (usProviders.buy) watchProviders.push(...usProviders.buy);
      
      // Deduplicate by provider_id
      const seen = new Set();
      watchProviders = watchProviders.filter(p => {
        if (seen.has(p.provider_id)) return false;
        seen.add(p.provider_id);
        return true;
      });
    }
    
    return {
      runtime: data.runtime || (data.episode_run_time && data.episode_run_time[0]) || 0,
      trailerKey,
      watchProviders,
      backdrop: data.backdrop_path ? `https://image.tmdb.org/t/p/original${data.backdrop_path}` : null,
      budget: data.budget,
      revenue: data.revenue,
      status: data.status,
      seasons: data.seasons || [],
    };
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
   * Fetch similar media.
   */
  static async getSimilar(id, type = 'movie', options = {}) {
    const { headers, queryParams } = TMDB.getAuthHeadersAndParams(options);
    
    const url = `${TMDB.BASE_URL}/${type}/${id}/similar?${queryParams.toString()}`;
    const res = await TMDB.fetchWithRetry(url, { headers });
    
    if (!res || !res.ok) return [];
    
    const data = await res.json();
    
    return (data.results || []).map(r => ({
      ...(type === 'tv' ? TMDB.mapTMDBTVResult(r) : TMDB.mapTMDBMovieResult(r)),
      category: 'similar'
    }));
  }
}
