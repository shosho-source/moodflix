"use client";

import { motion, AnimatePresence } from "framer-motion";
import { QuizAnswers, Rating } from "@/lib/types";
import OptionCard from "./OptionCard";
import Sprocket from "./Sprocket";
import {
  moodOptions,
  occasionOptions,
  recencyOptions,
  ratingOptions,
  categoryOptions,
} from "./QuizConstants";

interface QuizStepsProps {
  steps: string[];
  stepIndex: number;
  stepKey: string;
  answers: QuizAnswers;
  onUpdateAnswers: (updater: (a: QuizAnswers) => QuizAnswers) => void;
  onNext: () => void;
  onBack: () => void;
  canAdvance: boolean;
  genreChoices: string[];
  isDateOccasion: boolean;
  allGenres: boolean;
  onToggleAllGenres: () => void;
}

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
      <h2 className="font-display text-2xl sm:text-3xl mb-1.5" style={{ color: "var(--md-on-surface)" }}>{title}</h2>
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

export default function QuizSteps({
  steps,
  stepIndex,
  stepKey,
  answers,
  onUpdateAnswers,
  onNext,
  onBack,
  canAdvance,
  genreChoices,
  isDateOccasion,
  allGenres,
  onToggleAllGenres,
}: QuizStepsProps) {
  function toggleGenre(g: string) {
    onUpdateAnswers((a) => ({
      ...a,
      genres: a.genres.includes(g) ? a.genres.filter((x) => x !== g) : [...a.genres, g],
    }));
  }

  function toggleRating(r: Rating) {
    onUpdateAnswers((a) => ({
      ...a,
      ratings: a.ratings.includes(r) ? a.ratings.filter((x) => x !== r) : [...a.ratings, r],
    }));
  }

  return (
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
                  onClick={() => onUpdateAnswers((a) => ({ ...a, mood: o.value }))}
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
                  onClick={() => onUpdateAnswers((a) => ({ ...a, occasion: o.value }))}
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
                  onClick={onToggleAllGenres}
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
                  onClick={() => onUpdateAnswers((a) => ({ ...a, recency: o.value }))}
                />
              ))}
            </Step>
          )}

          {stepKey === "ratings-gate" && (
            <Step title="Does the age rating matter?" hint="For example, only showing R-rated films.">
              <OptionCard
                label="Yes, let me choose."
                selected={answers.ratingsMatter === true}
                onClick={() => onUpdateAnswers((a) => ({ ...a, ratingsMatter: true }))}
              />
              <OptionCard
                label="No, it doesn't matter."
                selected={answers.ratingsMatter === false}
                onClick={() =>
                  onUpdateAnswers((a) => ({ ...a, ratingsMatter: false, ratings: [] }))
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
                  onClick={() => onUpdateAnswers((a) => ({ ...a, category: o.value }))}
                />
              ))}
            </Step>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-between mt-8">
        <button
          onClick={onBack}
          className="relative overflow-hidden text-sm font-medium px-5 py-2.5 rounded-full"
          style={{ color: "var(--md-on-surface-variant)" }}
        >
          <md-ripple></md-ripple>
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!canAdvance}
          className="relative overflow-hidden font-display uppercase tracking-wide text-sm px-7 py-3 rounded-full disabled:opacity-40 disabled:pointer-events-none"
          style={{ background: "var(--md-primary)", color: "var(--md-on-primary)" }}
        >
          <md-ripple></md-ripple>
          {stepIndex === steps.length - 1 ? "Check results" : "Next"}
        </button>
      </div>
    </div>
  );
}
