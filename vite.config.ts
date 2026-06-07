import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { handleSongSearchQuery } from "./src/lib/songSearchServer.ts";

function spotifySearchPlugin(env: Record<string, string>): Plugin {
  return {
    name: "passtheaux-spotify-search",
    configureServer(server) {
      server.middlewares.use("/api/search", async (req, res) => {
        const request = req as unknown as { method?: string; url?: string };

        if (request.method !== "GET") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({ success: false, error: "Method not allowed." }),
          );
          return;
        }

        const url = new URL(request.url ?? "", "http://localhost");
        const q = url.searchParams.get("q")?.trim();

        if (!q) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ success: false, error: "Query required." }));
          return;
        }

        void handleSongSearchQuery(q, env)
          .then(({ statusCode, body }) => {
            res.statusCode = statusCode;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(body));
          })
          .catch((error: unknown) => {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                success: false,
                error:
                  error instanceof Error
                    ? error.message
                    : "Could not search songs.",
              }),
            );
          });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");

  return {
    base: "./",
    plugins: [react(), spotifySearchPlugin(env)],
  };
});
