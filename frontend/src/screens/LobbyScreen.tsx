import { useEffect } from "react";
import "../styles/LobbyStyle.css";

import {
  makeRoomWebSocket,
  setReady,
  startRoom,
  type Room,
  type Player,
} from "../api/backend";

type LobbyScreenProps = {
  room: Room;
  currentPlayer: Player;
  onRoomUpdate: (room: Room) => void;
  onBack: () => void;
};

function LobbyScreen({
  room,
  currentPlayer,
  onRoomUpdate,
  onBack,
}: LobbyScreenProps) {
  useEffect(() => {
    const socket = makeRoomWebSocket(room.id);

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "snapshot") {
        onRoomUpdate(data.room);
      }

      if (data.type === "state_changed") {
        onRoomUpdate(data.room);
      }
    };

    socket.onerror = (error) => {
      console.error("Lobby websocket error:", error);
    };

    return () => {
      socket.close();
    };
  }, [room.id, onRoomUpdate]);

  const updatedCurrentPlayer = room.players.find(
    (player) => player.id === currentPlayer.id
  );

  async function handleReadyClick() {
    if (!updatedCurrentPlayer) return;

    try {
      const updatedRoom = await setReady(
        room.id,
        updatedCurrentPlayer.id,
        !updatedCurrentPlayer.is_ready
      );

      onRoomUpdate(updatedRoom);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Could not update ready.");
    }
  }

  async function handleStartClick() {
    if (!updatedCurrentPlayer) return;

    try {
      const updatedRoom = await startRoom(room.id, updatedCurrentPlayer.id);
      onRoomUpdate(updatedRoom);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Could not start game.");
    }
  }

  return (
    <div className="lobby-screen">
      <div className="lobby-content">
        <h1 className="lobby-title">Lobby</h1>

        <h2 className="lobby-code">Code: {room.join_code}</h2>

        <p className="lobby-count">
          Players: {room.players.length}/{room.max_players}
        </p>

        <div className="lobby-player-list">
          {room.players.map((player) => (
            <div className="lobby-player-card" key={player.id}>
              <span>{player.name}</span>

              <span>
                {player.is_host && "Host "}
                {player.is_ready ? "Ready" : "Not Ready"}
              </span>
            </div>
          ))}
        </div>

        <div className="lobby-buttons">
          <button onClick={handleReadyClick}>
            {updatedCurrentPlayer?.is_ready ? "Unready" : "Ready"}
          </button>

          {updatedCurrentPlayer?.is_host && (
            <button onClick={handleStartClick}>Start Game</button>
          )}

          <button onClick={onBack}>Leave</button>
        </div>
      </div>
    </div>
  );
}

export default LobbyScreen;