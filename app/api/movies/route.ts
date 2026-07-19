import { fetchTMDBMovies } from "@/lib/tmdb";
import { movies as fallbackMovies } from "@/lib/movies";

// ISR: revalidate every hour instead of force-dynamic on every request.
// This caches the TMDB response and revalidates in the background,
// saving rate limits and improving initial load speed.
export const revalidate = 3600;

export async function GET() {
  try {
    const movies = await fetchTMDBMovies();

    if (movies.length === 0) {
      // If TMDB returns nothing, use fallback
      return Response.json({ movies: fallbackMovies, source: "fallback" });
    }

    return Response.json({ movies, source: "tmdb" });
  } catch (error) {
    console.error("TMDB fetch failed, using fallback:", error);
    return Response.json({ movies: fallbackMovies, source: "fallback" });
  }
}
