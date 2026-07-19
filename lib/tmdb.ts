import { Movie, Mood, Occasion, Category, Rating } from "./types";

// ─── TMDB genre ID → our genre name ─────────────────────────────
const TMDB_GENRE_MAP: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Science Fiction",
  53: "Thriller",
  10752: "War",
  37: "Western",
};

// ─── Mood inference from TMDB genres ─────────────────────────────
const GENRE_TO_MOODS: Record<number, Mood[]> = {
  28: ["neutral", "happy"],    // Action
  12: ["happy", "neutral"],    // Adventure
  16: ["happy"],               // Animation
  35: ["happy", "neutral"],    // Comedy
  80: ["neutral"],             // Crime
  18: ["neutral", "sad"],      // Drama
  10751: ["happy"],            // Family
  14: ["happy", "neutral"],    // Fantasy
  36: ["neutral", "sad"],      // History
  27: ["neutral"],             // Horror
  10402: ["happy"],            // Music
  9648: ["neutral"],           // Mystery
  10749: ["happy", "neutral"], // Romance
  878: ["neutral"],            // Science Fiction
  53: ["neutral"],             // Thriller
  10752: ["sad", "neutral"],   // War
  37: ["neutral"],             // Western
};

// ─── Occasion inference from TMDB genres ─────────────────────────
const GENRE_TO_OCCASIONS: Record<number, Occasion[]> = {
  28: ["friends", "solo"],            // Action
  12: ["friends", "family"],          // Adventure
  16: ["family"],                     // Animation
  35: ["friends", "date"],            // Comedy
  80: ["solo", "friends"],            // Crime
  18: ["solo", "partner"],            // Drama
  10751: ["family"],                  // Family
  14: ["friends", "solo"],            // Fantasy
  36: ["solo", "family"],             // History
  27: ["friends", "solo"],            // Horror
  10402: ["date", "friends"],         // Music
  9648: ["solo"],                     // Mystery
  10749: ["date", "partner"],         // Romance
  878: ["solo", "friends"],           // Science Fiction
  53: ["solo", "friends"],            // Thriller
  10752: ["solo"],                    // War
  37: ["friends", "solo"],            // Western
};

// ─── Category inference from TMDB genre combos + keywords ────────
// These are TMDB keyword IDs used in discover calls for category tagging
export const CATEGORY_KEYWORD_MAP: Record<Category, number[]> = {
  "true-story": [818, 9672, 5765],   // based on novel, based on true story
  "perspective-shift": [],           // inferred from high-rating dramas
  "nyc": [5765, 10178],             // new york city, new york
  "spy-cop": [470, 6149, 9715],     // spy, police, detective
  "space": [14909, 1826, 2535],     // outer space, space, astronaut
  "wedding": [2343, 3932],          // wedding, marriage
  "heist": [10291, 168142],         // heist, bank robbery
  "book": [818],                    // based on novel
  "racing": [6270, 4391],           // car chase, car racing
  "girl-power": [],                 // inferred from genre patterns
  "vegas": [1224],                  // las vegas
  "top-250": [],                    // inferred from vote_average
};

// ─── TMDB certification → our Rating ─────────────────────────────
function mapCertification(cert: string): Rating {
  switch (cert) {
    case "G": return "G";
    case "PG": return "PG";
    case "PG-13": return "PG-13";
    case "R":
    case "NC-17": return "R";
    default: return "PG-13"; // safe default
  }
}

// ─── TMDB response types ─────────────────────────────────────────
interface TMDBMovie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
  adult: boolean;
}

interface TMDBDiscoverResponse {
  page: number;
  results: TMDBMovie[];
  total_pages: number;
  total_results: number;
}

interface TMDBReleaseDates {
  id: number;
  results: Array<{
    iso_3166_1: string;
    release_dates: Array<{
      certification: string;
      type: number;
    }>;
  }>;
}

interface TMDBMovieDetail {
  id: number;
  runtime: number | null;
  release_dates: TMDBReleaseDates;
  keywords: {
    keywords: Array<{ id: number; name: string }>;
  };
  videos?: {
    results: Array<{ key: string; site: string; type: string }>;
  };
  "watch/providers"?: {
    results: Record<string, {
      flatrate?: Array<{ provider_id: number; provider_name: string; logo_path: string }>;
    }>;
  };
}

// ─── Core fetch helper (uses global fetch instead of node:https) ─
const TMDB_BASE = "https://api.themoviedb.org/3";

