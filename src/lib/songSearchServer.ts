type SongSearchEnv = {
  SPOTIFY_CLIENT_ID?: string;
  SPOTIFY_CLIENT_SECRET?: string;
};

type SpotifyTrack = {
  name: string;
  preview_url: string | null;
  duration_ms: number;
  external_urls: {
    spotify: string;
  };
  artists: Array<{
    name: string;
  }>;
  album: {
    name: string;
    release_date: string;
    images: Array<{
      url: string;
    }>;
  };
};

type SpotifySearchResponse = {
  tracks?: {
    items?: SpotifyTrack[];
  };
};

type SpotifyPreviewFinderResult = {
  success: boolean;
  results: Array<{
    previewUrls?: string[];
  }>;
};

type SpotifyPreviewFinder = (
  songName: string,
  artistOrLimit?: string | number,
  limit?: number,
) => Promise<SpotifyPreviewFinderResult>;

export type SongSearchSuccessResponse = {
  success: true;
  song: {
    title: string;
    artist: string;
    album: string;
    albumCover: string | null;
    releaseDate: string;
    durationMs: number;
    spotifyUrl: string;
    previewUrl: string | null;
  };
};

export type SongSearchErrorResponse = {
  success: false;
  error: string;
};

export type SongSearchResponse =
  | SongSearchSuccessResponse
  | SongSearchErrorResponse;

async function getSpotifyAccessToken(clientId: string, clientSecret: string) {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) {
    throw new Error(`Spotify token request failed with ${response.status}`);
  }

  const data = (await response.json()) as { access_token?: string };

  if (!data.access_token) {
    throw new Error("Spotify token response did not include an access token.");
  }

  return data.access_token;
}

function setSpotifyEnv(clientId: string, clientSecret: string) {
  const nodeProcess = (
    globalThis as unknown as {
      process?: { env: Record<string, string | undefined> };
    }
  ).process;

  if (!nodeProcess) {
    return;
  }

  nodeProcess.env.SPOTIFY_CLIENT_ID = clientId;
  nodeProcess.env.SPOTIFY_CLIENT_SECRET = clientSecret;
}

async function findFallbackPreviewUrl(
  title: string,
  artist: string,
  clientId: string,
  clientSecret: string,
) {
  try {
    setSpotifyEnv(clientId, clientSecret);

    const previewFinderModule = await import("spotify-preview-finder");
    const previewFinder = (previewFinderModule.default ??
      previewFinderModule) as unknown as SpotifyPreviewFinder;
    const previewResult = await previewFinder(title, artist, 1);

    return previewResult.success
      ? (previewResult.results[0]?.previewUrls?.[0] ?? null)
      : null;
  } catch (error) {
    console.warn(
      error instanceof Error
        ? `Spotify preview fallback failed: ${error.message}`
        : "Spotify preview fallback failed.",
    );
    return null;
  }
}

async function searchSpotifyTrack(
  query: string,
  env: SongSearchEnv,
): Promise<{ statusCode: number; body: SongSearchResponse }> {
  const clientId = env.SPOTIFY_CLIENT_ID;
  const clientSecret = env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return {
      statusCode: 500,
      body: {
        success: false,
        error:
          "SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set in the server environment.",
      },
    };
  }

  const cleanQuery = query.trim();

  if (!cleanQuery) {
    return {
      statusCode: 400,
      body: { success: false, error: "Query required." },
    };
  }

  try {
    const accessToken = await getSpotifyAccessToken(clientId, clientSecret);
    const searchUrl = new URL("https://api.spotify.com/v1/search");
    searchUrl.searchParams.set("q", cleanQuery);
    searchUrl.searchParams.set("type", "track");
    searchUrl.searchParams.set("limit", "1");

    const searchResponse = await fetch(searchUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!searchResponse.ok) {
      throw new Error(`Spotify search failed with ${searchResponse.status}`);
    }

    const data = (await searchResponse.json()) as SpotifySearchResponse;
    const track = data.tracks?.items?.[0];

    if (!track) {
      return {
        statusCode: 404,
        body: {
          success: false,
          error: "No songs found matching your search.",
        },
      };
    }

    const artist = track.artists.map((candidate) => candidate.name).join(", ");
    const previewUrl =
      track.preview_url ??
      (await findFallbackPreviewUrl(
        track.name,
        artist,
        clientId,
        clientSecret,
      ));

    return {
      statusCode: 200,
      body: {
        success: true,
        song: {
          title: track.name,
          artist,
          album: track.album.name,
          albumCover: track.album.images[0]?.url ?? null,
          releaseDate: track.album.release_date,
          durationMs: track.duration_ms,
          spotifyUrl: track.external_urls.spotify,
          previewUrl,
        },
      },
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: {
        success: false,
        error:
          error instanceof Error ? error.message : "Could not search songs.",
      },
    };
  }
}

export async function handleSongSearchQuery(query: string, env: SongSearchEnv) {
  return searchSpotifyTrack(query, env);
}
