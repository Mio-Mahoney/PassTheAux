import { useState } from "react";
import "./App.css";

import TitleScreen from "./screens/TitleScreen";
import MenuScreen from "./screens/MenuScreen";
import TutorialScreen from "./screens/TutorialScreen";
import ModeSelectionScreen from "./screens/ModeSelectionScreen";
import LobbyScreen from "./screens/LobbyScreen";

type Screen = "title" | "menu" | "tutorial" | "mode-selection" | "lobby";

function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("title");

  return (
    <div className="app">
      {currentScreen === "title" && (
        <TitleScreen onStart={() => setCurrentScreen("menu")} />
      )}

      {currentScreen === "menu" && (
        <MenuScreen
          onHost={() => setCurrentScreen("mode-selection")}
          onJoin={() => setCurrentScreen("lobby")}
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
          onContinue={() => setCurrentScreen("lobby")}
        />
      )}

      {currentScreen === "lobby" && (
        <LobbyScreen onBack={() => setCurrentScreen("menu")} />
      )}
    </div>
  );
}

export default App;