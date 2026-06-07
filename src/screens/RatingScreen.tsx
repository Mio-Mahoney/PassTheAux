import { useMemo, useState } from "react";
import "../styles/RatingStyle.css";
import type { Song, SongSearchResponse } from "../types/song";

type RatingScreenProps = {
  song: Song;
  prompt: string;
  ratingsSubmitted: number;
  playerCount: number;
  currentPlayerRated: boolean;
  currentPlayerHasSubmittedSong: boolean;
  secondsRemaining: number;
  canAdvance: boolean;
  onSubmitRating: (score: number) => void;
  onSubmitQueuedSong: (song: Song) => void;
  onAdvanceRound: () => void;
  onBack: () => void;
};

function RatingScreen({
  song,
  prompt,
  ratingsSubmitted,
  playerCount,
  currentPlayerRated,
  currentPlayerHasSubmittedSong,
  secondsRemaining,
  canAdvance,
  onSubmitRating,
  onSubmitQueuedSong,
  onAdvanceRound,
  onBack,
}: RatingScreenProps) {
  const [score, setScore] = useState(5);
  const [query, setQuery] = useState("");
  const [queuedSong, setQueuedSong] = useState<Song | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const timerLabel = useMemo(
    () => `${Math.max(0, secondsRemaining).toString().padStart(2, "0")}s`,
    [secondsRemaining],
  );

  async function searchQueuedSong() {
    const cleanQuery = query.trim();

    if (!cleanQuery) {
      return;
    }

    setQueueLoading(true);
    setQueueError(null);
    setQueuedSong(null);

    try {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(cleanQuery)}`,
      );
      const data = (await response.json()) as SongSearchResponse;

      if (!data.success || !data.song) {
        setQueueError(data.error ?? "Could not find that song.");
        return;
      }

      setQueuedSong(data.song);
    } catch (error) {
      console.error(error);
      setQueueError("Could not connect to the song search API.");
    } finally {
      setQueueLoading(false);
    }
  }

  function submitQueuedSong() {
    if (!queuedSong) {
      setQueueError("Search for a song first.");
      return;
    }

    onSubmitQueuedSong(queuedSong);
    setQueuedSong(null);
    setQuery("");
  }

  return (
    <div className="rating-screen">
      <div className="rating-panel">
        <div className="rating-top-row">
          <div>
            <p className="rating-round-label">Prompt</p>
            <h1 className="rating-prompt">{prompt}</h1>
          </div>

          <button className="rating-back-button" onClick={onBack}>
            <img src="/images/Back.png" alt="Back" />
          </button>
        </div>

        <div className="rating-content">
          <div className="rating-cover-frame">
            {song.albumCover ? (
              <img src={song.albumCover} alt={`${song.album} cover`} />
            ) : (
              <div className="rating-cover-placeholder">No Cover</div>
            )}
          </div>

          <div className="rating-details">
            <h2>{song.title}</h2>
            <p className="rating-artist">{song.artist}</p>
            <p>{song.album}</p>
            <p className="rating-timer">Next song in {timerLabel}</p>

            {song.previewUrl ? (
              <audio controls src={song.previewUrl} />
            ) : (
              <p className="rating-no-preview">No Spotify preview available.</p>
            )}

            <div className="rating-meter">
              <div className="rating-meter-top">
                <span>Rate it</span>
                <strong>{score.toFixed(1)}</strong>
              </div>

              <input
                type="range"
                min="0"
                max="10"
                step="0.1"
                value={score}
                disabled={currentPlayerRated}
                onChange={(event) => setScore(Number(event.target.value))}
              />
            </div>

            <button
              className="rating-submit"
              disabled={currentPlayerRated}
              onClick={() => onSubmitRating(score)}
            >
              {currentPlayerRated ? "Rating Saved" : "Submit Rating"}
            </button>

            <p className="rating-count">
              {ratingsSubmitted} / {playerCount} players rated
            </p>

            {canAdvance && (
              <button className="rating-submit" onClick={onAdvanceRound}>
                Next Song
              </button>
            )}
          </div>
        </div>

        <div className="queue-panel">
          <h2>Queue Your Song</h2>

          {currentPlayerHasSubmittedSong ? (
            <p className="queue-status">Your song is in this round.</p>
          ) : (
            <>
              <div className="queue-search-form">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void searchQueuedSong();
                    }
                  }}
                  placeholder="Search your song"
                />

                <button
                  disabled={queueLoading}
                  onClick={() => void searchQueuedSong()}
                >
                  {queueLoading ? "Searching..." : "Search"}
                </button>
              </div>

              {queueError && <p className="queue-error">{queueError}</p>}

              {queuedSong && (
                <div className="queue-song-card">
                  <span>
                    {queuedSong.title} - {queuedSong.artist}
                  </span>

                  <button onClick={submitQueuedSong}>Add To Queue</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default RatingScreen;
