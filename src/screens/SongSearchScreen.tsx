import { useMemo, useState } from "react";
import "../styles/SongSearchStyle.css";
import type { Song } from "../types/song";
import { searchSong as fetchSongSearch } from "../lib/songSearch";

type SongSearchScreenProps = {
  onBack: () => void;
  onSubmitSong: (song: Song, prompt: string) => void;
};

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function SongSearchScreen({ onBack, onSubmitSong }: SongSearchScreenProps) {
  const [query, setQuery] = useState("");
  const [prompt, setPrompt] = useState("");
  const [song, setSong] = useState<Song | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const releaseYear = useMemo(
    () => song?.releaseDate.slice(0, 4) || "----",
    [song],
  );

  async function searchSong() {
    const cleanQuery = query.trim();

    if (!cleanQuery) {
      return;
    }

    setLoading(true);
    setError(null);
    setSong(null);

    try {
      const data = await fetchSongSearch(cleanQuery);

      if (!data.success || !data.song) {
        setError(data.error ?? "Could not find that song.");
        return;
      }

      setSong(data.song);
    } catch (searchError) {
      console.error(searchError);
      setError("Could not connect to the song search API.");
    } finally {
      setLoading(false);
    }
  }

  function submitSong() {
    const cleanPrompt = prompt.trim();

    if (!song || !cleanPrompt) {
      setError("Pick a song and write a prompt first.");
      return;
    }

    onSubmitSong(song, cleanPrompt);
  }

  return (
    <div className="song-search-screen">
      <div className="song-search-panel">
        <div className="song-search-top-row">
          <h1 className="song-search-title">Hotseat Song</h1>

          <button className="song-search-back-button" onClick={onBack}>
            <img src="/images/Back.png" alt="Back" />
          </button>
        </div>

        <div className="song-search-form">
          <input
            className="song-search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void searchSong();
              }
            }}
            placeholder="Search Spotify"
          />

          <button
            className="song-search-submit"
            disabled={loading}
            onClick={() => void searchSong()}
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>

        <input
          className="song-search-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Prompt it"
        />

        {error && <p className="song-search-error">{error}</p>}

        {song && (
          <div className="song-result">
            <div className="song-cover-frame">
              {song.albumCover ? (
                <img src={song.albumCover} alt={`${song.album} cover`} />
              ) : (
                <div className="song-cover-placeholder">No Cover</div>
              )}
            </div>

            <div className="song-result-details">
              <h2>{song.title}</h2>
              <p className="song-artist">{song.artist}</p>
              <p>{song.album}</p>
              <p>
                {releaseYear} / {formatDuration(song.durationMs)}
              </p>

              {song.previewUrl ? (
                <audio controls src={song.previewUrl} />
              ) : (
                <p className="song-no-preview">No Spotify preview available.</p>
              )}

              <a href={song.spotifyUrl} target="_blank" rel="noreferrer">
                Open in Spotify
              </a>

              <button className="song-search-start-round" onClick={submitSong}>
                Start Round
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SongSearchScreen;