async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey || apiKey === "YOUR_TMDB_API_KEY_HERE") {
    throw new Error("TMDB_API_KEY not configured. Set it in .env.local");
  }

  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", apiKey);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`TMDB API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ─── Fetch discover pages ────────────────────────────────────────
async function fetchDiscoverPage(
  page: number,
  extraParams: Record<string, string> = {}
): Promise<TMDBMovie[]> {
  const data = await tmdbFetch<TMDBDiscoverResponse>("/discover/movie", {
    sort_by: "vote_average.desc",
    "vote_count.gte": "300",
    include_adult: "false",
    language: "en-US",
    with_original_language: "en",
    ...extraParams,
    page: String(page), // page MUST come last to avoid being overridden
  });
  return data.results;
}

// ─── Fetch movie details (runtime + US certification + keywords) ──
async function fetchMovieDetail(id: number): Promise<TMDBMovieDetail> {
  return tmdbFetch<TMDBMovieDetail>(`/movie/${id}`, {
    append_to_response: "release_dates,keywords,videos,watch/providers",
    language: "en-US",
  });
}

function getUSCertification(detail: TMDBMovieDetail): Rating {
  const usEntry = detail.release_dates?.results?.find((r) => r.iso_3166_1 === "US");
  if (!usEntry) return "PG-13";
  // prefer theatrical (type 3) or limited theatrical (type 2)
  const theatrical = usEntry.release_dates.find(
    (rd) => (rd.type === 3 || rd.type === 2) && rd.certification
  );
  if (theatrical) return mapCertification(theatrical.certification);
  // fallback to any certification
  const any = usEntry.release_dates.find((rd) => rd.certification);
  return any ? mapCertification(any.certification) : "PG-13";
}

// ─── Map a single TMDB movie into our Movie type ─────────────────
function inferMoods(genreIds: number[], voteAvg: number): Mood[] {
  const moods = new Set<Mood>();
  for (const gid of genreIds) {
    const m = GENRE_TO_MOODS[gid];
    if (m) m.forEach((mood) => moods.add(mood));
  }
  // High-rated dramas feel uplifting too
  if (voteAvg >= 8.0 && genreIds.includes(18)) {
    moods.add("happy");
  }
  // Romance + Comedy → happy
  if (genreIds.includes(10749) && genreIds.includes(35)) {
    moods.add("happy");
  }
  // Romance + Drama → sad
  if (genreIds.includes(10749) && genreIds.includes(18)) {
    moods.add("sad");
  }
  return moods.size > 0 ? [...moods] : ["neutral"];
}

function inferOccasions(genreIds: number[], rating: Rating): Occasion[] {
  const occasions = new Set<Occasion>();
  for (const gid of genreIds) {
    const o = GENRE_TO_OCCASIONS[gid];
    if (o) o.forEach((occ) => occasions.add(occ));
  }
  // Family-friendly movies → family occasion
  if (rating === "G" || rating === "PG") {
    occasions.add("family");
  }
  // Romance + Comedy → date
  if (genreIds.includes(10749) && genreIds.includes(35)) {
    occasions.add("date");
    occasions.add("partner");
  }
  // Ensure date ↔ partner symmetry: picking either should match the same movies
  if (occasions.has("date") || occasions.has("partner")) {
    occasions.add("date");
    occasions.add("partner");
  }
  return occasions.size > 0 ? [...occasions] : ["solo", "friends"];
}

