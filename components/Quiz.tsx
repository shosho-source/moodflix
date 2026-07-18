"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Movie, QuizAnswers, emptyAnswers, Rating, Category } from "@/lib/types";
import { recommend, scoreMovie, maxScore } from "@/lib/recommend";
import { genreList, dateGenres } from "@/lib/movies";
import OptionCard from "./OptionCard";
import Sprocket from "./Sprocket";
import PosterCard from "./PosterCard";

type Stage = "intro" | "quiz" | "result" | "empty" | "loading" | "calculating" | "splash";

const moodOptions = [
  { value: "happy", label: "Happy", sub: "In the mood for something upbeat" },
  { value: "neutral", label: "Neutral", sub: "Open to anything" },
  { value: "sad", label: "Sad", sub: "Could use something that meets me there" },
] as const;

const occasionOptions = [
  { value: "solo", label: "Just watching a movie by myself." },
  { value: "date", label: "Movie date." },
  { value: "friends", label: "Movie night with friends." },
  { value: "partner", label: "Date night with a partner." },
  { value: "family", label: "Watching with family or relatives." },
] as const;

const recencyOptions = [
  { value: "any", label: "Doesn't matter." },
  { value: "5", label: "Published in the last 5 years." },
  { value: "10", label: "Published in the last 10 years." },
  { value: "25", label: "Published in the last 25 years." },
] as const;

const ratingOptions: { value: Rating; label: string; sub: string }[] = [
  { value: "G", label: "G", sub: "All ages admitted." },
  { value: "PG", label: "PG", sub: "Some material may not suit children." },
  { value: "PG-13", label: "PG-13", sub: "Some material inappropriate under 13." },
  { value: "R", label: "R", sub: "Under 17 needs an accompanying adult." },
];

const categoryOptions: { value: Category | "none"; label: string }[] = [
  { value: "none", label: "I don't have a preference." },
  { value: "true-story", label: "Based on a true story" },
  { value: "perspective-shift", label: "Movies that change how you see life" },
  { value: "nyc", label: "Set in New York City" },
  { value: "spy-cop", label: "Spy movies and cop movies" },
  { value: "space", label: "Space movies" },
  { value: "wedding", label: "Wedding movies" },
  { value: "heist", label: "Heist movies" },
  { value: "book", label: "Based on a book" },
  { value: "racing", label: "Racing movies" },
  { value: "girl-power", label: "Girl-power movies" },
  { value: "vegas", label: "Set in Las Vegas" },
  { value: "top-250", label: "Widely considered essential viewing" },
];

function Step({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="font-display text-2xl sm:text-3xl text-white mb-1.5">{title}</h2>
      {hint && (
        <p className="text-sm mb-5" style={{ color: "var(--md-on-surface-variant)" }}>
          {hint}
        </p>
      )}
      {!hint && <div className="mb-5" />}
      <div className="grid gap-2.5 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function MatchBadge({ score, max }: { score: number; max: number }) {
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  const color =
    pct >= 80
      ? "hsl(140, 60%, 50%)"
      : pct >= 60
        ? "hsl(45, 80%, 55%)"
        : "hsl(0, 60%, 55%)";

  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full"
      style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <circle cx="5" cy="5" r="4" stroke={color} strokeWidth="1.5" />
        <circle cx="5" cy="5" r="2" fill={color} />
      </svg>
      {pct}% match
    </span>
  );
}

