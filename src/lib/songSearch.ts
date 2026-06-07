import type { SongSearchResponse } from "../types/song";

function getSongSearchEndpoint() {
  const configuredBase = import.meta.env.VITE_SONG_SEARCH_API_BASE?.trim();

  if (configuredBase) {
    return configuredBase;
  }

  return "/api/search";
}

export async function searchSong(query: string) {
  const endpoint = getSongSearchEndpoint();
  const url = new URL(endpoint, window.location.href);
  url.searchParams.set("q", query);

  const response = await fetch(url);
  const data = (await response.json()) as SongSearchResponse;

  if (!response.ok) {
    return {
      success: false as const,
      error: data.error ?? "Could not search songs.",
    };
  }

  return data;
}
