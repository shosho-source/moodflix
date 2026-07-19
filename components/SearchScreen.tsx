"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Movie } from "@/lib/types";
import MovieResult from "./MovieResult";
import PosterCard from "./PosterCard";

type SearchStage = "search" | "detail";

export default function SearchScreen() {
  const [stage, setStage] = useState<SearchStage>("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [similarMovies, setSimilarMovies] = useState<Movie[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      setResults(data.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  // Select a movie and fetch similar
  async function selectMovie(movie: Movie) {
    setSelectedMovie(movie);
    setStage("detail");
    setSimilarMovies([]);
    setSimilarLoading(true);

    if (movie.tmdbId) {
      try {
        const res = await fetch(`/api/similar?id=${movie.tmdbId}`);
        const data = await res.json();
        setSimilarMovies(data.results ?? []);
      } catch {
        setSimilarMovies([]);
      }
    }
    setSimilarLoading(false);
  }

  function backToSearch() {
    setStage("search");
    setSelectedMovie(null);
    setSimilarMovies([]);
  }

  return (
    <div className="flex-1 flex flex-col" style={{ background: "var(--md-surface-dim)" }}>
      <main className="flex-1 w-full max-w-[420px] sm:max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-16 flex flex-col">

        <AnimatePresence mode="wait">
          {stage === "search" && (
            <motion.div
              key="search"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              <div className="rounded-[var(--md-shape-xl)] p-6 sm:p-10 shadow-2xl" style={{ background: "var(--md-surface-container)" }}>
                {/* Header with back link */}
                <div className="flex items-center gap-3 mb-6">
                  <Link
                    href="/"
                    className="flex items-center justify-center w-10 h-10 rounded-full transition-colors"
                    style={{ color: "var(--md-on-surface-variant)" }}
                  >
                    <span className="material-symbols-outlined text-[22px]">arrow_back</span>
                  </Link>
                  <h1 className="font-display text-2xl sm:text-3xl tracking-tight" style={{ color: "var(--md-on-surface)" }}>
                    Search Movies
                  </h1>
                </div>

                {/* Search input */}
                <div className="search-input-wrapper mb-6">
                  <span className="material-symbols-outlined search-input-icon">search</span>
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Type a movie name..."
                    className="search-input"
                    autoFocus
                  />
                  {query && (
                    <button
                      onClick={() => { setQuery(""); setResults([]); }}
                      className="search-input-clear"
                    >
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  )}
                </div>

                {/* Loading state */}
                {loading && (
                  <div className="flex items-center justify-center py-12">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                      className="w-8 h-8 rounded-full border-[3px] border-[var(--md-primary)] border-t-transparent"
                    />
                  </div>
                )}

                {/* No results */}
                {!loading && query.trim().length >= 2 && results.length === 0 && (
                  <div className="text-center py-12">
                    <span className="material-symbols-outlined text-[48px] mb-4 block" style={{ color: "var(--md-outline)" }}>movie_off</span>
                    <p className="text-sm" style={{ color: "var(--md-on-surface-variant)" }}>
                      No movies found for &quot;{query}&quot;
                    </p>
                  </div>
                )}

                {/* Results list */}
                {!loading && results.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {results.map((movie) => (
                      <button
                        key={movie.id}
                        onClick={() => selectMovie(movie)}
                        className="search-result-card"
                      >
                        <md-ripple></md-ripple>
                        <div className="w-12 h-[72px] rounded-[var(--md-shape-xs)] overflow-hidden shrink-0 bg-[var(--md-surface-container-highest)]">
                          {movie.posterPath && (
                            <Image
                              src={movie.posterPath}
                              alt={movie.title}
                              width={48}
                              height={72}
                              className="w-full h-full object-cover"
                              unoptimized
                            />
                          )}
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <p className="font-display text-[15px] font-bold truncate" style={{ color: "var(--md-on-surface)" }}>
                            {movie.title}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: "var(--md-on-surface-variant)" }}>
                            {movie.year} · {movie.genres.slice(0, 3).join(", ")}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            {movie.voteAverage != null && movie.voteAverage > 0 && (
                              <span className="flex items-center gap-0.5 text-xs font-medium" style={{ color: "var(--md-primary)" }}>
                                <span className="material-symbols-outlined text-[12px]">star</span>
                                {movie.voteAverage.toFixed(1)}
                              </span>
                            )}
                            <span className="text-xs" style={{ color: "var(--md-outline)" }}>
                              {movie.runtime} min
                            </span>
                          </div>
                        </div>
                        <span className="material-symbols-outlined text-[20px] shrink-0" style={{ color: "var(--md-outline)" }}>
                          chevron_right
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Empty state hint */}
                {!loading && query.trim().length < 2 && results.length === 0 && (
                  <div className="text-center py-12">
                    <span className="material-symbols-outlined text-[48px] mb-4 block" style={{ color: "var(--md-outline-variant)" }}>theaters</span>
                    <p className="text-sm" style={{ color: "var(--md-on-surface-variant)" }}>
                      Search for any movie to see details and find similar films.
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {stage === "detail" && selectedMovie && (
            <motion.div
              key="detail"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.25 }}
            >
              <div className="rounded-[var(--md-shape-xl)] p-6 sm:p-10 shadow-2xl" style={{ background: "var(--md-surface-container)" }}>
                <MovieResult
                  movie={selectedMovie}
                  showHeader={false}
                  onRestart={backToSearch}
                  restartLabel="Back to Search"
                />

                {/* Similar Movies Section */}
                <div className="mt-8 pt-6 border-t" style={{ borderColor: "var(--md-outline-variant)" }}>
                  <h3 className="flex items-center gap-2 font-display text-lg font-bold mb-4" style={{ color: "var(--md-on-surface)" }}>
                    <span className="material-symbols-outlined text-[20px]" style={{ color: "var(--md-primary)" }}>movie_filter</span>
                    Similar Movies
                  </h3>

                  {similarLoading && (
                    <div className="flex items-center justify-center py-8">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                        className="w-6 h-6 rounded-full border-[3px] border-[var(--md-primary)] border-t-transparent"
                      />
                    </div>
                  )}

                  {!similarLoading && similarMovies.length > 0 && (
                    <div className="similar-carousel">
                      {similarMovies.map((movie) => (
                        <button
                          key={movie.id}
                          onClick={() => selectMovie(movie)}
                          className="similar-card"
                        >
                          <div className="w-[120px] shrink-0">
                            <PosterCard movie={movie} />
                          </div>
                          <p className="font-display text-xs font-bold mt-2 line-clamp-2 text-center" style={{ color: "var(--md-on-surface)" }}>
                            {movie.title}
                          </p>
                          <p className="text-[10px] mt-0.5 text-center" style={{ color: "var(--md-on-surface-variant)" }}>
                            {movie.year}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}

                  {!similarLoading && similarMovies.length === 0 && (
                    <p className="text-sm text-center py-6" style={{ color: "var(--md-on-surface-variant)" }}>
                      No similar movies found.
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
