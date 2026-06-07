# PassTheAux

A social, multiplayer music party game built with SpacetimeDB and a React + Vite frontend. Players "pass the aux" to submit song clips, compete in rounds, and vote on the best submissions — all in real-time.

Key ideas

- Multiplayer rounds where one player (the DJ) shares a short song clip and other players rate or guess it.
- Song submissions can be queued and played in turn; players gain points from receiving high ratings.
- Lightweight lobby & room system: create or join rooms, set ready state, and start rounds together.
- Real-time data powered by SpacetimeDB: tables for players, rooms, songs, rounds, and ratings.

Features

- Create and join rooms with a display name.
- Submit songs (URLs or metadata) and queue them for a round.
- Start/advance rounds and auto-rotate DJs.
- Rate submissions and see a live leaderboard.
- Per-room chat and quick reactions (optional enhancements).

Quick start

Prerequisites

- Node.js 18+
- SpacetimeDB CLI (for running the local database and publishing modules)

Local development (recommended)

1. Install dependencies

```bash
npm install
```

2. Start a local SpacetimeDB server (in a separate terminal)

```bash
spacetime start
```

3. Run the client dev server

```bash
npm run dev
```

Open the app at http://localhost:5173

Developer notes

- Server module: spacetimedb/src/index.ts — add tables, reducers, and views for game logic.
- Generated bindings: module_bindings/ — keep bindings up-to-date when republishing the module.
- Client app entry: src/main.tsx and UI screens under src/screens/.
- Tables and reducers already modeled in module_bindings/ (see `room_table.ts`, `player_table.ts`, `song_submission_table.ts`, etc.).

Project structure (high-level)

- spacetimedb/: SpacetimeDB module (server tables, reducers, views)
- module_bindings/: Generated TypeScript bindings for typed client usage
- src/: React client app (screens, styles, types)
- public/: static assets and images

How it works (overview)

1. Players connect to a room and are added to a `player` table.
2. When players submit a song, a row is inserted in `song_submission_table`.
3. Reducers manage round lifecycle: `start_round`, `advance_round`, `submit_rating`, and scoring.
4. Clients subscribe to the relevant tables and react to updates (live leaderboard, queue state).

Extending the game

- Add per-room timers and auto-advance if the DJ is idle.
- Add support for previewing Spotify / YouTube clips (respecting CORS and licensing).
- Add private/public room options and password-protected rooms.
- Add bots for practice rounds or to seed the queue.

Future work

- Avatars & profiles: allow players to pick or upload avatars, support default emoji-style avatars, integrate with Gravatar or OAuth provider profile images, and cache/rescale images for performance. Add simple moderation (file size/type limits) and an option to use generated placeholder avatars to preserve privacy.
- Analytics & song data: record anonymous events and song metadata to a dedicated analytics table (plays, ratings, skips, timestamps). Build aggregate views for song popularity, rating distributions, round-level summaries, and per-room statistics. Use these to power a dashboard showing top songs, trending tracks, and player engagement metrics.
- Privacy & opt-in: provide an opt-in toggle for analytics, store only non-identifying aggregates by default, and add export / retention settings.
- UX enhancements: richer avatars (animated or SVG), profile bios, customizable room themes, and accessibility improvements.
- Integrations: add Spotify/YouTube metadata enrichment, shareable room links, and social sharing for high scores.

Contributing

1. Fork the repo and create a feature branch.
2. Update or add unit tests where relevant.
3. Open a pull request with a clear description and screenshots if UI changes are included.

License

This project is provided under the terms of the repository license.

Contact

If you'd like help building features or setting up the development environment, open an issue or ping in the repo.
