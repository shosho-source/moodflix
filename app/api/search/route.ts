import { searchTMDBMovies } from "@/lib/tmdb";
import type { NextRequest } from "next/server";

// Search queries are user-driven and cannot be statically cached
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q");

  if (!query || query.trim().length === 0) {
    return Response.json({ results: [] });
  }

  try {
    const results = await searchTMDBMovies(query);
    return Response.json({ results });
  } catch (error) {
    console.error("TMDB search failed:", error);
    return Response.json({ results: [], error: "Search failed" }, { status: 500 });
  }
}
