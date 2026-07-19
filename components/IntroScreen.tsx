"use client";

import Link from "next/link";

interface IntroScreenProps {
  movieCount: number;
  genreCount: number;
  onStartQuiz: () => void;
}

export default function IntroScreen({ movieCount, genreCount, onStartQuiz }: IntroScreenProps) {
  return (
    <div className="text-center pt-8 sm:pt-0">
      <h1 className="font-display text-4xl sm:text-5xl mb-4 tracking-tight animate-in slide-in-from-bottom-8 fade-in duration-700 delay-150 fill-mode-both" style={{ color: "var(--md-on-surface)" }}>
        What are we watching?
      </h1>
      <p className="text-lg max-w-md mx-auto mb-10 animate-in slide-in-from-bottom-8 fade-in duration-700 delay-300 fill-mode-both" style={{ color: "var(--md-on-surface-variant)" }}>
        Answer a few quick questions and we&apos;ll find the perfect movie for your exact mood.
      </p>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 animate-in zoom-in fade-in duration-700 delay-500 fill-mode-both">
        <button
          onClick={onStartQuiz}
          className="relative overflow-hidden font-display uppercase tracking-wide text-base px-10 py-4 rounded-full transition-transform hover:scale-105 active:scale-95 shadow-lg"
          style={{ background: "var(--md-primary)", color: "var(--md-on-primary)" }}
        >
          <md-ripple></md-ripple>
          Start Quiz
        </button>

        <Link
          href="/search"
          className="relative overflow-hidden font-display uppercase tracking-wide text-base px-10 py-4 rounded-full transition-transform hover:scale-105 active:scale-95 border-2"
          style={{ borderColor: "var(--md-primary)", color: "var(--md-primary)" }}
        >
          <md-ripple></md-ripple>
          Search a Movie
        </Link>
      </div>

      <div className="mt-12 sm:mt-20 animate-in fade-in duration-1000 delay-700 fill-mode-both">
        <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center mb-8 sm:mb-10">
          <div className="rounded-[var(--md-shape-md)] py-5" style={{ background: "var(--md-surface-container-low)" }}>
            <p className="font-display text-2xl" style={{ color: "var(--md-on-surface)" }}>{movieCount > 0 ? movieCount : "…"}</p>
            <p className="text-[11px] uppercase tracking-[0.15em] mt-1" style={{ color: "var(--md-on-surface-variant)" }}>Movies</p>
          </div>
          <div className="rounded-[var(--md-shape-md)] py-5" style={{ background: "var(--md-surface-container-low)" }}>
            <p className="font-display text-2xl" style={{ color: "var(--md-on-surface)" }}>{genreCount > 0 ? genreCount : "…"}</p>
            <p className="text-[11px] uppercase tracking-[0.15em] mt-1" style={{ color: "var(--md-on-surface-variant)" }}>Genres</p>
          </div>
          <div className="rounded-[var(--md-shape-md)] py-5" style={{ background: "var(--md-surface-container-low)" }}>
            <p className="font-display text-2xl" style={{ color: "var(--md-on-surface)" }}>TMDB</p>
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
  );
}
