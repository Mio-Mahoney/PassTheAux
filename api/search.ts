import { handleSongSearchQuery } from "../src/lib/songSearchServer.ts";

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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ success: false, error: "Method not allowed." });
    return;
  }

  const url = new URL(req.url ?? "/api/search", "http://localhost");
  const query = url.searchParams.get("q")?.trim() ?? "";

  if (!query) {
    res.status(400).json({ success: false, error: "Query required." });
    return;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    res.status(500).json({
      success: false,
      error:
        "SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set in Vercel Environment Variables.",
    });
    return;
  }

  const result = await handleSongSearchQuery(query, {
    SPOTIFY_CLIENT_ID: clientId,
    SPOTIFY_CLIENT_SECRET: clientSecret,
  });

  res.status(result.statusCode).json(result.body);
}
