"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Movie } from "@/lib/types";
import PosterCard from "./PosterCard";
import TrailerModal from "./TrailerModal";
import { genreIcons } from "./QuizConstants";

interface MovieResultProps {
  movie: Movie;
  /** Match score (0-N). Omit to hide the match badge. */
  score?: number;
  /** Max possible score. */
  maxScore?: number;
  /** 0-indexed position in the result set. */
  resultIndex?: number;
  /** Total number of matches. */
  totalMatches?: number;
  /** Called when user wants the next recommendation. */
  onNext?: () => void;
  /** Called when user wants to restart the quiz. */
  onRestart?: () => void;
  /** Label for the restart button (defaults to "Retake Quiz"). */
  restartLabel?: string;
  /** Label for the next button (defaults to "Next"). */
  nextLabel?: string;
  /** Whether to show the result header ("Tonight's pick"). Set false for search results. */
  showHeader?: boolean;
}

function MatchBadge({ score, max }: { score: number; max: number }) {
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap"
      style={{ background: "var(--md-primary-container)", color: "var(--md-on-primary-container)" }}
    >
      <span className="material-symbols-outlined text-[14px]">check_circle</span>
      {pct}% match
    </span>
  );
}

export default function MovieResult({
  movie,
  score,
  maxScore,
  resultIndex,
  totalMatches,
  onNext,
  onRestart,
  restartLabel = "Retake Quiz",
  nextLabel,
  showHeader = true,
}: MovieResultProps) {
  const [showTrailer, setShowTrailer] = useState(false);
  const [expandedSynopsis, setExpandedSynopsis] = useState(false);

  const hasMatchBadge = score !== undefined && maxScore !== undefined;
  const hasNavigation = resultIndex !== undefined && totalMatches !== undefined;

  return (
    <>
      {movie.backdropPath && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
          className="fixed inset-0 z-[-1]"
          style={{
            backgroundImage: `url(${movie.backdropPath})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="absolute inset-0 bg-black/80 backdrop-blur-[8px]" />
        </motion.div>
      )}
      <div className="flex flex-col animate-in slide-in-from-bottom-8 fade-in duration-700">
        {showHeader && (
          <div className="flex items-center justify-between mb-4 sm:mb-6 shrink-0 w-full">
            <div className="flex items-center gap-2 font-display text-xs sm:text-sm uppercase tracking-wider font-bold" style={{ color: "var(--md-primary)" }}>
              <div className="flex items-center justify-center w-6 h-6 rounded-full" style={{ background: "var(--md-primary-container)" }}>
                <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
              </div>
              <span>Tonight&apos;s pick</span>
            </div>
            <div className="flex items-center gap-3 sm:gap-4">
              {hasMatchBadge && <MatchBadge score={score} max={maxScore} />}
              {hasNavigation && (
                <span
                  className="text-xs sm:text-sm whitespace-nowrap"
                  style={{ color: "var(--md-on-surface-variant)" }}
                >
                  {resultIndex + 1} of {totalMatches}
                </span>
              )}
            </div>
          </div>
        )}
        
        <div className="flex-1 pb-4 sm:pb-6 flex flex-col items-center sm:flex-row gap-4 sm:gap-8 w-full">
          <div className="w-56 mx-auto sm:w-64 sm:mx-0 shrink-0 drop-shadow-lg">
            <PosterCard movie={movie} />
          </div>
          <div className="flex-1 flex flex-col items-center text-center sm:items-start sm:text-left w-full mt-2 sm:mt-0">
            <div className="flex flex-wrap justify-center sm:justify-start gap-2 mb-4">
              {movie.genres.map((g) => (
                <span
                  key={g}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
                  style={{
                    background: "var(--md-primary-container)",
                    color: "var(--md-on-primary-container)",
                  }}
                >
                  <span className="material-symbols-outlined text-[14px]">{genreIcons[g] || "movie"}</span>
                  {g}
                </span>
              ))}
              <span
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
                style={{
                  background: "var(--md-primary-container)",
                  color: "var(--md-on-primary-container)",
                }}
              >
                <span className="material-symbols-outlined text-[14px]">radio_button_checked</span>
                {movie.rating}
              </span>
            </div>
            <h2 className="font-display text-2xl sm:text-3xl mb-1 sm:mb-2 font-bold" style={{ color: "var(--md-on-surface)" }}>
              {movie.title}{" "}
              <span className="text-lg sm:text-xl font-normal" style={{ color: "var(--md-outline)" }}>({movie.year})</span>
            </h2>
            <p className="flex items-center justify-center sm:justify-start gap-3 text-xs sm:text-sm mb-1 font-medium" style={{ color: "var(--md-on-surface-variant)" }}>
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">schedule</span>
                {movie.runtime} min
              </span>
              <span className="w-1 h-1 rounded-full" style={{ background: "var(--md-outline)" }}></span>
              <span className="flex items-center gap-1" style={{ color: "var(--md-primary)" }}>
                <span className="material-symbols-outlined text-[16px]">star</span>
                IMDb {movie.voteAverage != null && movie.voteAverage > 0 ? movie.voteAverage.toFixed(1) : "N/A"}
              </span>
            </p>
            <div className="mt-2 sm:mt-4 leading-relaxed text-left w-full sm:text-left text-center" style={{ color: "var(--md-on-surface)" }}>
              <p className={!expandedSynopsis ? "line-clamp-1 sm:line-clamp-none text-sm sm:text-base font-medium" : "text-sm sm:text-base font-medium"}>
                {movie.blurb}
              </p>
              <button 
                className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider sm:hidden mt-2" 
                style={{ color: "var(--md-primary)" }}
                onClick={() => setExpandedSynopsis(!expandedSynopsis)}
              >
                {expandedSynopsis ? "Show less" : "Read more"}
                <span className="material-symbols-outlined text-[14px]">{expandedSynopsis ? "expand_less" : "chevron_right"}</span>
              </button>
            </div>

            <div className="mt-5 w-full bg-[var(--md-primary-container)] p-4 rounded-[16px] text-left">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] mb-3" style={{ color: "var(--md-on-primary-container)" }}>
                <span className="material-symbols-outlined text-[14px]">live_tv</span>
                Where to watch
              </p>
              {movie.providers && movie.providers.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {movie.providers.map(p => (
                    <Image 
                      key={p.provider_id} 
                      src={`https://image.tmdb.org/t/p/original${p.logo_path}`} 
                      alt={p.provider_name}
                      title={p.provider_name}
                      width={32}
                      height={32}
                      className="w-8 h-8 rounded-lg shadow-sm bg-white" 
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs font-medium" style={{ color: "var(--md-on-primary-container)" }}>
                  Not currently streaming in your region.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-row sm:justify-start gap-2 sm:gap-3 shrink-0 pt-4 pb-6 sm:pb-0 mt-4 sm:mt-auto sticky -bottom-6 sm:static z-10 bg-[var(--md-surface-container)] sm:bg-transparent -mx-6 px-6 sm:mx-0 sm:px-0 rounded-b-[var(--md-shape-xl)] sm:rounded-none">
          {movie.trailerKey && (
            <button
              onClick={() => setShowTrailer(true)}
              className="relative flex items-center justify-center gap-1.5 overflow-hidden font-display uppercase font-bold tracking-wide text-xs sm:text-sm py-3.5 sm:py-3 sm:px-6 rounded-full sm:flex-none"
              style={{ background: "var(--md-primary-container)", color: "var(--md-on-primary-container)" }}
            >
              <md-ripple></md-ripple>
              <span className="material-symbols-outlined text-[16px] filled">play_arrow</span>
              Trailer
            </button>
          )}
          {onRestart && (
            <button
              onClick={onRestart}
              className={`relative flex items-center justify-center gap-1.5 overflow-hidden font-display uppercase font-bold tracking-wide text-xs sm:text-sm py-3.5 sm:py-3 sm:px-6 rounded-full border border-[var(--md-primary)] sm:flex-none ${!movie.trailerKey ? 'col-span-2' : ''}`}
              style={{ color: "var(--md-primary)", background: "transparent" }}
            >
              <md-ripple></md-ripple>
              <span className="material-symbols-outlined text-[16px]">restart_alt</span>
              {restartLabel}
            </button>
          )}
          {onNext && (
            <button
              onClick={() => {
                setShowTrailer(false);
                setExpandedSynopsis(false);
                onNext();
              }}
              className="col-span-2 sm:col-auto relative flex items-center justify-center gap-1.5 overflow-hidden font-display uppercase font-bold tracking-wide text-sm sm:text-base py-4 sm:py-3 sm:px-8 rounded-full sm:flex-none"
              style={{ background: "var(--md-primary)", color: "var(--md-on-primary)" }}
            >
              <md-ripple></md-ripple>
              <span className="material-symbols-outlined text-[18px] sm:text-[16px]">arrow_forward</span>
              <span className="sm:hidden">{nextLabel || "Next Suggestion"}</span>
              <span className="hidden sm:inline">{nextLabel || "Next"}</span>
            </button>
          )}
        </div>
      </div>

      {showTrailer && movie.trailerKey && (
        <TrailerModal trailerKey={movie.trailerKey} onClose={() => setShowTrailer(false)} />
      )}
    </>
  );
}
