import { Rating, Category } from "@/lib/types";

export const genreIcons: Record<string, string> = {
  Action: "sports_martial_arts",
  Adventure: "explore",
  Animation: "animation",
  Comedy: "sentiment_satisfied",
  Crime: "local_police",
  Documentary: "movie",
  Drama: "theater_comedy",
  Family: "family_restroom",
  Fantasy: "auto_awesome",
  History: "history_edu",
  Horror: "sentiment_very_dissatisfied",
  Music: "music_note",
  Mystery: "search",
  Romance: "favorite",
  "Science Fiction": "rocket_launch",
  Thriller: "warning",
  War: "military_tech",
  Western: "explore"
};

export const moodOptions = [
  { value: "happy", label: "Happy", sub: "In the mood for something upbeat" },
  { value: "neutral", label: "Neutral", sub: "Open to anything" },
  { value: "sad", label: "Sad", sub: "Could use something that meets me there" },
] as const;

export const occasionOptions = [
  { value: "solo", label: "Just watching a movie by myself." },
  { value: "date", label: "Movie date." },
  { value: "friends", label: "Movie night with friends." },
  { value: "partner", label: "Date night with a partner." },
  { value: "family", label: "Watching with family or relatives." },
] as const;

export const recencyOptions = [
  { value: "any", label: "Doesn't matter." },
  { value: "5", label: "Published in the last 5 years." },
  { value: "10", label: "Published in the last 10 years." },
  { value: "25", label: "Published in the last 25 years." },
] as const;

export const ratingOptions: { value: Rating; label: string; sub: string }[] = [
  { value: "G", label: "G", sub: "All ages admitted." },
  { value: "PG", label: "PG", sub: "Some material may not suit children." },
  { value: "PG-13", label: "PG-13", sub: "Some material inappropriate under 13." },
  { value: "R", label: "R", sub: "Under 17 needs an accompanying adult." },
];

export const categoryOptions: { value: Category | "none"; label: string }[] = [
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