function inferCategories(
  genreIds: number[],
  keywords: Array<{ id: number; name: string }>,
  voteAvg: number,
  voteCount: number,
): Category[] {
  const categories = new Set<Category>();
  const kwIds = new Set(keywords.map((k) => k.id));
  const kwNames = new Set(keywords.map((k) => k.name.toLowerCase()));

  // Keyword-based category matching
  for (const [category, kwList] of Object.entries(CATEGORY_KEYWORD_MAP)) {
    for (const kwId of kwList) {
      if (kwIds.has(kwId)) {
        categories.add(category as Category);
        break;
      }
    }
  }

  // Name-based keyword matching for better coverage
  if (kwNames.has("based on novel") || kwNames.has("based on a novel") || kwNames.has("novel")) {
    categories.add("book");
  }
  if (kwNames.has("based on true story") || kwNames.has("biography") || kwNames.has("true story") || kwNames.has("biographical")) {
    categories.add("true-story");
  }
  if (kwNames.has("new york city") || kwNames.has("new york") || kwNames.has("manhattan") || kwNames.has("brooklyn")) {
    categories.add("nyc");
  }
  if (kwNames.has("spy") || kwNames.has("espionage") || kwNames.has("police") || kwNames.has("detective") || kwNames.has("fbi") || kwNames.has("cia")) {
    categories.add("spy-cop");
  }
  if (kwNames.has("space") || kwNames.has("astronaut") || kwNames.has("outer space") || kwNames.has("spaceship") || kwNames.has("nasa")) {
    categories.add("space");
  }
  if (kwNames.has("wedding") || kwNames.has("bride") || kwNames.has("marriage ceremony")) {
    categories.add("wedding");
  }
  if (kwNames.has("heist") || kwNames.has("bank robbery") || kwNames.has("robbery") || kwNames.has("theft")) {
    categories.add("heist");
  }
  if (kwNames.has("car race") || kwNames.has("car racing") || kwNames.has("formula one") || kwNames.has("nascar") || kwNames.has("auto racing") || kwNames.has("racing")) {
    categories.add("racing");
  }
  if (kwNames.has("las vegas") || kwNames.has("casino") || kwNames.has("gambling")) {
    categories.add("vegas");
  }
  if (kwNames.has("female protagonist") || kwNames.has("feminism") || kwNames.has("strong woman") || kwNames.has("women's rights")) {
    categories.add("girl-power");
  }

  // Genre-based inference
  if (genreIds.includes(36)) categories.add("true-story"); // History genre
  if (genreIds.includes(878)) categories.add("space");     // Sci-Fi heuristic

  // Top-250 heuristic: high rating + many votes
  if (voteAvg >= 7.5 && voteCount >= 2000) {
    categories.add("top-250");
  }

  // Perspective-shift: highly rated dramas
  if (voteAvg >= 7.8 && genreIds.includes(18)) {
    categories.add("perspective-shift");
  }

  return [...categories];
}

function mapGenres(genreIds: number[]): string[] {
  const genres: string[] = [];
  for (const gid of genreIds) {
    const name = TMDB_GENRE_MAP[gid];
    if (name && !genres.includes(name)) {
      genres.push(name);
    }
  }
  return genres.length > 0 ? genres : ["Drama"]; // fallback
}

// ─── Color hue from genre (for gradient poster fallback) ─────────
function hueFromGenres(genreIds: number[]): number {
  const genreHues: Record<number, number> = {
    28: 8, 12: 25, 16: 48, 35: 45, 80: 0, 18: 220,
    10751: 130, 14: 280, 36: 40, 27: 330, 10749: 340,
    878: 200, 53: 15, 10752: 100, 37: 30,
  };
  for (const gid of genreIds) {
    if (genreHues[gid] !== undefined) return genreHues[gid];
  }
  return 210;
}

