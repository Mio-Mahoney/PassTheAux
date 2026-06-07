import "../styles/LobbyStyle.css";
import type { Player, Room } from "../types/lobby";

type LobbyScreenProps = {
  room: Room;
  currentPlayer: Player;
  onReadyToggle: () => void;
  onStartGame: () => void;
  onBack: () => void;
};

function LobbyScreen({
  room,
  currentPlayer,
  onReadyToggle,
  onStartGame,
  onBack,
}: LobbyScreenProps) {
  const updatedCurrentPlayer = room.players.find(
    (player) => player.id === currentPlayer.id,
  );

  return (
    <div className="lobby-screen">
      <div className="lobby-content">
        <h1 className="lobby-title">Lobby</h1>

        <h2 className="lobby-code">Code: {room.join_code}</h2>

        <p className="lobby-count">
          Players: {room.players.length}/{room.max_players}
        </p>

        <p className="lobby-count">Rounds: {room.total_rounds}</p>

        <div className="lobby-player-list">
          {room.players.map((player) => (
            <div className="lobby-player-card" key={player.id}>
              <span>{player.name}</span>

              <span>
                {player.is_host && "Host "}
                {player.is_hotseat && "Hotseat "}
                {player.is_ready ? "Ready" : "Not Ready"}
              </span>

              <span>{(player.score / 10).toFixed(1)} pts</span>
            </div>
          ))}
        </div>

        <div className="lobby-buttons">
          <button onClick={onReadyToggle}>
            {updatedCurrentPlayer?.is_ready ? "Unready" : "Ready"}
          </button>

          {updatedCurrentPlayer?.is_host && (
            <button onClick={onStartGame}>Start Game</button>
          )}

          <button onClick={onBack}>Leave</button>
        </div>
      </div>
    </div>
  );
}

export default LobbyScreen;
