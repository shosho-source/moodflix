"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Movie, QuizAnswers, emptyAnswers } from "@/lib/types";
import { recommend, scoreMovie, maxScore } from "@/lib/recommend";
import { genreList, dateGenres } from "@/lib/movies";
import SplashScreen from "./SplashScreen";
import IntroScreen from "./IntroScreen";
import QuizSteps from "./QuizSteps";
import MovieResult from "./MovieResult";

type Stage = "intro" | "quiz" | "result" | "empty" | "loading" | "splash";

export default function Quiz() {
  const [stage, setStage] = useState<Stage>("splash");
  const [answers, setAnswers] = useState<QuizAnswers>(emptyAnswers);
  const [stepIndex, setStepIndex] = useState(0);
  const [resultIndex, setResultIndex] = useState(0);
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
        const minTimerPromise = new Promise(resolve => setTimeout(resolve, 2500));
        
        const [data] = await Promise.all([fetchPromise, minTimerPromise]);

        if (!cancelled) {
          setMoviePool(data.movies ?? []);
          setMovieSource(data.source ?? "unknown");
          setStage("intro");
        }
      } catch {
        // If API is unreachable, import the bundled fallback directly
        if (!cancelled) {
          try {
            const { movies: fallback } = await import("@/lib/movies");
            setMoviePool(fallback);
          } catch {
            // Even the fallback import failed — leave pool empty
          }
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

  const stepKey = steps[stepIndex];
  const canAdvance =
    (stepKey === "mood" && !!answers.mood) ||
    (stepKey === "occasion" && !!answers.occasion) ||
    stepKey === "genres" ||
    (stepKey === "recency" && !!answers.recency) ||
    (stepKey === "ratings-gate" && answers.ratingsMatter !== null) ||
    stepKey === "ratings" ||
    stepKey === "category";

  function next() {
    if (stepIndex < steps.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      const finalResults = recommend(answers, [], moviePool, sessionSeed);
      setResultIndex(0);
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

  function restart() {
    setAnswers(emptyAnswers);
    setStepIndex(0);
    setResultIndex(0);
    setStage("intro");
  }

  function nextRecommendation() {
    if (resultIndex < totalMatches - 1) {
      setResultIndex(resultIndex + 1);
    } else {
      setResultIndex(0);
    }
  }

  return (
    <div
      className="rounded-[var(--md-shape-xl)] p-6 sm:p-10 shadow-2xl"
      style={{ background: "var(--md-surface-container)" }}
    >
      {stage === "intro" && (
        <IntroScreen
          movieCount={moviePool.length}
          genreCount={genreCount}
          onStartQuiz={() => setStage("quiz")}
        />
      )}

      {stage === "quiz" && (
        <QuizSteps
          steps={steps}
          stepIndex={stepIndex}
          stepKey={stepKey}
          answers={answers}
          onUpdateAnswers={(updater) => setAnswers(updater)}
          onNext={next}
          onBack={back}
          canAdvance={canAdvance}
          genreChoices={genreChoices}
          isDateOccasion={isDateOccasion}
          allGenres={allGenres}
          onToggleAllGenres={() => setAllGenres((v) => !v)}
        />
      )}

      {stage === "result" && current && (
        <MovieResult
          movie={current}
          score={currentScore}
          maxScore={currentMaxScore}
          resultIndex={resultIndex}
          totalMatches={totalMatches}
          onNext={nextRecommendation}
          onRestart={restart}
        />
      )}

      {stage === "empty" && (
        <div className="text-center py-20">
          <h2 className="font-display text-3xl mb-4" style={{ color: "var(--md-on-surface)" }}>No exact matches</h2>
          <p className="mb-8" style={{ color: "var(--md-on-surface-variant)" }}>
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

      <AnimatePresence>
        {stage === "splash" && <SplashScreen visible={true} />}
      </AnimatePresence>
    </div>
  );
}
