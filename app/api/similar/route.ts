import { fetchSimilarMovies } from "@/lib/tmdb";
import type { NextRequest } from "next/server";

// Similar movie lookups depend on user-selected movie IDs
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const idParam = request.nextUrl.searchParams.get("id");

  if (!idParam) {
    return Response.json({ results: [] });
  }

  const tmdbId = parseInt(idParam, 10);
  if (isNaN(tmdbId)) {
    return Response.json({ results: [], error: "Invalid movie ID" }, { status: 400 });
  }

  try {
    const results = await fetchSimilarMovies(tmdbId);
    return Response.json({ results });
  } catch (error) {
    console.error("TMDB similar fetch failed:", error);
    return Response.json({ results: [], error: "Failed to fetch similar movies" }, { status: 500 });
  }
}
