import { useState } from "react";
import "./App.css";

import TitleScreen from "./screens/TitleScreen";
import MenuScreen from "./screens/MenuScreen";
import TutorialScreen from "./screens/TutorialScreen";
import ModeSelectionScreen from "./screens/ModeSelectionScreen";
import LobbyScreen from "./screens/LobbyScreen";
import JoinScreen from "./screens/JoinScreen";

import {
  createRoom,
  joinRoom,
  leaveRoom,
  type Room,
  type Player,
} from "./api/backend";

type Screen = "title" | "menu" | "tutorial" | "mode-selection" | "lobby" | "join";

function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("title");
  const [room, setRoom] = useState<Room | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);

  async function handleCreateLobby() {
    const hostName = prompt("Enter your name:");

    if (!hostName || !hostName.trim()) {
      return;
    }

    try {
      const newRoom = await createRoom(hostName.trim());

      setRoom(newRoom);
      setCurrentPlayer(newRoom.players[0]);
      setCurrentScreen("lobby");
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Could not create lobby.");
    }
  }

  async function handleJoinLobby(lobbyCode: string) {
    const playerName = prompt("Enter your name:");

    if (!playerName || !playerName.trim()) {
      return;
    }

    try {
      const result = await joinRoom(lobbyCode, playerName.trim());

      setRoom(result.room);
      setCurrentPlayer(result.player);
      setCurrentScreen("lobby");
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Could not join lobby.");
    }
  }

  async function handleLeaveLobby() {
    if (room && currentPlayer) {
      try {
        await leaveRoom(room.id, currentPlayer.id);
      } catch (error) {
        console.error(error);
      }
    }

    setRoom(null);
    setCurrentPlayer(null);
    setCurrentScreen("menu");
  }

  return (
    <div className="app">
      {currentScreen === "title" && (
        <TitleScreen onStart={() => setCurrentScreen("menu")} />
      )}

      {currentScreen === "menu" && (
        <MenuScreen
          onHost={() => setCurrentScreen("mode-selection")}
          onJoin={() => setCurrentScreen("join")}
          onHowToPlay={() => setCurrentScreen("tutorial")}
          onBackToTitle={() => setCurrentScreen("title")}
        />
      )}

      {currentScreen === "tutorial" && (
        <TutorialScreen onBack={() => setCurrentScreen("menu")} />
      )}

      {currentScreen === "mode-selection" && (
        <ModeSelectionScreen
          onBack={() => setCurrentScreen("menu")}
          onContinue={handleCreateLobby}
        />
      )}

      {currentScreen === "join" && (
        <JoinScreen
          onJoinLobby={handleJoinLobby}
          onBack={() => setCurrentScreen("menu")}
        />
      )}

      {currentScreen === "lobby" && room && currentPlayer && (
        <LobbyScreen
          room={room}
          currentPlayer={currentPlayer}
          onRoomUpdate={setRoom}
          onBack={handleLeaveLobby}
        />
      )}
    </div>
  );
}

export default App;