declare const process: {
  env: Record<string, string | undefined>;
};

type ApiRequest = {
  method?: string;
  url?: string;
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
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

function sendJson(res: ApiResponse, statusCode: number, body: unknown) {
  res.status(statusCode).json(body);
}

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
  process.env.SPOTIFY_CLIENT_ID = clientId;
  process.env.SPOTIFY_CLIENT_SECRET = clientSecret;
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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") {
    sendJson(res, 405, { success: false, error: "Method not allowed." });
    return;
  }

  const url = new URL(req.url ?? "/api/search", "http://localhost");
  const query = url.searchParams.get("q")?.trim() ?? "";

  if (!query) {
    sendJson(res, 400, { success: false, error: "Query required." });
    return;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    sendJson(res, 500, {
      success: false,
      error:
        "SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set in Vercel Environment Variables.",
    });
    return;
  }

  try {
    const accessToken = await getSpotifyAccessToken(clientId, clientSecret);
    const searchUrl = new URL("https://api.spotify.com/v1/search");
    searchUrl.searchParams.set("q", query);
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
      sendJson(res, 404, {
        success: false,
        error: "No songs found matching your search.",
      });
      return;
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

    sendJson(res, 200, {
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
    });
  } catch (error) {
    sendJson(res, 500, {
      success: false,
      error:
        error instanceof Error ? error.message : "Could not search songs.",
    });
  }
}
