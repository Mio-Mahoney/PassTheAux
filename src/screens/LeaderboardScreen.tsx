import "../styles/LeaderboardStyle.css";
import type { Player } from "../types/lobby";

export type SongScore = {
  id: string;
  title: string;
  artist: string;
  playerName: string;
  averageScore: number;
  ratingCount: number;
};

type LeaderboardScreenProps = {
  title: string;
  subtitle: string;
  songScores: SongScore[];
  players: Player[];
  currentPlayerIsHotseat: boolean;
  actionLabel: string;
  onAction: () => void;
  onBack: () => void;
};

function formatScore(score: number) {
  return (score / 10).toFixed(1);
}

function LeaderboardScreen({
  title,
  subtitle,
  songScores,
  players,
  currentPlayerIsHotseat,
  actionLabel,
  onAction,
  onBack,
}: LeaderboardScreenProps) {
  const sortedPlayers = [...players].sort((left, right) => right.score - left.score);

  return (
    <div className="leaderboard-screen">
      <div className="leaderboard-panel">
        <div className="leaderboard-top-row">
          <div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>

          <button className="leaderboard-back-button" onClick={onBack}>
            <img src="/images/Back.png" alt="Back" />
          </button>
        </div>

        <div className="leaderboard-grid">
          <section>
            <h2>Song Board</h2>

            <div className="leaderboard-list">
              {songScores.map((song, index) => (
                <div className="leaderboard-row" key={song.id}>
                  <span>{index + 1}</span>
                  <span>
                    {song.title} - {song.artist}
                    <small>{song.playerName}</small>
                  </span>
                  <strong>
                    {formatScore(song.averageScore)}
                    <small>{song.ratingCount} ratings</small>
                  </strong>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2>Player Board</h2>

            <div className="leaderboard-list">
              {sortedPlayers.map((player, index) => (
                <div className="leaderboard-row" key={player.id}>
                  <span>{index + 1}</span>
                  <span>
                    {player.name}
                    <small>{player.is_hotseat ? "Hotseat" : "Player"}</small>
                  </span>
                  <strong>{formatScore(player.score)}</strong>
                </div>
              ))}
            </div>
          </section>
        </div>

        {currentPlayerIsHotseat && (
          <button className="leaderboard-action" onClick={onAction}>
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export default LeaderboardScreen;
