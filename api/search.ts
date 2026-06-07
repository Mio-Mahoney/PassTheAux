import { handleSongSearchQuery } from "../src/lib/songSearchServer.ts";

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
  const query = url.searchParams.get("q") ?? "";
  const nodeProcess = (
    globalThis as unknown as {
      process?: { env: Record<string, string | undefined> };
    }
  ).process;

  const result = await handleSongSearchQuery(query, {
    SPOTIFY_CLIENT_ID: nodeProcess?.env.SPOTIFY_CLIENT_ID,
    SPOTIFY_CLIENT_SECRET: nodeProcess?.env.SPOTIFY_CLIENT_SECRET,
  });

  res.status(result.statusCode).json(result.body);
}
