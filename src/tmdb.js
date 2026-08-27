/**
 * TMDB - The Movie Database API Client & Provider.
 * High-performance movie & TV show discovery with live v3/v4 API, Bearer Token authentication,
 * multi-page search, and tiered relevance ranking.
 */

import { Storage, DEFAULT_TMDB_API_KEY, DEFAULT_TMDB_READ_TOKEN } from './storage.js';
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
                  DEFAULT_TMDB_READ_TOKEN;
                  
    const apiKey = (options.apiKey && String(options.apiKey).trim()) ||
                   (settings.tmdbApiKey && String(settings.tmdbApiKey).trim()) ||
                   (process.env.TMDB_API_KEY && String(process.env.TMDB_API_KEY).trim()) ||
                   DEFAULT_TMDB_API_KEY;

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
  static async getQuizRecommendations(answers, options = {}) {
    const { headers, queryParams, hasAuth } = TMDB.getAuthHeadersAndParams(options);
    if (!hasAuth) return [];

    // 1. Map Occasion/Mood to implicit Genres
    const targetGenres = new Set(answers.genres || []);
    
    // Mood
    if (answers.mood === 'happy') {
      targetGenres.add('Comedy');
      targetGenres.add('Family');
      targetGenres.add('Animation');
    } else if (answers.mood === 'sad') {
      targetGenres.add('Drama');
      targetGenres.add('Romance');
    } else if (answers.mood === 'neutral') {
      targetGenres.add('Adventure');
      targetGenres.add('Mystery');
      targetGenres.add('Science Fiction');
    }

    // Occasion
    if (answers.occasion === 'date') {
      targetGenres.add('Romance');
      targetGenres.add('Comedy');
    } else if (answers.occasion === 'family') {
      targetGenres.add('Family');
      targetGenres.add('Animation');
    } else if (answers.occasion === 'solo') {
      targetGenres.add('Thriller');
      targetGenres.add('Mystery');
      targetGenres.add('Science Fiction');
    } else if (answers.occasion === 'friends') {
      targetGenres.add('Comedy');
      targetGenres.add('Action');
      targetGenres.add('Horror');
    } else if (answers.occasion === 'partner') {
      targetGenres.add('Romance');
      targetGenres.add('Drama');
    }

    const fetchPage = async (page, dType) => {
      const endpoint = dType === 'tv' ? '/discover/tv' : '/discover/movie';
      const params = new URLSearchParams(queryParams);
      params.set('sort_by', 'vote_average.desc');
      params.set('vote_count.gte', '50');
      
      // Recency
      if (answers.recency && answers.recency !== 'any') {
        const cutoff = new Date().getFullYear() - parseInt(answers.recency, 10);
        if (dType === 'tv') {
          params.set('first_air_date.gte', `${cutoff}-01-01`);
        } else {
          params.set('primary_release_date.gte', `${cutoff}-01-01`);
        }
      }

      // Genre Mapping with comprehensive aliases
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
        "thriller": "9648|80", "horror": "9648", "war": "10768", "war & politics": "10768", "war and politics": "10768",
        "western": "37"
      };

      const mapToUse = dType === 'tv' ? TV_REVERSE_GENRE_MAP : REVERSE_GENRE_MAP;
      const tmdbGenreIds = Array.from(targetGenres).map(g => mapToUse[g.toLowerCase()]).filter(Boolean);
      
      if (tmdbGenreIds.length > 0) {
        params.set('with_genres', tmdbGenreIds.join('|')); // OR mapping for broader discovery
      }

      params.set('page', page.toString());
      const url = `${TMDB.BASE_URL}${endpoint}?${params.toString()}`;
      const res = await TMDB.fetchWithRetry(url, { headers });
      if (!res || !res.ok) return [];
      const data = await res.json();
      return (data.results || []).map(r => ({
        ...(dType === 'tv' ? TMDB.mapTMDBTVResult(r) : TMDB.mapTMDBMovieResult(r)),
        category: 'quiz'
      }));
    };

    let results = [];
    if (answers.mediaPreference === 'both') {
      const [moviesPage1, tvPage1] = await Promise.all([
        fetchPage(1, 'movie'),
        fetchPage(1, 'tv')
      ]);
      const maxLength = Math.max(moviesPage1.length, tvPage1.length);
      for (let i = 0; i < maxLength; i++) {
        if (i < moviesPage1.length) results.push(moviesPage1[i]);
        if (i < tvPage1.length) results.push(tvPage1[i]);
      }
    } else {
      const dType = answers.mediaPreference === 'tv' ? 'tv' : 'movie';
      const [page1, page2] = await Promise.all([fetchPage(1, dType), fetchPage(2, dType)]);
      results = [...page1, ...page2];
    }

    return results.slice(0, 24);
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