export default function Quiz() {
  const [stage, setStage] = useState<Stage>("splash");
  const [answers, setAnswers] = useState<QuizAnswers>(emptyAnswers);
  const [showTrailer, setShowTrailer] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [resultIndex, setResultIndex] = useState(0);
  const [expandedSynopsis, setExpandedSynopsis] = useState(false);
  const [allGenres, setAllGenres] = useState(false);
  const [sessionSeed] = useState(() => Date.now());

  // Movie pool from TMDB API
  const [moviePool, setMoviePool] = useState<Movie[]>([]);
  const [, setMovieSource] = useState<string>("loading");

  const genreCount = useMemo(() => {
    const genres = new Set<string>();
    moviePool.forEach(m => m.genres.forEach(g => genres.add(g)));
    return genres.size;
  }, [moviePool]);

  // Fetch movies from API on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const fetchPromise = fetch("/api/movies").then(res => res.json());
        const minTimerPromise = new Promise(resolve => setTimeout(resolve, 10000));
        
        const [data] = await Promise.all([fetchPromise, minTimerPromise]);

        if (!cancelled) {
          setMoviePool(data.movies ?? []);
          setMovieSource(data.source ?? "unknown");
          setStage("intro");
        }
      } catch {
        // If API fails, movies.ts fallback is already in the pool via API route
        if (!cancelled) {
          setStage("intro");
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const isDateOccasion = answers.occasion === "date" || answers.occasion === "partner";
  const genreChoices = isDateOccasion && !allGenres ? dateGenres : genreList;

  const steps = useMemo(() => {
    const base = ["mood", "occasion", "genres", "recency", "ratings-gate"];
    if (answers.ratingsMatter) base.push("ratings");
    base.push("category");
    return base;
  }, [answers.ratingsMatter]);

  // Compute recommendations using the scored engine
  const results = useMemo(
    () => recommend(answers, [], moviePool, sessionSeed),
    [answers, moviePool, sessionSeed]
  );

  const current = results[resultIndex] ?? null;
  const totalMatches = results.length;

  // Score for current movie
  const currentScore = current ? scoreMovie(current, answers) : 0;
  const currentMaxScore = maxScore(answers);

  function next() {
    if (stepIndex < steps.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      const finalResults = recommend(answers, [], moviePool, sessionSeed);
      setResultIndex(0);
      setExpandedSynopsis(false);
      setStage(finalResults.length > 0 ? "result" : "empty");
    }
  }

  function back() {
    if (stepIndex === 0) {
      setStage("intro");
    } else {
      setStepIndex(stepIndex - 1);
    }
  }

  function toggleGenre(g: string) {
    setAnswers((a) => ({
      ...a,
      genres: a.genres.includes(g) ? a.genres.filter((x) => x !== g) : [...a.genres, g],
    }));
  }

  function toggleRating(r: Rating) {
    setAnswers((a) => ({
      ...a,
      ratings: a.ratings.includes(r) ? a.ratings.filter((x) => x !== r) : [...a.ratings, r],
    }));
  }

  function restart() {
    setAnswers(emptyAnswers);
    setStepIndex(0);
    setResultIndex(0);
    setExpandedSynopsis(false);
    setStage("intro");
  }

  function nextRecommendation() {
    setShowTrailer(false);
    setExpandedSynopsis(false);
    if (resultIndex < totalMatches - 1) {
      setResultIndex(resultIndex + 1);
    } else {
      setResultIndex(0);
    }
  }

  const stepKey = steps[stepIndex];
  const canAdvance =
    (stepKey === "mood" && !!answers.mood) ||
    (stepKey === "occasion" && !!answers.occasion) ||
    stepKey === "genres" ||
    (stepKey === "recency" && !!answers.recency) ||
    (stepKey === "ratings-gate" && answers.ratingsMatter !== null) ||
    stepKey === "ratings" ||
    stepKey === "category";

  return (
    <div
      className="rounded-[var(--md-shape-xl)] p-6 sm:p-10 shadow-2xl"
      style={{ background: "var(--md-surface-container)" }}
    >
      {stage === "intro" && (
        <div className="text-center">
          <h1 className="font-display text-4xl sm:text-5xl text-white mb-4 tracking-tight animate-in slide-in-from-bottom-8 fade-in duration-700 delay-150 fill-mode-both">
            What are we watching?
          </h1>
          <p className="text-lg max-w-md mx-auto mb-10 animate-in slide-in-from-bottom-8 fade-in duration-700 delay-300 fill-mode-both" style={{ color: "var(--md-on-surface-variant)" }}>
            Answer a few quick questions and we&apos;ll find the perfect movie for your exact mood.
          </p>

          <button
            onClick={() => setStage("quiz")}
            className="relative overflow-hidden font-display uppercase tracking-wide text-base px-10 py-4 rounded-full transition-transform hover:scale-105 active:scale-95 shadow-lg animate-in zoom-in fade-in duration-700 delay-500 fill-mode-both"
            style={{ background: "var(--md-primary)", color: "var(--md-on-primary)" }}
          >
            <md-ripple></md-ripple>
            Start Quiz
          </button>

          <div className="mt-20 animate-in fade-in duration-1000 delay-700 fill-mode-both">
            <div className="grid grid-cols-3 gap-3 text-center mb-10">
              <div className="rounded-[var(--md-shape-md)] py-5" style={{ background: "var(--md-surface-container-low)" }}>
                <p className="font-display text-2xl text-white">{moviePool.length > 0 ? moviePool.length : "…"}</p>
                <p className="text-[11px] uppercase tracking-[0.15em] mt-1" style={{ color: "var(--md-on-surface-variant)" }}>Movies</p>
              </div>
              <div className="rounded-[var(--md-shape-md)] py-5" style={{ background: "var(--md-surface-container-low)" }}>
                <p className="font-display text-2xl text-white">{genreCount > 0 ? genreCount : "…"}</p>
                <p className="text-[11px] uppercase tracking-[0.15em] mt-1" style={{ color: "var(--md-on-surface-variant)" }}>Genres</p>
              </div>
              <div className="rounded-[var(--md-shape-md)] py-5" style={{ background: "var(--md-surface-container-low)" }}>
                <p className="font-display text-2xl text-white">TMDB</p>
                <p className="text-[11px] uppercase tracking-[0.15em] mt-1" style={{ color: "var(--md-on-surface-variant)" }}>Powered by</p>
              </div>
            </div>
            <footer className="border-t py-6" style={{ borderColor: "var(--md-outline-variant)" }}>
              <p className="text-center text-xs" style={{ color: "var(--md-on-surface-variant)" }}>
                Movie data provided by TMDB.
              </p>
            </footer>
          </div>
        </div>
      )}

      {stage === "quiz" && (
        <div>
          <div className="mb-7">
            <Sprocket total={steps.length} current={stepIndex} />
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={stepKey}
              initial={{ x: 30, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -30, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              {stepKey === "mood" && (
                <Step title="How are you today?">
                  {moodOptions.map((o) => (
                    <OptionCard
                      key={o.value}
                      label={o.label}
                      sublabel={o.sub}
                      selected={answers.mood === o.value}
                      onClick={() => setAnswers((a) => ({ ...a, mood: o.value }))}
                    />
                  ))}
                </Step>
              )}

              {stepKey === "occasion" && (
                <Step title="What's closest to your occasion?">
                  {occasionOptions.map((o) => (
                    <OptionCard
                      key={o.value}
                      label={o.label}
                      selected={answers.occasion === o.value}
                      onClick={() => setAnswers((a) => ({ ...a, occasion: o.value }))}
                    />
                  ))}
                </Step>
              )}

              {stepKey === "genres" && (
                <Step
                  title="Pick any genres you're into"
                  hint="Multiple answers are possible — leave it empty to consider all genres."
                >
                  {genreChoices.map((g) => (
                    <OptionCard
                      key={g}
                      label={g}
                      multi
                      selected={answers.genres.includes(g)}
                      onClick={() => toggleGenre(g)}
                    />
                  ))}
                  {isDateOccasion && (
                    <OptionCard
                      label="I'd like to choose from all genres."
                      sublabel="Not recommended for movie dates."
                      multi
                      selected={allGenres}
                      onClick={() => setAllGenres((v) => !v)}
                    />
                  )}
                </Step>
              )}

              {stepKey === "recency" && (
                <Step title="How old can the movie be?">
                  {recencyOptions.map((o) => (
                    <OptionCard
                      key={o.value}
                      label={o.label}
                      selected={answers.recency === o.value}
                      onClick={() => setAnswers((a) => ({ ...a, recency: o.value }))}
                    />
                  ))}
                </Step>
              )}

              {stepKey === "ratings-gate" && (
                <Step title="Does the age rating matter?" hint="For example, only showing R-rated films.">
                  <OptionCard
                    label="Yes, let me choose."
                    selected={answers.ratingsMatter === true}
                    onClick={() => setAnswers((a) => ({ ...a, ratingsMatter: true }))}
                  />
                  <OptionCard
                    label="No, it doesn't matter."
                    selected={answers.ratingsMatter === false}
                    onClick={() =>
                      setAnswers((a) => ({ ...a, ratingsMatter: false, ratings: [] }))
                    }
                  />
                </Step>
              )}

              {stepKey === "ratings" && (
                <Step title="Which ratings are okay?" hint="Multiple answers are possible.">
                  {ratingOptions.map((o) => (
                    <OptionCard
                      key={o.value}
                      label={`${o.label}-Rated`}
                      sublabel={o.sub}
                      multi
                      selected={answers.ratings.includes(o.value)}
                      onClick={() => toggleRating(o.value)}
                    />
                  ))}
                </Step>
              )}

              {stepKey === "category" && (
                <Step
                  title="Any other category you're after?"
                  hint="If nothing matches, this question is quietly ignored."
                >
                  {categoryOptions.map((o) => (
                    <OptionCard
                      key={o.value}
                      label={o.label}
                      selected={answers.category === o.value}
                      onClick={() => setAnswers((a) => ({ ...a, category: o.value }))}
                    />
                  ))}
                </Step>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="flex items-center justify-between mt-8">
            <button
              onClick={back}
              className="relative overflow-hidden text-sm font-medium px-5 py-2.5 rounded-full"
              style={{ color: "var(--md-on-surface-variant)" }}
            >
              <md-ripple></md-ripple>
              Back
            </button>
            <button
              onClick={next}
              disabled={!canAdvance}
              className="relative overflow-hidden font-display uppercase tracking-wide text-sm px-7 py-3 rounded-full disabled:opacity-40 disabled:pointer-events-none"
              style={{ background: "var(--md-primary)", color: "var(--md-on-primary)" }}
            >
              <md-ripple></md-ripple>
              {stepIndex === steps.length - 1 ? "Check results" : "Next"}
            </button>
          </div>
        </div>
      )}

      {stage === "calculating" && (
        <div className="flex flex-col items-center justify-center py-20 gap-6 text-center animate-in fade-in zoom-in duration-500">
          <div className="w-full max-w-xs">
            <md-linear-progress indeterminate></md-linear-progress>
          </div>
          <div>
            <h2 className="font-display text-2xl mb-2" style={{ color: "var(--md-on-surface)" }}>
              Calculating Match
            </h2>
            <p className="text-sm max-w-xs mx-auto" style={{ color: "var(--md-on-surface-variant)" }}>
              Analyzing {moviePool.length} movies against your answers...
            </p>
          </div>
        </div>
      )}

      {stage === "result" && current && (
        <>
          {current.backdropPath && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1 }}
              className="fixed inset-0 z-[-1]"
              style={{
                backgroundImage: `url(${current.backdropPath})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              <div className="absolute inset-0 bg-black/80 backdrop-blur-[8px]" />
            </motion.div>
          )}
          <div className="flex flex-col animate-in slide-in-from-bottom-8 fade-in duration-700">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <p
                className="font-display text-xs uppercase tracking-[0.3em]"
                style={{ color: "var(--md-primary)" }}
              >
                Tonight&apos;s pick
              </p>
              <div className="flex items-center gap-3">
                <MatchBadge score={currentScore} max={currentMaxScore} />
                <span
                  className="text-xs"
                  style={{ color: "var(--md-on-surface-variant)" }}
                >
                  {resultIndex + 1} of {totalMatches}
                </span>
              </div>
            </div>
            
            <div className="flex-1 pb-4 sm:pb-6 flex flex-col sm:flex-row gap-4 sm:gap-8">
              <div className="w-40 mx-auto sm:w-64 sm:mx-0 shrink-0 drop-shadow-2xl">
                <PosterCard movie={current} />
              </div>
              <div className="flex-1 flex flex-col items-center text-center sm:items-start sm:text-left">
                <div className="flex flex-wrap justify-center sm:justify-start gap-2 mb-4">
                  {current.genres.map((g) => (
                    <span
                      key={g}
                      className="text-xs px-3 py-1 rounded-full"
                      style={{
                        background: "var(--md-tertiary-container)",
                        color: "var(--md-on-tertiary-container)",
                      }}
                    >
                      {g}
                    </span>
                  ))}
                  <span
                    className="text-xs px-3 py-1 rounded-full"
                    style={{
                      background: "var(--md-surface-container-highest)",
                      color: "var(--md-on-surface-variant)",
                    }}
                  >
                    {current.rating}
                  </span>
                </div>
                <h2 className="font-display text-2xl sm:text-3xl mb-1 sm:mb-2" style={{ color: "var(--md-on-surface)" }}>
                  {current.title}{" "}
                  <span className="text-lg sm:text-xl opacity-60">({current.year})</span>
                </h2>
                <p className="text-xs sm:text-sm mb-1" style={{ color: "var(--md-on-surface-variant)" }}>
                  {current.runtime} min
                  <span className="ml-3 font-medium text-[var(--md-primary)]">
                    IMDb {current.voteAverage != null && current.voteAverage > 0 ? current.voteAverage.toFixed(1) : "N/A"}
                  </span>
                </p>
                <div className="mt-2 sm:mt-4 leading-relaxed text-left w-full" style={{ color: "var(--md-on-surface)" }}>
                  <p className={!expandedSynopsis ? "line-clamp-1 sm:line-clamp-none text-sm sm:text-base" : "text-sm sm:text-base"}>
                    {current.blurb}
                  </p>
                  <button 
                    className="text-xs font-bold uppercase tracking-wider sm:hidden mt-2" 
                    style={{ color: "var(--md-primary)" }}
                    onClick={() => setExpandedSynopsis(!expandedSynopsis)}
                  >
                    {expandedSynopsis ? "Show less" : "Read more"}
                  </button>
                </div>

                <div className="mt-5">
                  <p className="text-xs font-display uppercase tracking-[0.2em] mb-2" style={{ color: "var(--md-on-surface-variant)" }}>
                    Where to watch
                  </p>
                  {current.providers && current.providers.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {current.providers.map(p => (
                        <Image 
                          key={p.provider_id} 
                          src={`https://image.tmdb.org/t/p/original${p.logo_path}`} 
                          alt={p.provider_name}
                          title={p.provider_name}
                          width={32}
                          height={32}
                          className="w-8 h-8 rounded shadow-sm" 
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs opacity-70" style={{ color: "var(--md-on-surface)" }}>
                      Not currently streaming in your region.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-center sm:justify-start gap-2 sm:gap-3 shrink-0 pt-4 pb-6 sm:pb-0 mt-4 sm:mt-auto sticky -bottom-6 sm:static z-10 bg-[var(--md-surface-container)] sm:bg-transparent border-t border-[var(--md-outline-variant)]/20 sm:border-0 -mx-6 px-6 sm:mx-0 sm:px-0 rounded-b-[var(--md-shape-xl)] sm:rounded-none">
                  <button
                    onClick={nextRecommendation}
                    className="relative overflow-hidden font-display uppercase tracking-wide text-sm px-6 py-3 rounded-full"
                    style={{ background: "var(--md-primary)", color: "var(--md-on-primary)" }}
                  >
                    <md-ripple></md-ripple>
                    Get another
                  </button>
                  {current.trailerKey && (
                    <button
                      onClick={() => setShowTrailer(true)}
                      className="relative overflow-hidden font-display uppercase tracking-wide text-sm px-6 py-3 rounded-full"
                      style={{ background: "var(--md-secondary)", color: "var(--md-on-secondary)" }}
                    >
                      <md-ripple></md-ripple>
                      Watch Trailer
                    </button>
                  )}
                  <button
                    onClick={restart}
                    className="relative overflow-hidden text-sm font-medium px-6 py-3 rounded-full border"
                    style={{ borderColor: "var(--md-outline-variant)", color: "var(--md-on-surface)" }}
                  >
                    <md-ripple></md-ripple>
                    Retake quiz
                  </button>
                </div>
              </div>
            </>
          )}

      {stage === "empty" && (
        <div className="text-center py-20">
          <h2 className="font-display text-3xl mb-4 text-white">No exact matches</h2>
          <p className="text-[var(--md-on-surface-variant)] mb-8">
            Try broadening your answers or selecting different genres.
          </p>
          <button
            onClick={restart}
            className="relative overflow-hidden font-display uppercase tracking-wide text-sm px-7 py-3 rounded-full"
            style={{ background: "var(--md-primary)", color: "var(--md-on-primary)" }}
          >
            <md-ripple></md-ripple>
            Retake quiz
          </button>
        </div>
      )}

      {showTrailer && current?.trailerKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="relative w-full max-w-5xl aspect-video bg-black rounded-[var(--md-shape-xl)] overflow-hidden shadow-2xl ring-1 ring-white/10">
            <div className="absolute top-4 right-4 z-10 bg-black/40 hover:bg-black/80 rounded-full backdrop-blur-md transition-colors text-white">
              <md-icon-button onClick={() => setShowTrailer(false)}>
                <md-icon>close</md-icon>
              </md-icon-button>
            </div>
            <iframe
              src={`https://www.youtube.com/embed/${current.trailerKey}?autoplay=1`}
              title="Trailer"
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}

      <AnimatePresence>
        {stage === "splash" && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.8 } }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--md-surface)]"
          >
            <motion.div 
              animate={{ scale: [1, 1.05, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
              className="mb-12 relative w-32 h-32"
            >
              <div className="absolute inset-0 rounded-full border-4 border-[var(--md-primary)] opacity-20" />
              <div className="absolute inset-2 rounded-full border-4 border-[var(--md-primary)] border-t-transparent animate-spin duration-1000" />
              <div className="absolute inset-6 rounded-full border-4 border-[var(--md-secondary)] border-b-transparent animate-spin" style={{ animationDirection: 'reverse', animationDuration: '2s' }} />
            </motion.div>
            
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="font-display text-4xl mb-4 tracking-widest uppercase"
              style={{ color: "var(--md-primary)" }}
            >
              Moodflix
            </motion.h1>
            
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              className="h-1 w-56 bg-[var(--md-surface-variant)] rounded-full overflow-hidden"
            >
              <motion.div 
                className="h-full bg-[var(--md-primary)]"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 10, ease: "linear" }}
              />
            </motion.div>
            
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5 }}
              className="mt-6 text-xs uppercase tracking-[0.3em]"
              style={{ color: "var(--md-on-surface-variant)" }}
            >
              Curating Cinematic Experience...
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
