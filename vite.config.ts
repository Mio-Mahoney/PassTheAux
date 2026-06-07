import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

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
  limit?: number
) => Promise<SpotifyPreviewFinderResult>;

function sendJson(res: { setHeader: (key: string, value: string) => void; statusCode: number; end: (body: string) => void }, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function getSpotifyAccessToken(clientId: string, clientSecret: string) {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
    }),
  });

  if (!response.ok) {
    throw new Error(`Spotify token request failed with ${response.status}`);
  }

  const data = (await response.json()) as { access_token?: string };

  if (!data.access_token) {
    throw new Error('Spotify token response did not include an access token.');
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
  clientSecret: string
) {
  try {
    setSpotifyEnv(clientId, clientSecret);

    const previewFinderModule = await import('spotify-preview-finder');
    const previewFinder = (
      previewFinderModule.default ?? previewFinderModule
    ) as unknown as SpotifyPreviewFinder;
    const previewResult = await previewFinder(title, artist, 1);

    return previewResult.success
      ? previewResult.results[0]?.previewUrls?.[0] ?? null
      : null;
  } catch (error) {
    console.warn(
      error instanceof Error
        ? `Spotify preview fallback failed: ${error.message}`
        : 'Spotify preview fallback failed.'
    );
    return null;
  }
}

function spotifySearchPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'passtheaux-spotify-search',
    configureServer(server) {
      server.middlewares.use('/api/search', async (req, res) => {
        const request = req as unknown as { method?: string; url?: string };

        if (request.method !== 'GET') {
          sendJson(res, 405, { success: false, error: 'Method not allowed.' });
          return;
        }

        const clientId = env.SPOTIFY_CLIENT_ID;
        const clientSecret = env.SPOTIFY_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
          sendJson(res, 500, {
            success: false,
            error:
              'SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are required in .env.local.',
          });
          return;
        }

        const url = new URL(request.url ?? '', 'http://localhost');
        const q = url.searchParams.get('q')?.trim();

        if (!q) {
          sendJson(res, 400, { success: false, error: 'Query required.' });
          return;
        }

        try {
          const accessToken = await getSpotifyAccessToken(
            clientId,
            clientSecret
          );
          const searchUrl = new URL('https://api.spotify.com/v1/search');
          searchUrl.searchParams.set('q', q);
          searchUrl.searchParams.set('type', 'track');
          searchUrl.searchParams.set('limit', '1');

          const searchResponse = await fetch(searchUrl, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });

          if (!searchResponse.ok) {
            throw new Error(
              `Spotify search failed with ${searchResponse.status}`
            );
          }

          const data = (await searchResponse.json()) as SpotifySearchResponse;
          const track = data.tracks?.items?.[0];

          if (!track) {
            sendJson(res, 404, {
              success: false,
              error: 'No songs found matching your search.',
            });
            return;
          }

          const artist = track.artists.map(candidate => candidate.name).join(', ');
          const previewUrl =
            track.preview_url ??
            (await findFallbackPreviewUrl(
              track.name,
              artist,
              clientId,
              clientSecret
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
              error instanceof Error ? error.message : 'Could not search songs.',
          });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    plugins: [react(), spotifySearchPlugin(env)],
  };
});
