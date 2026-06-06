# PassTheAux backend (MVP scaffold)

This folder contains a minimal scaffold for the SpaceTimeDB/Rust backend used by the PassTheAux frontend.

## Quickstart

1. Install Rust (stable channel): https://www.rust-lang.org/tools/install
2. Change into the backend folder:

   ```bash
   cd back
   ```

3. Run unit tests:

   ```bash
   cargo test
   ```

## Notes

- This scaffold implements data models and a few basic lobby functions (`create_room`, `join_room`, `set_player_ready`, `start_game`).
- For a complete MVP you'll implement SpaceTimeDB reducers and the Spotify proxy endpoints described in the project docs.
- Put Spotify credentials and any publish token in environment variables or SpaceTimeDB secrets as appropriate.
