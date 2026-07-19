import type { Metadata } from "next";
import SearchScreen from "@/components/SearchScreen";
import ErrorBoundary from "@/components/ErrorBoundary";

export const metadata: Metadata = {
  title: "Search Movies — MoodFlix",
  description:
    "Search for any movie and discover similar films. Find your next watch with MoodFlix.",
};

export default function SearchPage() {
  return (
    <ErrorBoundary>
      <SearchScreen />
    </ErrorBoundary>
  );
}