// ─── Shared: enrich a batch of TMDBMovie[] into Movie[] ──────────
async function enrichMovies(rawMovies: TMDBMovie[]): Promise<Movie[]> {
  // Fetch details for each movie (runtime + certification + keywords)
  // Batch in groups to respect rate limits (~40 req/10s)
  const BATCH_SIZE = 40;
  const details = new Map<number, TMDBMovieDetail>();

  for (let i = 0; i < rawMovies.length; i += BATCH_SIZE) {
    const batch = rawMovies.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((m) => fetchMovieDetail(m.id).catch(() => null))
    );
    for (const detail of batchResults) {
      if (detail) details.set(detail.id, detail);
    }
    // Small delay between batches to be nice to TMDB
    if (i + BATCH_SIZE < rawMovies.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  const movies: Movie[] = [];

  for (const raw of rawMovies) {
    const detail = details.get(raw.id);
    const rating = detail ? getUSCertification(detail) : (raw.adult ? "R" : "PG-13");
    const keywords = detail?.keywords?.keywords ?? [];
    const runtime = detail?.runtime ?? 120; // fallback runtime
    const trailerKey = detail?.videos?.results?.find(v => v.site === "YouTube" && v.type === "Trailer")?.key;
    
    const rawProviders = detail?.["watch/providers"]?.results || {};
    const targetRegions = ["US", "IN", "GB", "DE", "FR", "IT", "ES"]; // US, India, and major European regions
    const providerMap = new Map<number, { provider_id: number; provider_name: string; logo_path: string }>();
    
    for (const region of targetRegions) {
      const regionProviders = rawProviders[region]?.flatrate || [];
      for (const p of regionProviders) {
        if (!providerMap.has(p.provider_id)) {
          providerMap.set(p.provider_id, p);
        }
      }
    }
    const providers = Array.from(providerMap.values());
    const year = parseInt(raw.release_date?.split("-")[0], 10);

    if (isNaN(year) || year < 1970) continue; // skip very old or invalid

    const genres = mapGenres(raw.genre_ids);
    const moods = inferMoods(raw.genre_ids, raw.vote_average);
    const occasions = inferOccasions(raw.genre_ids, rating);
    const categories = inferCategories(raw.genre_ids, keywords, raw.vote_average, raw.vote_count);

    movies.push({
      id: `tmdb-${raw.id}`,
      tmdbId: raw.id,
      title: raw.title,
      year,
      runtime,
      genres,
      moods,
      occasions,
      rating,
      categories,
      blurb: raw.overview || "A must-watch film.",
      hue: hueFromGenres(raw.genre_ids),
      posterPath: raw.poster_path ? `https://image.tmdb.org/t/p/w500${raw.poster_path}` : null,
      backdropPath: raw.backdrop_path ? `https://image.tmdb.org/t/p/w1280${raw.backdrop_path}` : null,
      trailerKey: trailerKey || null,
      providers: providers || [],
      voteAverage: raw.vote_average,
    });
  }

  return movies;
}

// ─── Main entry: fetch & build full movie list ───────────────────
// Caching is now handled at the route level via ISR (revalidate = 3600)
export async function fetchTMDBMovies(): Promise<Movie[]> {
  const randomPage = (max: number) => Math.floor(Math.random() * max) + 1;

  // Step 1: Fetch popular + top-rated movies (broad coverage, randomized pages)
  const popularParams = { sort_by: "popularity.desc", "vote_count.gte": "500" };
  const topRatedParams = { sort_by: "vote_average.desc", "vote_count.gte": "1000" };

  const popularCalls = Array.from({ length: 12 }, () =>
    fetchDiscoverPage(randomPage(40), popularParams)
  );
  const topRatedCalls = Array.from({ length: 12 }, () =>
    fetchDiscoverPage(randomPage(40), topRatedParams)
  );

  // Step 2: Fetch genre-specific movies for better coverage
  const genreParams = { sort_by: "vote_average.desc", "vote_count.gte": "200" };
  const genreCalls = [
    fetchDiscoverPage(randomPage(10), { ...genreParams, with_genres: "35,10749" }),
    fetchDiscoverPage(randomPage(10), { ...genreParams, with_genres: "878" }),
    fetchDiscoverPage(randomPage(10), { ...genreParams, with_genres: "28" }),
    fetchDiscoverPage(randomPage(10), { ...genreParams, with_genres: "16,10751" }),
    fetchDiscoverPage(randomPage(10), { ...genreParams, with_genres: "53,80" }),
    fetchDiscoverPage(randomPage(10), { ...genreParams, with_genres: "18,36" }),
  ];

  const allBatches = await Promise.all([...popularCalls, ...topRatedCalls, ...genreCalls]);
  const allRaw = allBatches.flat();

  const seen = new Map<number, TMDBMovie>();
  for (const m of allRaw) {
    if (!seen.has(m.id) && m.poster_path && m.release_date && m.title) {
      seen.set(m.id, m);
    }
  }

  const uniqueMovies = [...seen.values()];
  return enrichMovies(uniqueMovies);
}

// ─── Search movies by query ──────────────────────────────────────
export async function searchTMDBMovies(query: string): Promise<Movie[]> {
  if (!query || query.trim().length === 0) return [];

  const data = await tmdbFetch<TMDBDiscoverResponse>("/search/movie", {
    query: query.trim(),
    include_adult: "false",
    language: "en-US",
    page: "1",
  });

  // Filter to movies with posters and release dates for quality
  const filtered = data.results.filter(
    (m) => m.poster_path && m.release_date && m.title && m.vote_count > 5
  );

  // Enrich the top 10 results with full details
  const top = filtered.slice(0, 10);
  return enrichMovies(top);
}

// ─── Fetch similar movies ────────────────────────────────────────
export async function fetchSimilarMovies(tmdbId: number): Promise<Movie[]> {
  const data = await tmdbFetch<TMDBDiscoverResponse>(`/movie/${tmdbId}/similar`, {
    language: "en-US",
    page: "1",
  });

  // Filter to movies with posters for quality
  const filtered = data.results.filter(
    (m) => m.poster_path && m.release_date && m.title
  );

  // Enrich the top 12 similar movies
  const top = filtered.slice(0, 12);
  return enrichMovies(top);
}
